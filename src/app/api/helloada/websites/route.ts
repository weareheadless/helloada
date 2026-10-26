import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { isBootstrapStatus, isBootstrapStep } from '@/lib/bootstrap-contract'
import { helloAdaIntelligenceIdentity, isMatchingIntelligenceIdentity } from '@/lib/intelligence-identity'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { registerWebsiteTenant, startWebsiteBootstrap } from '@/lib/website'

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

async function findLegacyOwnerWebsiteForRequest(
  auth: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  requestDigest: string,
) {
  const result = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: {
      and: [
        { owner: { equals: auth.user.id } },
        { tenantId: { contains: requestDigest } },
      ],
    },
    limit: 100,
    depth: 0,
  })
  return result.docs.find((candidate) => String(candidate.tenantId || '').endsWith(`-${requestDigest}`))
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

  const requestedIdentity = await helloAdaIntelligenceIdentity(String(auth.user.id), requestKey)
  let website: Awaited<ReturnType<typeof findOwnerWebsite>> | undefined = await findOwnerWebsite(auth, requestedIdentity.tenantId)
  if (!website) website = await findLegacyOwnerWebsiteForRequest(auth, requestedIdentity.requestDigest)
  const legacyTenantId = website ? String(website.tenantId || '') : ''
  const identity = legacyTenantId && legacyTenantId !== requestedIdentity.tenantId
    ? {
        ...requestedIdentity,
        tenantId: legacyTenantId,
        origin: { system: 'helloada' as const, externalId: legacyTenantId },
        externalProjectId: `helloada:${legacyTenantId}`,
      }
    : requestedIdentity
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
          slug: identity.tenantId,
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

  const registrationResponse = await registerWebsiteTenant(identity.tenantId, name, identity)
  const registration = await registrationResponse.json().catch(() => ({})) as {
    tenant_id?: string
    schema_version?: number
    status?: string
    intelligence_identity?: unknown
  }
  const hasIdentityReceipt = Object.hasOwn(registration, 'intelligence_identity')
  const identityReceiptMatches = hasIdentityReceipt
    && isMatchingIntelligenceIdentity(registration.intelligence_identity, identity)
  const intelligenceReceipt = {
    status: 'pending',
    registration: identityReceiptMatches ? 'acknowledged' : 'pending',
    identity: {
      externalOrganizationId: identity.externalOrganizationId,
      ownerSubject: identity.ownerSubject,
      origin: identity.origin,
      externalProjectId: identity.externalProjectId,
    },
    retry: 'Repeat this owner-scoped create request with the same Idempotency-Key and name.',
  }
  if (!registrationResponse.ok || registration.tenant_id !== identity.tenantId
    || (hasIdentityReceipt && !identityReceiptMatches)) {
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
        resourceReceipts: { intelligence: intelligenceReceipt },
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
        resourceReceipts: { intelligence: intelligenceReceipt },
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
        resourceReceipts: { intelligence: intelligenceReceipt },
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
