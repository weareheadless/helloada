import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, registerWebsiteTenant } from '@/lib/website'

const SENSITIVE_KEY = /(secret|token|password|credential|api[_-]?key)/i

function publicReceipt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicReceipt)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => SENSITIVE_KEY.test(key) ? [] : [[key, publicReceipt(item)]]),
  )
}

const stepLabels: Record<string, string> = {
  requested: 'Opening your workspace',
  creating_repository: 'Preparing the website',
  creating_worker: 'Connecting the live preview',
  creating_data: 'Preparing private website data',
  deploying_shell: 'Publishing the first shell',
  ready: 'Workspace ready',
  needs_attention: 'Workspace needs attention',
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })

  const jobs = await auth.payload.find({
    collection: 'bootstrap-jobs',
    req: auth.req,
    where: { website: { equals: website.id } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
  })
  const job = jobs.docs[0]
  const status = String(job?.status || 'queued')
  const step = String(job?.step || 'requested')

  return NextResponse.json({
    website: {
      id: website.id,
      phase: website.phase,
      workerUrl: website.workerUrl || null,
      adminUrl: website.adminUrl || null,
      tenantId: website.tenantId || null,
    },
    bootstrap: job ? {
      id: job.id,
      status,
      step,
      retries: Number(job.retries || 0),
      label: stepLabels[step] || 'Preparing your workspace',
      diagnostic: job.diagnostic || '',
      resourceReceipts: publicReceipt(job.resourceReceipts || {}),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    } : {
      id: null,
      status: 'queued',
      step: 'requested',
      retries: 0,
      label: stepLabels.requested,
      diagnostic: '',
      resourceReceipts: {},
    },
  }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })

  const jobs = await auth.payload.find({
    collection: 'bootstrap-jobs',
    req: auth.req,
    where: { website: { equals: website.id } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
  })
  const job = jobs.docs[0] || await auth.payload.create({
    collection: 'bootstrap-jobs',
    req: auth.req,
    data: { website: website.id, step: 'requested', status: 'queued', retries: 0, resourceReceipts: {}, diagnostic: '' },
  })
  const retries = Number(job.retries || 0) + 1
  await auth.payload.update({
    collection: 'bootstrap-jobs',
    id: job.id,
    req: auth.req,
    data: { step: 'creating_data', status: 'running', retries, diagnostic: '' },
  })

  const response = await registerWebsiteTenant(String(website.tenantId), String(website.name || website.tenantId))
  const registration = await response.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    detail?: string
    error?: string
  }
  if (response.ok) {
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: job.id,
      req: auth.req,
      data: {
        step: 'ready',
        status: 'done',
        resourceReceipts: {
          tenant: {
            tenantId: registration.tenant_id || website.tenantId,
            status: registration.status || 'ready',
            schemaVersion: registration.schema_version || null,
          },
        },
        diagnostic: '',
      },
    })
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      data: { phase: 'intake' },
    })
  } else {
    const diagnostic = String(registration.detail || registration.error || 'The site workspace could not be registered').slice(0, 500)
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: job.id,
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
    ok: response.ok,
    bootstrapJobId: job.id,
    status: response.ok ? 'done' : 'failed',
    diagnostic: response.ok ? '' : String(registration.detail || registration.error || 'The site workspace could not be registered').slice(0, 500),
  }, { status: response.ok ? 200 : 502 })
}
