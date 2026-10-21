import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { bootstrapStepLabels, isBootstrapStatus, isBootstrapStep } from '@/lib/bootstrap-contract'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { ownedWebsite, startWebsiteBootstrap, websiteBootstrapStatus } from '@/lib/website'

function workerUrlFrom(receipts: Record<string, unknown>) {
  const worker = receipts.creating_worker
  if (!worker || typeof worker !== 'object') return null
  const value = (worker as { worker_url?: unknown }).worker_url
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function receiptAdminUrl(workerUrl: string | null) {
  if (!workerUrl) return null
  return tenantAdminUrl(workerUrl.replace(/\/$/, '') + '/admin')
}

function verifiedAdminUrl(websiteUrl: unknown, workerUrl: string | null) {
  const fromReceipt = receiptAdminUrl(workerUrl)
  const recorded = tenantAdminUrl(websiteUrl)
  if (recorded && fromReceipt && recorded !== fromReceipt) return null
  return fromReceipt
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
  if (!website.tenantId) return NextResponse.json({ error: 'tenant_identity_missing' }, { status: 409 })

  const remoteResponse = await websiteBootstrapStatus(String(website.tenantId))
  if (!remoteResponse.ok) {
    return NextResponse.json({ error: 'site_agent_status_unavailable' }, { status: 502 })
  }

  const remote = await remoteResponse.json().catch(() => null) as Record<string, unknown> | null
  if (!remote || typeof remote !== 'object') {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid' }, { status: 502 })
  }
  const status = String(remote.status || '')
  const step = String(remote.step || '')
  if (
    remote.tenant_id !== website.tenantId
    || !isBootstrapStatus(status)
    || !isBootstrapStep(step)
    || typeof remote.workspace_ready !== 'boolean'
    || typeof remote.website_live !== 'boolean'
  ) {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid' }, { status: 502 })
  }
  const receipts = remote.resource_receipts && typeof remote.resource_receipts === 'object'
    ? remote.resource_receipts as Record<string, unknown>
    : {}
  const workerUrl = workerUrlFrom(receipts)
  const workspaceReady = remote.workspace_ready === true
  const adminUrl = workspaceReady ? verifiedAdminUrl(website.adminUrl, workerUrl) : null
  if (workspaceReady && !adminUrl) {
    return NextResponse.json({ error: 'verified_admin_origin_missing_or_mismatched' }, { status: 502 })
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
      adminUrl,
    },
    bootstrap: {
      id: job?.id || null,
      status,
      step,
      label: bootstrapStepLabels[step],
      workspaceReady,
      websiteLive: remote.website_live,
      retries: Number(job?.retries || 0),
      updatedAt: remote.updated_at || job?.updatedAt || null,
      diagnostic: typeof remote.diagnostic === 'string' ? remote.diagnostic : '',
      steps: remote.steps,
      release: remote.release_progress,
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
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: job.id,
      req: auth.req,
      data: { step: 'needs_attention', status: 'failed', retries: Number(job.retries || 0) + 1 },
    })
    return NextResponse.json({ error: 'bootstrap_retry_failed' }, { status: 502 })
  }
  const status = String(state.status || '')
  const step = String(state.step || '')
  if (
    state.tenant_id !== website.tenantId
    || !isBootstrapStatus(status)
    || !isBootstrapStep(step)
    || typeof state.workspace_ready !== 'boolean'
    || typeof state.website_live !== 'boolean'
  ) {
    return NextResponse.json({ error: 'site_agent_status_contract_invalid' }, { status: 502 })
  }
  const receipts = state.resource_receipts && typeof state.resource_receipts === 'object'
    ? state.resource_receipts as Record<string, unknown>
    : {}
  const workerUrl = workerUrlFrom(receipts)
  const adminUrl = state.workspace_ready === true ? verifiedAdminUrl(website.adminUrl, workerUrl) : null
  if (state.workspace_ready === true && !adminUrl) {
    return NextResponse.json({ error: 'verified_admin_origin_missing_or_mismatched' }, { status: 502 })
  }
  const failed = status === 'failed'
  await auth.payload.update({
    collection: 'bootstrap-jobs',
    id: job.id,
    req: auth.req,
    data: {
      step,
      status: failed ? 'failed' : status === 'done' ? 'done' : 'running',
      retries: Number(job.retries || 0) + 1,
      diagnostic: '',
    },
  })
  await auth.payload.update({
    collection: 'websites',
    id: website.id,
    req: auth.req,
    data: {
      phase: failed ? 'needs_attention' : 'intake',
      workerUrl: workerUrl || undefined,
      adminUrl: adminUrl || undefined,
    },
  })
  return NextResponse.json({ ok: true, status, step }, { status: status === 'done' ? 200 : 202 })
}
