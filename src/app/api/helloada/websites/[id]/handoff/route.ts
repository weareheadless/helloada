import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { issueOwnerHandoff } from '@/lib/owner-handoff'
import { ownedWebsite, websiteBootstrapStatus } from '@/lib/website'

export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store, max-age=0', 'referrer-policy': 'no-referrer' }

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore })

  const { id } = await params
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

  const receipts = remote.resource_receipts && typeof remote.resource_receipts === 'object'
    ? remote.resource_receipts as Record<string, unknown>
    : {}
  const worker = receipts.creating_worker && typeof receipts.creating_worker === 'object'
    ? String((receipts.creating_worker as { worker_url?: unknown }).worker_url || '')
    : ''
  const workerOrigin = worker.replace(/\/$/, '')
  const registeredAdmin = tenantAdminUrl(website.adminUrl)
  const verifiedAdmin = tenantAdminUrl(workerOrigin ? workerOrigin + '/admin' : '')
  if (!verifiedAdmin || !registeredAdmin || verifiedAdmin !== registeredAdmin) {
    return NextResponse.json({ error: 'verified_admin_origin_missing_or_mismatched' }, { status: 409, headers: noStore })
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
    }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: 'owner_handoff_not_configured' }, { status: 503, headers: noStore })
  }
}
