import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { registerWebsiteTenant, startWebsiteBootstrap } from '@/lib/website'

const validSteps = new Set(['requested', 'creating_repository', 'creating_worker', 'creating_data', 'deploying_shell', 'ready', 'needs_attention'])
const validStatuses = new Set(['queued', 'running', 'awaiting_release', 'done', 'failed'])

function slugify(value: string) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const safe = /^[a-z]/.test(base) ? base : 'site-' + base
  return (safe.slice(0, 45).replace(/-+$/, '') || 'website')
}

async function websiteIdentity(ownerId: string, requestKey: string, name: string) {
  const bytes = new TextEncoder().encode(ownerId + '\n' + requestKey)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const suffix = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('').slice(0, 16)
  const tenantId = slugify(name) + '-' + suffix
  return { tenantId, slug: tenantId }
}

async function findOwnerWebsite(auth: NonNullable<Awaited<ReturnType<typeof currentUser>>>, tenantId: string) {
  const result = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: {
      and: [
        { tenantId: { equals: tenantId } },
        { owner: { equals: auth.user.id } },
      ],
    },
    limit: 1,
    depth: 0,
  })
  return result.docs[0]
}

export async function POST(request: Request) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

  const requestKey = request.headers.get('idempotency-key')?.trim() || ''
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 })
  }
  const body = await request.json().catch(() => null) as { name?: string } | null
  const name = String(body?.name || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  const identity = await websiteIdentity(String(auth.user.id), requestKey, name)
  let website = await findOwnerWebsite(auth, identity.tenantId)
  if (website && String(website.name || '') !== name) {
    return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 })
  }
  if (!website) {
    try {
      website = await auth.payload.create({
        collection: 'websites',
        req: auth.req,
        data: {
          name,
          slug: identity.slug,
          tenantId: identity.tenantId,
          owner: auth.user.id,
          phase: 'intake',
          domainStatus: 'not_connected',
        },
      })
    } catch (error) {
      website = await findOwnerWebsite(auth, identity.tenantId)
      if (!website) throw error
      if (String(website.name || '') !== name) {
        return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 })
      }
    }
  }

  const existingJobs = await auth.payload.find({
    collection: 'bootstrap-jobs',
    req: auth.req,
    where: { website: { equals: website.id } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
  })
  const bootstrapJob = existingJobs.docs[0] || await auth.payload.create({
    collection: 'bootstrap-jobs',
    req: auth.req,
    data: { website: website.id, step: 'requested', status: 'queued', retries: 0, resourceReceipts: {}, diagnostic: '' },
  })

  const registrationResponse = await registerWebsiteTenant(identity.tenantId, name)
  const registration = await registrationResponse.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    detail?: string
    error?: string
  }
  if (!registrationResponse.ok || registration.tenant_id !== identity.tenantId) {
    const diagnostic = registrationResponse.ok
      ? 'Site-agent returned a different tenant identity.'
      : String(registration.detail || registration.error || 'The tenant could not be registered.').slice(0, 500)
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
    return NextResponse.json({ id: website.id, error: 'tenant_registration_failed' }, { status: 201 })
  }

  const bootstrapResponse = await startWebsiteBootstrap(identity.tenantId, name)
  const bootstrap = await bootstrapResponse.json().catch(() => ({})) as {
    tenant_id?: string
    status?: string
    step?: string
    diagnostic?: string
    workspace_ready?: boolean
    resource_receipts?: Record<string, unknown>
  }
  const remoteStep = String(bootstrap.step || '')
  const remoteStatus = String(bootstrap.status || '')
  const contractValid = bootstrapResponse.ok
    && bootstrap.tenant_id === identity.tenantId
    && validSteps.has(remoteStep)
    && validStatuses.has(remoteStatus)
    && typeof bootstrap.workspace_ready === 'boolean'
  if (!contractValid) {
    const diagnostic = bootstrapResponse.ok
      ? 'Site-agent returned an invalid bootstrap contract.'
      : String(bootstrap.diagnostic || 'The canonical bootstrap could not start.').slice(0, 500)
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
    return NextResponse.json({ id: website.id, error: 'bootstrap_contract_failed' }, { status: 201 })
  }

  const workerReceipt = bootstrap.resource_receipts?.creating_worker as { worker_url?: string } | undefined
  const workerUrl = String(workerReceipt?.worker_url || '')
  const failed = remoteStatus === 'failed'
  await auth.payload.update({
    collection: 'bootstrap-jobs',
    id: bootstrapJob.id,
    req: auth.req,
    data: {
      step: remoteStep,
      status: failed ? 'failed' : remoteStatus === 'done' ? 'done' : 'running',
      resourceReceipts: {
        tenant: { tenantId: identity.tenantId, schemaVersion: registration.schema_version || null },
        bootstrap: bootstrap.resource_receipts || {},
      },
      diagnostic: String(bootstrap.diagnostic || '').slice(0, 500),
    },
  })
  await auth.payload.update({
    collection: 'websites',
    id: website.id,
    req: auth.req,
    data: {
      phase: failed ? 'needs_attention' : 'intake',
      workerUrl: workerUrl || undefined,
      adminUrl: bootstrap.workspace_ready && workerUrl ? workerUrl.replace(/\/$/, '') + '/admin' : undefined,
    },
  })

  return NextResponse.json({
    id: website.id,
    phase: failed ? 'needs_attention' : 'intake',
    tenantId: identity.tenantId,
    bootstrapJobId: bootstrapJob.id,
    bootstrapStatus: remoteStatus,
  }, { status: 201 })
}
