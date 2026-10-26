/** Stable HelloAda ownership and project identity shared with Site-Agent. */
export type HelloAdaIntelligenceIdentity = {
  externalOrganizationId: string
  ownerSubject: string
  origin: { system: 'helloada'; externalId: string }
  externalProjectId: string
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
