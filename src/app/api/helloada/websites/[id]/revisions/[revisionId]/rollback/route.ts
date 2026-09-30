import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, restoreWebsiteVersion } from '@/lib/website'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id, revisionId } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })

  const response = await restoreWebsiteVersion(String(website.tenantId), revisionId)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) return NextResponse.json({ error: 'rollback_unavailable', detail: payload }, { status: response.status })
  return NextResponse.json({ ...payload, reviewRequired: true }, { status: 202 })
}
