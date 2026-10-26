import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { isBootstrapStatus, isBootstrapStep } from '@/lib/bootstrap-contract'
import { helloAdaIntelligenceIdentity } from '@/lib/intelligence-identity'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { canonicalIntelligenceReceipt, registerWebsiteTenant, resolveOrCreateOwnerWebsite, startWebsiteBootstrap } from '@/lib/website'

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

  const requestedIdentity = await helloAdaIntelligenceIdentity(String(auth.user.id), requestKey)
  const websiteResolution = await resolveOrCreateOwnerWebsite(auth.payload as never, auth.req, auth.user.id, requestedIdentity, name)
  if ('error' in websiteResolution) return NextResponse.json({ error: websiteResolution.error }, { status: 409 })
  const { website, identity } = websiteResolution

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

  const registrationResponse = await registerWebsiteTenant(identity.tenantId, name, identity)
  const registration = await registrationResponse.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    intelligence_identity?: unknown
  }
  const parsedReceipt = canonicalIntelligenceReceipt(registration, identity)
  const canonicalReceipt = parsedReceipt === 'invalid' ? undefined : parsedReceipt
  const previousReceipts = bootstrapJob.resourceReceipts && typeof bootstrapJob.resourceReceipts === 'object'
    ? bootstrapJob.resourceReceipts as Record<string, unknown> : {}
  const previousIntelligence = previousReceipts.intelligence && typeof previousReceipts.intelligence === 'object'
    ? previousReceipts.intelligence as Record<string, unknown> : {}
  const intelligenceReceipt = !canonicalReceipt ? null : {
    ...canonicalReceipt,
    ...(previousIntelligence.workspaceId && canonicalReceipt.status !== 'registered'
      ? { workspaceId: previousIntelligence.workspaceId } : {}),
    ...(previousIntelligence.projectId && canonicalReceipt.status !== 'registered'
      ? { projectId: previousIntelligence.projectId } : {}),
    ...(previousIntelligence.status === 'registered' && canonicalReceipt.status === 'pending'
      ? { status: 'registered' as const } : {}),
    retry: 'Repeat this owner-scoped create request with the same Idempotency-Key and name.',
  }
  if (!registrationResponse.ok || registration.tenant_id !== identity.tenantId
    || !canonicalReceipt
    || (canonicalReceipt.status === 'registered'
      && ((previousIntelligence.workspaceId && previousIntelligence.workspaceId !== canonicalReceipt.workspaceId)
        || (previousIntelligence.projectId && previousIntelligence.projectId !== canonicalReceipt.projectId)))) {
    const diagnostic = registrationResponse.ok
      ? 'Site-agent returned a mismatched tenant or intelligence identity.'
      : 'The tenant could not be registered. Repeat the request with the same idempotency key to retry.'
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: bootstrapJob.id,
      req: auth.req,
      data: {
        step: 'needs_attention',
        status: 'failed',
        resourceReceipts: { ...previousReceipts, intelligence: intelligenceReceipt },
        diagnostic,
      },
    })
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      data: { phase: 'needs_attention' },
    })
    return NextResponse.json({ id: website.id, error: 'tenant_registration_failed', intelligenceStatus: 'pending' }, { status: 201 })
  }

  const bootstrapResponse = await startWebsiteBootstrap(identity.tenantId, name)
  const bootstrap = await bootstrapResponse.json().catch(() => ({})) as {
    tenant_id?: string
    status?: string
    step?: string
    workspace_ready?: boolean
    website_live?: boolean
    resource_receipts?: Record<string, unknown>
  }
  const remoteStep = bootstrap.step
  const remoteStatus = bootstrap.status
  const contractValid = bootstrapResponse.ok
    && bootstrap.tenant_id === identity.tenantId
    && isBootstrapStep(remoteStep)
    && isBootstrapStatus(remoteStatus)
    && typeof bootstrap.workspace_ready === 'boolean'
    && typeof bootstrap.website_live === 'boolean'
  if (!contractValid) {
    const diagnostic = bootstrapResponse.ok
      ? 'Site-agent returned an invalid bootstrap contract.'
      : 'The canonical bootstrap could not start. Repeat the request with the same idempotency key to retry.'
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: bootstrapJob.id,
      req: auth.req,
      data: {
        step: 'needs_attention',
        status: 'failed',
        resourceReceipts: { ...previousReceipts, intelligence: intelligenceReceipt },
        diagnostic,
      },
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
  const adminUrl = bootstrap.workspace_ready
    ? tenantAdminUrl(workerUrl ? workerUrl.replace(/\/$/, '') + '/admin' : null)
    : null
  if (bootstrap.workspace_ready && !adminUrl) {
    await auth.payload.update({
      collection: 'bootstrap-jobs',
      id: bootstrapJob.id,
      req: auth.req,
      data: {
        step: 'needs_attention',
        status: 'failed',
        resourceReceipts: { ...previousReceipts, intelligence: intelligenceReceipt },
        diagnostic: 'Verified admin origin is missing.',
      },
    })
    return NextResponse.json({ id: website.id, error: 'verified_admin_origin_missing' }, { status: 502 })
  }

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
        // An old Site-Agent may ignore the optional metadata. Pending is never
        // a ready assertion, even when the exact identity echo was received.
        intelligence: intelligenceReceipt,
      },
      diagnostic: remoteStatus === 'failed'
        ? 'The canonical bootstrap failed. Repeat the request with the same idempotency key to retry.'
        : '',
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

  return NextResponse.json({
    id: website.id,
    phase: failed ? 'needs_attention' : 'intake',
    bootstrapJobId: bootstrapJob.id,
    bootstrapStatus: remoteStatus,
    intelligenceStatus: 'pending',
  }, { status: 201 })
}
