import { headers } from 'next/headers'
import { currentUser } from '@/lib/auth'
import { setWebsiteRemoved } from '@/lib/portfolio'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 })
  }
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || typeof body?.removed !== 'boolean') {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }
  const found = await setWebsiteRemoved(auth, Number(id), body.removed)
  if (!found) return Response.json({ error: 'website_not_found' }, { status: 404 })
  return Response.json({ removed: body.removed }, { headers: { 'cache-control': 'no-store' } })
}
