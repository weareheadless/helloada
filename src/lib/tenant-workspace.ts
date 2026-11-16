import { sitePath } from './site-url.ts'

/**
 * The owner-facing address of a tenant's workspace.
 *
 * A runtime tenant is `site-<digest>` for sites created before readable
 * identities, and the site's own slug afterwards. The address the owner uses is
 * the slug in both cases, so anything linking an owner from a tenant surface
 * resolves it here instead of assuming identity and address are the same
 * string.
 *
 * The suffix matters: a site's root is the entry page that hands the owner into
 * their Payload admin, and `/workspace` is the workspace itself, which is where
 * a link from that admin has to land.
 */
export type WorkspaceWebsite = { id?: unknown; slug?: unknown }

export function workspacePathFor(website: WorkspaceWebsite | undefined): string | undefined {
  const slug = String(website?.slug ?? '').trim()
  if (/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) return sitePath(slug)
  // A site created before slugs is still reachable by its numeric id, which is
  // what its owner's old links use.
  const id = Number(website?.id)
  return Number.isSafeInteger(id) && id > 0 ? sitePath(String(id)) : undefined
}

export async function tenantWorkspacePath(
  lookup: (tenantId: string) => Promise<WorkspaceWebsite[]>,
  tenantId: string,
): Promise<string | undefined> {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(tenantId)) return undefined
  const matches = await lookup(tenantId)
  // An ambiguous tenant must not silently open whichever row came first.
  return matches.length === 1 ? workspacePathFor(matches[0]) : undefined
}
