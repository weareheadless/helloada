import type { currentUser } from './auth'
import type { HelloAdaIntelligenceIdentity } from './intelligence-identity'
import { isMatchingIntelligenceIdentity, isMatchingRegistrationScope, siteAgentRegistrationReceipt } from './intelligence-identity.ts'
import { websiteScope } from './platform-admin.ts'

export async function ownedWebsite(auth: Awaited<ReturnType<typeof currentUser>>, id: string) {
  if (!auth) return null
  const result = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    overrideAccess: false,
    where: {
      and: [
        { id: { equals: id } },
        websiteScope(auth.user),
      ],
    },
    limit: 1,
  })
  return result.docs[0] || null
}

export async function siteAgentRequest(tenantId: string, path: string, init: RequestInit = {}) {
  const baseUrl = String(process.env.SITE_AGENT_URL || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/v1$/, '')
  const controlToken = String(process.env.HELLOADA_CONTROL_PLANE_TOKEN || '').trim()
  if (!baseUrl || !controlToken) {
    return new Response(JSON.stringify({ error: 'workspace_bootstrap_pending' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${controlToken}`)
  headers.set('content-type', 'application/json')
  try {
    return await fetch(`${baseUrl}/v1/control-plane/websites/${encodeURIComponent(tenantId)}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch {
    return new Response(JSON.stringify({ error: 'workspace_bootstrap_unreachable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export function registerWebsiteTenant(
  tenantId: string,
  displayName: string,
  identity?: HelloAdaIntelligenceIdentity,
) {
  return siteAgentRequest(tenantId, '/register', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      ...(identity ? {
        external_organization_id: identity.externalOrganizationId,
        owner_subject: identity.ownerSubject,
        origin: {
          system: identity.origin.system,
          external_id: identity.origin.externalId,
        },
        external_project_id: identity.externalProjectId,
      } : {}),
    }),
  })
}

export function matchingLegacyWebsite<T extends { tenantId?: unknown }>(docs: T[], requestDigest: string): T | null | 'ambiguous' {
  const matches = docs.filter(candidate => String(candidate.tenantId || '').endsWith(`-${requestDigest}`))
  return matches.length > 1 ? 'ambiguous' : matches[0] || null
}

type WebsiteRow = { id: number; name?: unknown; tenantId?: unknown }
type WebsiteCreatePayload = {
  find(args: Record<string, unknown>): Promise<{ docs: Array<Record<string, unknown>> }>
  create(args: Record<string, unknown>): Promise<WebsiteRow>
}

export async function resolveOrCreateOwnerWebsite(
  payload: WebsiteCreatePayload,
  req: unknown,
  ownerId: string | number,
  identity: HelloAdaIntelligenceIdentity & { tenantId: string; requestDigest: string },
  name: string,
) {
  const find = (tenantId: string) => payload.find({ collection: 'websites', req, where: { and: [
    { tenantId: { equals: tenantId } }, { owner: { equals: ownerId } },
  ] }, limit: 1, depth: 0 })
  let website = (await find(identity.tenantId)).docs[0] as WebsiteRow | undefined
  if (!website) {
    const legacy = await payload.find({ collection: 'websites', req, where: { and: [
      { owner: { equals: ownerId } }, { tenantId: { contains: identity.requestDigest } },
    ] }, limit: 100, depth: 0 })
    const match = matchingLegacyWebsite(legacy.docs, identity.requestDigest)
    if (match === 'ambiguous') return { error: 'idempotency_conflict' as const }
    website = match as WebsiteRow | null || undefined
  }
  const legacyTenantId = website ? String(website.tenantId || '') : ''
  const resolvedIdentity = legacyTenantId && legacyTenantId !== identity.tenantId
    ? { ...identity, tenantId: legacyTenantId, origin: { system: 'helloada' as const, externalId: legacyTenantId }, externalProjectId: `helloada:${legacyTenantId}` }
    : identity
  if (website && String(website.name || '') !== name) return { error: 'idempotency_conflict' as const }
  if (!website) {
    try {
      website = await payload.create({ collection: 'websites', req, data: {
        name, slug: resolvedIdentity.tenantId, tenantId: resolvedIdentity.tenantId, owner: ownerId,
        phase: 'intake', domainStatus: 'not_connected',
      } })
    } catch (error) {
      website = (await find(resolvedIdentity.tenantId)).docs[0] as WebsiteRow | undefined
      if (!website) throw error
      if (String(website.name || '') !== name) return { error: 'idempotency_conflict' as const }
    }
  }
  return { website, identity: resolvedIdentity }
}

export function canonicalIntelligenceReceipt(
  registration: Record<string, unknown>,
  identity: HelloAdaIntelligenceIdentity,
) {
  const identityPresent = Object.hasOwn(registration, 'intelligence_identity')
  if (identityPresent && !isMatchingIntelligenceIdentity(registration.intelligence_identity, identity)) return 'invalid' as const
  const receipt = siteAgentRegistrationReceipt(registration.intelligence_registration)
  if (receipt === 'invalid') return 'invalid' as const
  if (receipt && (!identityPresent || !isMatchingIntelligenceIdentity(registration.intelligence_identity, identity)
    || !isMatchingRegistrationScope(registration.intelligence_registration, identity))) return 'invalid' as const
  return {
    status: receipt ? 'registered' as const : identityPresent ? 'acknowledged' as const : 'pending' as const,
    identity: {
      externalOrganizationId: identity.externalOrganizationId,
      ownerSubject: identity.ownerSubject,
      origin: identity.origin,
      externalProjectId: identity.externalProjectId,
    },
    ...(receipt ? { workspaceId: receipt.workspace_id, projectId: receipt.project_id } : {}),
  }
}

export function startWebsiteBootstrap(tenantId: string, displayName: string) {
  return siteAgentRequest(tenantId, '/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  })
}

export function websiteBootstrapStatus(tenantId: string) {
  return siteAgentRequest(tenantId, '/bootstrap')
}

export function websiteIntelligence(tenantId: string) {
  return siteAgentRequest(tenantId, '/intelligence')
}

export async function ownerWebsiteIntelligence(tenantId?: string | null) {
  if (!tenantId) return { state: 'unavailable' as const, reason: 'Tenant identity is not available.' }
  try {
    const response = await websiteIntelligence(tenantId)
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (response.status === 404 || body?.state === 'not_started') return { state: 'not_started' as const }
    if (!response.ok || !body || typeof body !== 'object') {
      return { state: 'unavailable' as const, reason: typeof body?.reason === 'string' ? body.reason : 'The intelligence service could not load your summary.' }
    }
    if (body.state === 'unavailable') return { state: 'unavailable' as const, reason: typeof body.reason === 'string' ? body.reason : 'The intelligence service could not load your summary.' }
    if (body.state === 'available' && body.data && typeof body.data === 'object') return { state: 'available' as const, data: body.data as Record<string, unknown> }
    return { state: 'available' as const, data: body }
  } catch {
    return { state: 'unavailable' as const, reason: 'The intelligence service could not be reached.' }
  }
}

export function websiteHistory(tenantId: string, limit = 50) {
  return siteAgentRequest(tenantId, `/history?limit=${Math.max(1, Math.min(100, Math.trunc(limit)))}`)
}

export function restoreWebsiteVersion(tenantId: string, versionId: string | number) {
  return siteAgentRequest(tenantId, `/versions/${encodeURIComponent(String(versionId))}/restore`, { method: 'POST' })
}

export function approveWebsiteDraft(tenantId: string, draftId: string | number) {
  return siteAgentRequest(tenantId, `/drafts/${encodeURIComponent(String(draftId))}/approve`, { method: 'POST' })
}

type RemoteOperation = {
  id?: number | string | null
  tool?: string | null
  origin?: string | null
  status?: string | null
  input_hash?: string | null
  source_action_id?: number | string | null
  reason?: string | null
  outcome?: Record<string, unknown> | null
}

/**
 * Keep the central portfolio's operation projection in step with the shared
 * site-agent operation. The site-agent remains the execution authority; this
 * record gives HelloAda a durable owner-visible history without duplicating
 * orchestration logic in the frontend.
 */
export async function mirrorOperation(
  auth: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  websiteId: number,
  operation: RemoteOperation,
) {
  const inputHash = String(operation.input_hash || '').trim()
    || `site-agent:${websiteId}:${String(operation.id || 'unknown')}`
  const sourceActionId = operation.source_action_id == null
    ? null
    : String(operation.source_action_id)
  const existing = await auth.payload.find({
    collection: 'operations',
    req: auth.req,
    where: {
      and: [
        { website: { equals: websiteId } },
        sourceActionId
          ? { sourceActionId: { equals: sourceActionId } }
          : { inputHash: { equals: inputHash } },
      ],
    },
    limit: 1,
    depth: 0,
  })

  const origin: 'owner_message' | 'recommendation' = operation.origin === 'owner_message'
    ? 'owner_message'
    : 'recommendation'
  const rawStatus = String(operation.status || '')
  const status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' = (
    ['queued', 'running', 'done', 'failed', 'cancelled'] as const
  ).includes(rawStatus as 'queued' | 'running' | 'done' | 'failed' | 'cancelled')
    ? rawStatus as 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
    : 'queued'
  const data = {
    website: websiteId,
    tool: String(operation.tool || 'unknown'),
    origin,
    status,
    inputHash,
    sourceActionId,
    reason: String(operation.reason || '').slice(0, 1_000),
    outcome: operation.outcome || {},
  }

  if (existing.docs[0]) {
    return auth.payload.update({
      collection: 'operations',
      id: existing.docs[0].id,
      req: auth.req,
      data,
    })
  }
  return auth.payload.create({ collection: 'operations', req: auth.req, data })
}
