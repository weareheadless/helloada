import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, startWebsiteBootstrap, websiteBootstrapStatus } from '@/lib/website'

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
const bootstrapSteps = ['requested', 'creating_repository', 'creating_worker', 'creating_data', 'deploying_shell', 'ready', 'needs_attention'] as const
type BootstrapStep = typeof bootstrapSteps[number]
const asBootstrapStep = (value: string): BootstrapStep =>
  (bootstrapSteps as readonly string[]).includes(value) ? value as BootstrapStep : 'needs_attention'

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
  let remote: Record<string, unknown> | null = null
  if (website.tenantId) {
    const remoteResponse = await websiteBootstrapStatus(String(website.tenantId))
    if (remoteResponse.ok) remote = await remoteResponse.json().catch(() => null) as Record<string, unknown> | null
  }
  const remoteReceipts = remote?.resource_receipts && typeof remote.resource_receipts === 'object'
    ? remote.resource_receipts as Record<string, unknown>
    : {}
  const remoteStatus = String(remote?.status || status)
  const remoteStep = String(remote?.step || step)
  const remoteDiagnostic = String(remote?.diagnostic || job?.diagnostic || '')

  return NextResponse.json({
    website: {
      id: website.id,
      phase: website.phase,
      workerUrl: website.workerUrl || (remoteReceipts.deploying_shell as { worker_url?: string } | undefined)?.worker_url || null,
      adminUrl: website.adminUrl || null,
      tenantId: website.tenantId || null,
    },
    bootstrap: job ? {
      id: job.id,
      status: remoteStatus,
      step: remoteStep,
      retries: Number(job?.retries || 0),
      label: stepLabels[remoteStep] || 'Preparing your workspace',
      diagnostic: remoteDiagnostic,
      resourceReceipts: publicReceipt(Object.keys(remoteReceipts).length ? remoteReceipts : job?.resourceReceipts || {}),
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

  const response = await startWebsiteBootstrap(String(website.tenantId), String(website.name || website.tenantId))
  const registration = await response.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    step?: string
    diagnostic?: string
    resource_receipts?: Record<string, unknown>
    detail?: string
    error?: string
  }
  if (response.ok) {
    const bootstrapStatus = String(registration.status || 'queued')
    const bootstrapStep = asBootstrapStep(String(registration.step || 'requested'))
    const completed = bootstrapStatus === 'done'
    const deployedWorkerUrl = (registration.resource_receipts?.deploying_shell as { worker_url?: string } | undefined)?.worker_url || website.workerUrl || ''
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: job.id,
      req: auth.req,
      data: {
        step: bootstrapStep,
        status: completed ? 'done' : 'running',
        resourceReceipts: registration.resource_receipts || {},
        diagnostic: String(registration.diagnostic || ''),
      },
    })
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
        data: {
          phase: completed ? 'live' : 'intake',
          workerUrl: deployedWorkerUrl || undefined,
          adminUrl: deployedWorkerUrl ? `${deployedWorkerUrl.replace(/\/$/, '')}/admin` : undefined,
        },
    })
  } else {
    const diagnostic = String(registration.diagnostic || registration.detail || registration.error || 'The site workspace could not be bootstrapped').slice(0, 500)
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
    diagnostic: response.ok ? String(registration.diagnostic || '') : String(registration.diagnostic || registration.detail || registration.error || 'The site workspace could not be bootstrapped').slice(0, 500),
  }, { status: response.ok ? (registration.status === 'done' ? 200 : 202) : 502 })
}
