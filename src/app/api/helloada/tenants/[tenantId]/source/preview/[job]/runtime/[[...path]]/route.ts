import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { proxyTenantWorkspace } from '@/lib/tenant-proxy'
import { documentRequest, previewUnavailable } from '@/lib/unavailable'
import { ownedWebsiteByTenant } from '@/lib/website'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ tenantId: string; job: string; path?: string[] }> }

const jobIdentity = /^[A-Za-z0-9._:-]{1,120}$/

/**
 * The compiled candidate's one owner-facing mount.
 *
 * A build's Next basePath is this path, derived from the tenant id, so the
 * workspace frame and a full-screen tab request the same URL here. The request
 * is only served to the signed-in owner of that tenant; the candidate itself
 * stays in the isolated preview runtime.
 */
async function serve(request: Request, context: RouteContext) {
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { tenantId, job, path } = await context.params
  if (!jobIdentity.test(job)) return Response.json({ error: 'preview_not_found' }, { status: 404 })
  const website = await ownedWebsiteByTenant(auth, tenantId)
  if (!website || String(website.tenantId || '').trim() !== tenantId) {
    return Response.json({ error: 'website_not_found' }, { status: 404 })
  }
  const suffix = ['source', 'preview', job, 'runtime', ...(path || [])].join('/')
  const response = await proxyTenantWorkspace(tenantId, String(auth.user.id), suffix, request)
  // The candidate's own 404 is a rendered page and stays. A machine error — the
  // preview runtime gone, the build cleaned up — would otherwise reach the
  // frame as JSON, so a document request gets the readable answer instead.
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (response.status >= 400 && documentRequest(request) && !contentType.includes('text/html')) {
    return previewUnavailable(response.status)
  }
  return response
}

export const GET = serve
export const HEAD = serve
