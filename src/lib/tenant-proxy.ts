import { siteAgentRequest } from '@/lib/website'

const forwardable = ['content-type', 'accept', 'accept-language']

/**
 * The owner-authenticated pass-through to a tenant workspace.
 *
 * The caller has already resolved which website this is and that the signed-in
 * owner owns it. Compiled previews do not travel through here: they run on
 * their own origin.
 */
/**
 * The owner-authenticated pass-through to a tenant's control-plane settings.
 *
 * Unlike the workspace proxy this never reaches the tenant Worker; it reads and
 * writes the tenant record that owns the domain, the mailbox policy and the
 * identity every other surface resolves from.
 */
export async function proxyTenantControl(
  tenantId: string,
  ownerSubject: string,
  path: string,
  request: Request,
): Promise<Response> {
  const incoming = new URL(request.url)
  const method = request.method.toUpperCase()
  const forwardedHeaders: Record<string, string> = {
    'x-helloada-owner-subject': ownerSubject,
  }
  for (const name of forwardable) {
    const value = request.headers.get(name)
    if (value) forwardedHeaders[name] = value
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
  const suffix = String(path || '').replace(/^\/+/, '')
  const response = await siteAgentRequest(tenantId, `/${suffix}${incoming.search}`, {
    method,
    headers: forwardedHeaders,
    body,
    signal: AbortSignal.timeout(120_000),
  })
  const out = new Headers({ 'cache-control': 'no-store' })
  const contentType = response.headers.get('content-type')
  if (contentType) out.set('content-type', contentType)
  return new Response(response.body, { status: response.status, headers: out })
}

/**
 * Workspace surfaces the canonical API owns outright.
 *
 * Growth is app-to-app: the site-agent holds the connector and the ledger, and
 * this server has already authenticated the owner and named the tenant. Going
 * through the tenant Worker would make every new route wait on a rebuild of
 * every tenant's compiled bridge, so an owner on a site built last week gets a
 * 503 for an endpoint that exists today.
 */
const CANONICAL_API_PREFIXES = ['growth/']
const TENANT_LOCAL_PATHS = new Set(['growth/contract', 'growth/candidate'])

const isCanonicalApiPath = (suffix: string) =>
  CANONICAL_API_PREFIXES.some((prefix) => suffix.startsWith(prefix))
  && !TENANT_LOCAL_PATHS.has(suffix)

async function proxyCanonicalWorkspaceApi(
  tenantId: string,
  ownerSubject: string,
  suffix: string,
  request: Request,
): Promise<Response> {
  const incoming = new URL(request.url)
  const method = request.method.toUpperCase()
  const forwardedHeaders: Record<string, string> = {
    // The gateway resolves the tenant and swaps in its workspace token; the
    // owner identity is asserted here because this server authenticated it.
    'x-helloada-owner-id': `helloada:${ownerSubject}`,
  }
  for (const name of forwardable) {
    const value = request.headers.get(name)
    if (value) forwardedHeaders[name] = value
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer()
  const response = await siteAgentRequest(tenantId, `/workspace/${suffix}${incoming.search}`, {
    method,
    headers: forwardedHeaders,
    body,
    signal: AbortSignal.timeout(120_000),
  })
  const out = new Headers({ 'cache-control': 'no-store' })
  const contentType = response.headers.get('content-type')
  if (contentType) out.set('content-type', contentType)
  return new Response(response.body, { status: response.status, headers: out })
}

export async function proxyTenantWorkspace(
  tenantId: string,
  ownerSubject: string,
  suffix: string,
  request: Request,
): Promise<Response> {
  const normalized = String(suffix || '').replace(/^\/+/, '')
  if (isCanonicalApiPath(normalized)) {
    return proxyCanonicalWorkspaceApi(tenantId, ownerSubject, normalized, request)
  }
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
