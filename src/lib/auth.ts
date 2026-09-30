import { createLocalReq, getPayload } from 'payload'
import type { PayloadRequest, TypedUser } from 'payload'

import config from '@payload-config'

export async function currentUser(headers: Headers): Promise<{ user: TypedUser; payload: Awaited<ReturnType<typeof getPayload>>; req: Partial<PayloadRequest> } | null> {
  const payload = await getPayload({ config })
  const req = await createLocalReq(
    { req: { headers, method: 'GET', url: 'https://helloada.app/' } },
    payload,
  )
  const result = await payload.auth({ headers, req })
  if (!result.user) return null
  const authenticatedReq = await createLocalReq({ req, user: result.user }, payload)
  return { user: result.user, payload, req: authenticatedReq }
}
