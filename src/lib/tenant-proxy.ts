import { siteAgentRequest } from '@/lib/website'

const forwardable = [
  'content-type', 'accept', 'accept-language',
  // A compiled candidate distinguishes an RSC navigation from a document
  // request by these headers; its frame runs through the owner route.
  'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch',
  'next-url', 'purpose', 'x-nextjs-data',
]

/** The compiled candidate's redirect belongs to the browser, not this proxy. */
const previewRuntimePath = (suffix: string) => /^source\/preview\/[^/]+\/runtime(?:\/|$)/.test(suffix)

/**
 * One owner-authenticated pass-through to a tenant workspace.
 *
 * Both owner routes use it: the site-scoped bridge and the tenant-scoped
 * compiled-preview mount. The caller has already resolved which website this
 * is and that the signed-in owner owns it.
 */
export async function proxyTenantWorkspace(
  tenantId: string,
  ownerSubject: string,
  suffix: string,
  request: Request,
): Promise<Response> {
  const incoming = new URL(request.url)
  const query = incoming.search
  const method = request.method.toUpperCase()
  const forwardedHeaders: Record<string, string> = {
    // The site-agent resolves the tenant and injects its workspace token. The
    // owner subject is the only identity this request may assert.
    'x-helloada-owner-subject': ownerSubject,
  }
  for (const name of forwardable) {
    const value = request.headers.get(name)
    if (value) forwardedHeaders[name] = value
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
  const previewRuntime = previewRuntimePath(suffix)
  const response = await siteAgentRequest(tenantId, `/worker/${suffix}${query}`, {
    method,
    headers: forwardedHeaders,
    body,
    // The compiled preview's redirect names a path on this same owner surface,
    // so the browser follows it here instead of the API following it elsewhere.
    redirect: previewRuntime ? 'manual' : 'follow',
    signal: AbortSignal.timeout(120_000),
  })

  const out = new Headers({ 'cache-control': 'no-store' })
  const contentType = response.headers.get('content-type')
  if (contentType) out.set('content-type', contentType)
  // Attachments and exports must keep their download name.
  const disposition = response.headers.get('content-disposition')
  if (disposition) out.set('content-disposition', disposition)
  const location = response.headers.get('location')
  if (location) out.set('location', location)
  const cookies = response.headers.getSetCookie?.() || []
  for (const cookie of cookies) out.append('set-cookie', cookie)
  return new Response(response.body, { status: response.status, headers: out })
}
