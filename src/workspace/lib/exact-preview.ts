/**
 * Where the owner opens the exact compiled candidate.
 *
 * The compiled preview is served by the tenant Worker at its build mount, and
 * the tenant bridge only answers an owner session on that origin. A
 * control-plane iframe is cross-site, so that session is never sent: framing
 * the mount showed the bridge's authentication error instead of the draft.
 *
 * The candidate therefore opens in a top-level tab that starts with the
 * existing owner handoff. A top-level navigation carries the session cookie,
 * and staying on the tenant origin keeps the build's mount, its assets and its
 * client-side navigation intact. The workspace frame keeps the published alias
 * meanwhile, and approval stays in the Design controls.
 */
export const exactSourcePreviewHref = (
  manage: string | undefined,
  url: string | undefined,
): string | undefined => {
  const entry = String(manage || '').trim()
  const candidate = String(url || '').trim()
  if (!entry || !candidate.startsWith('/api/helloada/')) return undefined
  const [path] = entry.split('?')
  return `${path}?next=${encodeURIComponent(candidate)}`
}
