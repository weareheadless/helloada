/** Stable HelloAda ownership and project identity shared with Site-Agent. */
export type HelloAdaIntelligenceIdentity = {
  externalOrganizationId: string
  ownerSubject: string
  origin: { system: 'helloada'; externalId: string }
  externalProjectId: string
}

export type SiteAgentRegistrationReceipt = {
  status: 'registered'
  workspace_id: string
  project_id: string
}

export function siteAgentRegistrationReceipt(value: unknown): SiteAgentRegistrationReceipt | null | 'invalid' {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object') return 'invalid'
  const receipt = value as Record<string, unknown>
  if (receipt.status !== 'registered'
    || typeof receipt.workspace_id !== 'string' || !receipt.workspace_id.trim()
    || typeof receipt.project_id !== 'string' || !receipt.project_id.trim()
    || typeof receipt.external_organization_id !== 'string'
    || !receipt.origin || typeof receipt.origin !== 'object'
    || typeof receipt.external_project_id !== 'string') return 'invalid'
  return { status: 'registered', workspace_id: receipt.workspace_id, project_id: receipt.project_id }
}

export async function helloAdaIntelligenceIdentity(
  ownerId: string,
  requestKey: string,
): Promise<HelloAdaIntelligenceIdentity & { tenantId: string; requestDigest: string }> {
  const ownerSubject = ownerId.trim()
  const key = requestKey.trim()
  if (!ownerSubject || !/^[0-9a-f-]{36}$/i.test(key)) throw new Error('invalid_identity_input')

  // The tenant is anchored to the immutable owner-scoped request key. Display
  // names are mutable labels and must never fork the same request into projects.
  // Preserve the pre-UI-017 key bytes so existing tenants can be recognized.
  const bytes = new TextEncoder().encode(ownerSubject + '\n' + key)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  // Keep the original 16-character digest suffix so requests created before
  // this change can still be found even though their tenant slug used the name.
  const requestDigest = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('').slice(0, 16)
  const tenantId = `site-${requestDigest}`

  return {
    tenantId,
    requestDigest,
    externalOrganizationId: `helloada:${ownerSubject}`,
    ownerSubject,
    origin: { system: 'helloada', externalId: tenantId },
    externalProjectId: `helloada:${tenantId}`,
  }
}

export function isMatchingIntelligenceIdentity(value: unknown, expected: HelloAdaIntelligenceIdentity) {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const origin = candidate.origin
  return candidate.external_organization_id === expected.externalOrganizationId
    && candidate.owner_subject === expected.ownerSubject
    && candidate.external_project_id === expected.externalProjectId
    && !!origin && typeof origin === 'object'
    && (origin as Record<string, unknown>).system === expected.origin.system
    && (origin as Record<string, unknown>).external_id === expected.origin.externalId
}

export function isMatchingRegistrationScope(value: unknown, expected: HelloAdaIntelligenceIdentity) {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.external_organization_id === expected.externalOrganizationId
    && candidate.external_project_id === expected.externalProjectId
    && !!candidate.origin && typeof candidate.origin === 'object'
    && (candidate.origin as Record<string, unknown>).system === expected.origin.system
    && (candidate.origin as Record<string, unknown>).external_id === expected.origin.externalId
}
