import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { isBootstrapStatus, isBootstrapStep } from '@/lib/bootstrap-contract'
import { helloAdaIntelligenceIdentity } from '@/lib/intelligence-identity'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { provisioningPhase, matchesGithubSource } from '@/lib/github-provisioning'
import { canonicalIntelligenceReceipt, normalizeGithubRepository, registerWebsiteTenant, resolveOrCreateOwnerWebsite, startWebsiteBootstrap } from '@/lib/website'

export async function POST(request: Request) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

  const requestKey = request.headers.get('idempotency-key')?.trim() || ''
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 })
  }
  const body = await request.json().catch(() => null) as { name?: string; github_repository?: unknown } | null
  const name = String(body?.name || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  const githubRepository = normalizeGithubRepository(body?.github_repository)
  if (githubRepository === null) return NextResponse.json({ error: 'github_repository_invalid' }, { status: 400 })
  if (githubRepository && !isPlatformAdmin(auth.user)) return NextResponse.json({ error: 'operator_required' }, { status: 403 })

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
    data: { website: website.id, step: 'requested', status: 'queued', retries: 0, resourceReceipts: { github_repository: githubRepository }, diagnostic: '' },
  })
  const previousReceipts = bootstrapJob.resourceReceipts && typeof bootstrapJob.resourceReceipts === 'object'
    ? bootstrapJob.resourceReceipts as Record<string, unknown> : {}
  if (String(previousReceipts.github_repository || '') !== githubRepository) {
    return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 })
  }

  const registrationResponse = await registerWebsiteTenant(identity.tenantId, name, identity, githubRepository || undefined)
  const registration = await registrationResponse.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    intelligence_identity?: unknown
    provisioning_source?: unknown
  }
  const parsedReceipt = canonicalIntelligenceReceipt(registration, identity)
  const canonicalReceipt = parsedReceipt === 'invalid' ? undefined : parsedReceipt
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
    || !matchesGithubSource(registration.provisioning_source, githubRepository)
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

  const bootstrapResponse = await startWebsiteBootstrap(identity.tenantId, name, githubRepository || undefined)
  const bootstrap = await bootstrapResponse.json().catch(() => ({})) as {
    tenant_id?: string
    status?: string
    step?: string
    workspace_ready?: boolean
    website_live?: boolean
    resource_receipts?: Record<string, unknown>
    provisioning_source?: unknown
  }
  const remoteStep = bootstrap.step
  const remoteStatus = bootstrap.status
  const contractValid = bootstrapResponse.ok
    && matchesGithubSource(bootstrap.provisioning_source, githubRepository)
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
        github_repository: githubRepository,
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
      phase: provisioningPhase(githubRepository, bootstrap),
      workerUrl: workerUrl || undefined,
      adminUrl: adminUrl || undefined,
    },
  })

  return NextResponse.json({
    id: website.id,
    phase: provisioningPhase(githubRepository, bootstrap),
    bootstrapJobId: bootstrapJob.id,
    bootstrapStatus: remoteStatus,
    intelligenceStatus: 'pending',
  }, { status: 201 })
}
