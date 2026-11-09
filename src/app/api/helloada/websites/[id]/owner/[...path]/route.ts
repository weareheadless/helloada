import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; path?: string[] }> }

const forwardable = ['content-type', 'accept', 'accept-language']

async function proxy(request: Request, context: RouteContext) {
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id, path } = await context.params
  const website = await ownedWebsite(auth, id)
  if (!website) return Response.json({ error: 'website_not_found' }, { status: 404 })
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) return Response.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })

  const incoming = new URL(request.url)
  const suffix = (path || []).join('/')
  const query = incoming.search
  const method = request.method.toUpperCase()
  const forwardedHeaders: Record<string, string> = {
    // The site-agent resolves the tenant and injects its workspace token. The
    // owner subject is the only identity this request may assert.
    'x-helloada-owner-subject': String(auth.user.id),
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
  const cookies = response.headers.getSetCookie?.() || []
  for (const cookie of cookies) out.append('set-cookie', cookie)
  return new Response(response.body, { status: response.status, headers: out })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
