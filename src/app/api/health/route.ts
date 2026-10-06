export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store, max-age=0' }

export async function GET() {
  const releaseSha = String(process.env.HELLOADA_RELEASE_SHA || '')
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    return Response.json({ ok: false, error: 'release_identity_missing' }, {
      status: 503,
      headers: noStore,
    })
  }

  return Response.json({ ok: true, service: 'helloada', releaseSha }, { headers: noStore })
}
