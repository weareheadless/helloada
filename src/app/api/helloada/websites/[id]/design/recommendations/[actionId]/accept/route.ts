import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { mirrorOperation, ownedWebsite, siteAgentRequest } from '@/lib/website'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id, actionId } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ error: 'workspace_bootstrap_pending' }, { status: 409 })
  const response = await siteAgentRequest(String(website.tenantId), `/design/recommendations/${encodeURIComponent(actionId)}/accept`, {
    method: 'POST',
    body: JSON.stringify(await request.json().catch(() => ({}))),
  })
  const body = await response.json().catch(() => ({})) as { operation?: Record<string, unknown> }
  if (response.ok && body.operation) {
    await mirrorOperation(auth, website.id, body.operation)
  }
  return NextResponse.json(body, { status: response.status })
}
