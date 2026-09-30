import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return NextResponse.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return NextResponse.json({ website, recommendations: [], bootstrap: 'pending' })
  const response = await siteAgentRequest(String(website.tenantId), '/design/recommendations')
  const recommendations = response.ok ? await response.json() : []
  return NextResponse.json({ website, recommendations: recommendations.recommendations || [], bootstrap: response.ok ? 'ready' : 'pending' })
}
