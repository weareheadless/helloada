import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, websiteHistory } from '@/lib/website'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ revisions: [], drafts: [] })

  const response = await websiteHistory(String(website.tenantId))
  const payload = await response.json().catch(() => ({})) as { publishes?: unknown[]; drafts?: unknown[]; error?: string }
  if (!response.ok) return NextResponse.json({ error: payload.error || 'history_unavailable' }, { status: response.status })
  return NextResponse.json({ revisions: payload.publishes || [], drafts: payload.drafts || [] }, { headers: { 'cache-control': 'no-store' } })
}
