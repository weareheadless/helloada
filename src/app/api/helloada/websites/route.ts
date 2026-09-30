import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { registerWebsiteTenant, startWebsiteBootstrap } from '@/lib/website'

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
  return slug || 'website'
}

const bootstrapSteps = ['requested', 'creating_repository', 'creating_worker', 'creating_data', 'deploying_shell', 'ready', 'needs_attention'] as const
type BootstrapStep = typeof bootstrapSteps[number]

function asBootstrapStep(value: string): BootstrapStep {
  return (bootstrapSteps as readonly string[]).includes(value) ? value as BootstrapStep : 'needs_attention'
}

export async function POST(request: Request) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { name?: string }
  const name = String(body.name || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  const baseSlug = slugify(name)
  const existing = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: { slug: { like: baseSlug } },
    limit: 100,
  })
  const suffix = existing.docs.length ? `-${existing.docs.length + 1}` : ''
  const website = await auth.payload.create({
    collection: 'websites',
    req: auth.req,
    data: { name, slug: `${baseSlug}${suffix}`, tenantId: `${baseSlug}${suffix}`, owner: auth.user.id, phase: 'intake', domainStatus: 'not_connected' },
  })
  const bootstrapJob = await auth.payload.create({
    collection: 'bootstrap-jobs',
    req: auth.req,
    data: { website: website.id, step: 'requested', status: 'queued', retries: 0, resourceReceipts: {}, diagnostic: '' },
  })

  // Registration is deliberately the only local bootstrap action performed by
  // website creation. External GitHub/Cloudflare provisioning remains a later,
  // explicitly-authorized step. A failed site-agent connection is recorded on
  // the durable job rather than losing the website record or hiding the error.
  const registrationResponse = await registerWebsiteTenant(String(website.tenantId), name)
  const registration = await registrationResponse.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    detail?: string
    error?: string
  }
  if (registrationResponse.ok) {
    const registeredTenantId = String(registration.tenant_id || website.tenantId || baseSlug)
    const bootstrapResponse = await startWebsiteBootstrap(registeredTenantId, name)
    const bootstrap = await bootstrapResponse.json().catch(() => ({})) as {
      status?: string
      step?: string
      diagnostic?: string
      resource_receipts?: Record<string, unknown>
    }
    const bootstrapStatus = String(bootstrap.status || (bootstrapResponse.ok ? 'queued' : 'failed'))
    const bootstrapStep = asBootstrapStep(String(bootstrap.step || (bootstrapStatus === 'failed' ? 'needs_attention' : 'requested')))
    const bootstrapFailed = bootstrapStatus === 'failed' || bootstrapStep === 'needs_attention'
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      data: { tenantId: registeredTenantId },
    })
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: bootstrapJob.id,
      req: auth.req,
      data: {
        step: bootstrapStep,
        status: bootstrapFailed ? 'failed' : bootstrapStatus === 'done' ? 'done' : 'running',
        resourceReceipts: {
          tenant: {
            tenantId: registeredTenantId,
            status: registration.status || 'ready',
            schemaVersion: registration.schema_version || null,
          },
          bootstrap: bootstrap.resource_receipts || {},
        },
        diagnostic: String(bootstrap.diagnostic || '').slice(0, 500),
      },
    })
    if (bootstrapFailed) {
      await auth.payload.update({
        collection: 'websites',
        id: website.id,
        req: auth.req,
        data: { phase: 'needs_attention' },
      })
    }
  } else {
    const diagnostic = String(registration.detail || registration.error || 'The site workspace could not be registered').slice(0, 500)
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: bootstrapJob.id,
      req: auth.req,
      data: { step: 'needs_attention', status: 'failed', diagnostic },
    })
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      data: { phase: 'needs_attention' },
    })
  }

  return NextResponse.json({
    id: website.id,
    phase: registrationResponse.ok ? website.phase : 'needs_attention',
    tenantId: registration.tenant_id || website.tenantId,
    bootstrapJobId: bootstrapJob.id,
    bootstrapStatus: registrationResponse.ok ? 'queued' : 'failed',
  }, { status: 201 })
}
