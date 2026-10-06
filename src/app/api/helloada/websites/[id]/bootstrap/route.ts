import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { ownedWebsite, startWebsiteBootstrap, websiteBootstrapStatus } from '@/lib/website'

const stepLabels: Record<string, string> = {
  requested: 'Opening your workspace',
  creating_repository: 'Preparing the website',
  creating_worker: 'Connecting the website services',
  creating_data: 'Preparing private website data',
  deploying_shell: 'Making the Payload admin ready',
  ready: 'Your Payload admin is ready',
  needs_attention: 'Workspace needs attention',
}
const validSteps = new Set(Object.keys(stepLabels))
const validStatuses = new Set(['queued', 'running', 'awaiting_release', 'done', 'failed'])
const sensitiveKey = /(secret|token|password|credential|api[_-]?key)/i

function publicReceipt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicReceipt)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => sensitiveKey.test(key) ? [] : [[key, publicReceipt(item)]]),
  )
}

function workerUrlFrom(receipts: Record<string, unknown>) {
  const worker = receipts.creating_worker
  if (!worker || typeof worker !== 'object') return null
  const value = (worker as { worker_url?: unknown }).worker_url
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function localRegistrationFailure(job: Record<string, unknown> | undefined) {
  if (job?.status !== 'failed') return false
  const receipts = job.resourceReceipts
  return !receipts || typeof receipts !== 'object' || !('tenant' in receipts)
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
  const job = jobs.docs[0] as Record<string, unknown> | undefined
  if (!website.tenantId) return NextResponse.json({ error: 'tenant_identity_missing' }, { status: 409 })

  const remoteResponse = await websiteBootstrapStatus(String(website.tenantId))
  if (!remoteResponse.ok) {
    if (localRegistrationFailure(job)) {
      return NextResponse.json({
        website: { id: website.id, adminUrl: null },
        bootstrap: {
          id: job?.id,
          status: 'failed',
          step: 'needs_attention',
          label: stepLabels.needs_attention,
          workspaceReady: false,
          diagnostic: String(job?.diagnostic || ''),
        },
      }, { headers: { 'cache-control': 'no-store' } })
    }
    return NextResponse.json({ error: 'site_agent_status_unavailable' }, { status: 502 })
  }

  const remote = await remoteResponse.json().catch(() => null) as Record<string, unknown> | null
  if (!remote || typeof remote !== 'object') {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid' }, { status: 502 })
  }
  const status = String(remote.status || '')
  const step = String(remote.step || '')
  if (!validStatuses.has(status) || !validSteps.has(step) || typeof remote.workspace_ready !== 'boolean') {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid', status, step }, { status: 502 })
  }
  const receipts = remote.resource_receipts && typeof remote.resource_receipts === 'object'
    ? remote.resource_receipts as Record<string, unknown>
    : {}
  const workerUrl = workerUrlFrom(receipts)
  const workspaceReady = remote.workspace_ready === true
  const adminUrl = workspaceReady
    ? tenantAdminUrl(website.adminUrl || (workerUrl ? workerUrl.replace(/\/$/, '') + '/admin' : null))
    : null
  if (workspaceReady && !adminUrl) {
    return NextResponse.json({ error: 'verified_admin_origin_missing' }, { status: 502 })
  }

  if (workspaceReady && adminUrl) {
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      data: {
        workerUrl: workerUrl || undefined,
        adminUrl,
      },
    })
  }

  return NextResponse.json({
    website: {
      id: website.id,
      phase: website.phase,
      workerUrl,
      adminUrl,
      tenantId: website.tenantId,
    },
    bootstrap: {
      id: job?.id || null,
      status,
      step,
      label: stepLabels[step],
      workspaceReady,
      websiteLive: remote.website_live === true,
      retries: Number(job?.retries || 0),
      diagnostic: String(remote.diagnostic || job?.diagnostic || ''),
      resourceReceipts: publicReceipt(receipts),
      updatedAt: remote.updated_at || job?.updatedAt || null,
    },
  }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ error: 'tenant_identity_missing' }, { status: 409 })

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

  const response = await startWebsiteBootstrap(String(website.tenantId), String(website.name || website.tenantId))
  const state = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !state) {
    const diagnostic = String(state?.detail || state?.diagnostic || 'The canonical bootstrap could not be resumed.').slice(0, 500)
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: job.id,
      req: auth.req,
      data: { step: 'needs_attention', status: 'failed', retries: Number(job.retries || 0) + 1, diagnostic },
    })
    return NextResponse.json({ error: 'bootstrap_retry_failed' }, { status: 502 })
  }
  const status = String(state.status || '')
  const step = String(state.step || '')
  if (
    state.tenant_id !== website.tenantId
    || !validStatuses.has(status)
    || !validSteps.has(step)
    || typeof state.workspace_ready !== 'boolean'
  ) {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid' }, { status: 502 })
  }
  const receipts = state.resource_receipts && typeof state.resource_receipts === 'object'
    ? state.resource_receipts as Record<string, unknown>
    : {}
  const workerUrl = workerUrlFrom(receipts)
  const failed = status === 'failed'
  await auth.payload.update({
    collection: 'bootstrap-jobs',
    id: job.id,
    req: auth.req,
    data: {
      step,
      status: failed ? 'failed' : status === 'done' ? 'done' : 'running',
      retries: Number(job.retries || 0) + 1,
      resourceReceipts: publicReceipt(receipts),
      diagnostic: String(state.diagnostic || '').slice(0, 500),
    },
  })
  await auth.payload.update({
    collection: 'websites',
    id: website.id,
    req: auth.req,
    data: {
      phase: failed ? 'needs_attention' : 'intake',
      workerUrl: workerUrl || undefined,
      adminUrl: state.workspace_ready === true && workerUrl ? tenantAdminUrl(workerUrl.replace(/\/$/, '') + '/admin') || undefined : undefined,
    },
  })
  return NextResponse.json({ ok: true, status, step }, { status: status === 'done' ? 200 : 202 })
}
