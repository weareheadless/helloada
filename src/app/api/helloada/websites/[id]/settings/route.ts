import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { proxyTenantControl } from '@/lib/tenant-proxy'
import { ownedWebsite } from '@/lib/website'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function tenantFor(auth: Awaited<ReturnType<typeof currentUser>>, id: string) {
  if (!auth) return { error: 'authentication_required', status: 401 } as const
  const website = await ownedWebsite(auth, id)
  if (!website) return { error: 'website_not_found', status: 404 } as const
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) return { error: 'workspace_bootstrap_pending', status: 409 } as const
  return { auth, website, tenantId } as const
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params
  const resolved = await tenantFor(await currentUser(await headers()), id)
  if ('error' in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status })
  }
  return proxyTenantControl(
    resolved.tenantId,
    String(resolved.auth.user.id),
    'settings',
    request,
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 })
  }
  const { id } = await context.params
  const resolved = await tenantFor(await currentUser(await headers()), id)
  if ('error' in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }
  if ('slug' in body) {
    // The slug is the owner's URL key. Renaming it needs an alias so existing
    // links keep working; until that lands it is not a free-form setting.
    return Response.json({ error: 'slug_read_only' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) {
    return Response.json({ error: 'invalid_name' }, { status: 400 })
  }
  // The tenant record owns the name: it is compiled into the site and read by
  // every surface. Write it there first, then keep the platform document in
  // step as a projection of the same value.
  const response = await proxyTenantControl(
    resolved.tenantId,
    String(resolved.auth.user.id),
    'settings',
    new Request(request.url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
  if (!response.ok) {
    return new Response(response.body, {
      status: response.status,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    })
  }
  const identity = await response.json().catch(() => null) as { displayName?: string } | null
  const saved = String(identity?.displayName || name)
  try {
    await resolved.auth.payload.update({
      collection: 'websites',
      id: resolved.website.id,
      req: resolved.auth.req,
      data: { name: saved },
    })
  } catch {
    // The record is authoritative; a stale listing name is repaired by the
    // next settings read rather than failing a change that already happened.
  }
  return Response.json({ name: saved }, { headers: { 'cache-control': 'no-store' } })
}
