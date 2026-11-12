import { siteAgentRequest } from '@/lib/website'

const forwardable = ['content-type', 'accept', 'accept-language']

/**
 * The owner-authenticated pass-through to a tenant workspace.
 *
 * The caller has already resolved which website this is and that the signed-in
 * owner owns it. Compiled previews do not travel through here: they run on
 * their own origin.
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
  const response = await siteAgentRequest(tenantId, `/worker/${suffix}${query}`, {
    method,
    headers: forwardedHeaders,
    body,
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
