import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { websiteScope } from '@/lib/platform-admin'
import { tenantWorkspacePath, type WorkspaceWebsite } from '@/lib/tenant-workspace'

export const dynamic = 'force-dynamic'

/**
 * The way into the owner's mailbox from a tenant surface.
 *
 * A tenant origin keeps the mail API, its data and its public booking
 * endpoints, but the mailbox itself is served here. A tenant therefore only
 * has to name its own runtime identity, and this resolves the readable address
 * it belongs to before opening the one mailbox.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  const auth = await currentUser(await headers())
  if (!auth) redirect(`/login?next=${encodeURIComponent(new URL(request.url).pathname)}`)

  const path = await tenantWorkspacePath(async (tenant) => {
    const found = await auth.payload.find({
      collection: 'websites',
      req: auth.req,
      overrideAccess: false,
      where: { and: [websiteScope(auth.user), { tenantId: { equals: tenant } }] },
      limit: 2,
      depth: 0,
    })
    return found.docs as WorkspaceWebsite[]
  }, tenantId, '/mail/inbox')

  redirect(path || '/portfolio')
}
