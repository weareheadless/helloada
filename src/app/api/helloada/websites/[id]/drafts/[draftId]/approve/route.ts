import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { approveWebsiteDraft } from '@/lib/website'
import { currentUser } from '@/lib/auth'
import { ownedWebsite } from '@/lib/website'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id, draftId } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })

  const response = await approveWebsiteDraft(String(website.tenantId), draftId)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) return NextResponse.json({ error: 'draft_approval_failed', detail: payload }, { status: response.status })
  return NextResponse.json(payload)
}
