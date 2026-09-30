import type { currentUser } from './auth'

export async function ownedWebsite(auth: Awaited<ReturnType<typeof currentUser>>, id: string) {
  if (!auth) return null
  const result = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: {
      and: [
        { id: { equals: id } },
        { owner: { equals: auth.user.id } },
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

export function registerWebsiteTenant(tenantId: string, displayName: string) {
  return siteAgentRequest(tenantId, '/register', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName }),
  })
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
