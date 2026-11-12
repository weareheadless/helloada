import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { proxyTenantWorkspace } from '@/lib/tenant-proxy'
import { ownedWebsite } from '@/lib/website'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; path?: string[] }> }

async function proxy(request: Request, context: RouteContext) {
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id, path } = await context.params
  const website = await ownedWebsite(auth, id)
  if (!website) return Response.json({ error: 'website_not_found' }, { status: 404 })
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) return Response.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })
  return proxyTenantWorkspace(tenantId, String(auth.user.id), (path || []).join('/'), request)
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
