import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { issueOwnerHandoff } from '@/lib/owner-handoff'
import { safeNextPath } from '@/lib/safe-next'
import { ownedWebsite, siteAgentRequest, websiteBootstrapStatus } from '@/lib/website'

export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store, max-age=0', 'referrer-policy': 'no-referrer' }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'origin_invalid' }, { status: 403, headers: noStore })
  }
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore })

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { next?: unknown }
  let next: string
  try {
    next = safeNextPath(body.next)
  } catch {
    return NextResponse.json({ error: 'next_path_invalid' }, { status: 400, headers: noStore })
  }
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404, headers: noStore })
  const tenantId = String(website.tenantId || '')
  if (!tenantId) return NextResponse.json({ error: 'tenant_identity_missing' }, { status: 409, headers: noStore })

  const statusResponse = await websiteBootstrapStatus(tenantId)
  if (!statusResponse.ok) return NextResponse.json({ error: 'workspace_status_unavailable' }, { status: 503, headers: noStore })
  const remote = await statusResponse.json().catch(() => null) as Record<string, unknown> | null
  if (
    !remote
    || remote.tenant_id !== tenantId
    || remote.workspace_ready !== true
    || typeof remote.website_live !== 'boolean'
  ) {
    return NextResponse.json({ error: 'workspace_not_ready' }, { status: 409, headers: noStore })
  }

  // The tenant record owns the address the admin is served from. A receipt or a
  // document copy written at bootstrap time goes stale as soon as the Worker is
  // renamed or a domain is attached, so the origin is resolved now instead of
  // comparing two old copies for equality.
  const identityResponse = await siteAgentRequest(tenantId, '/identity', {
    signal: AbortSignal.timeout(30_000),
  })
  const identity = identityResponse.ok
    ? await identityResponse.json().catch(() => null) as { adminUrl?: string } | null
    : null
  const verifiedAdmin = tenantAdminUrl(identity?.adminUrl)
  if (!verifiedAdmin) {
    return NextResponse.json({ error: 'verified_admin_origin_missing' }, { status: 409, headers: noStore })
  }

  try {
    const token = await issueOwnerHandoff({
      tenantId,
      ownerSubject: String(auth.user.id),
      targetOrigin: new URL(verifiedAdmin).origin,
    })
    return NextResponse.json({
      token,
      actionUrl: new URL('/api/helloada/handoff', verifiedAdmin).toString(),
      next,
    }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: 'owner_handoff_not_configured' }, { status: 503, headers: noStore })
  }
}
