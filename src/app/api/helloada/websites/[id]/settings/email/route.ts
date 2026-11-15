import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { proxyTenantControl } from '@/lib/tenant-proxy'
import { ownedWebsite } from '@/lib/website'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function proxy(request: Request, context: RouteContext) {
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 })
  }
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await context.params
  const website = await ownedWebsite(auth, id)
  if (!website) return Response.json({ error: 'website_not_found' }, { status: 404 })
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) return Response.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })
  return proxyTenantControl(tenantId, String(auth.user.id), 'settings/email', request)
}

export const GET = proxy
export const PUT = proxy
