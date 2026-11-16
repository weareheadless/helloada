import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { websiteScope } from '@/lib/platform-admin'
import { tenantWorkspacePath, type WorkspaceWebsite } from '@/lib/tenant-workspace'

export const dynamic = 'force-dynamic'

/**
 * The way back into a site from a tenant surface.
 *
 * A tenant admin knows only its own runtime identity. Opening the owner's
 * workspace from there means resolving the readable address this app owns, which
 * also keeps a site created before readable identities on its own slug instead
 * of producing the identity as a URL.
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
  }, tenantId)

  redirect(path || '/portfolio')
}
