import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { websiteScope } from '@/lib/platform-admin'
import { ProjectEntry } from '@/workspace/components/ProjectEntry'
import { safeNextPath } from '@/lib/safe-next'

export const dynamic = 'force-dynamic'

export default async function AdminEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<{ next?: string }>
}) {
  const { tenantId } = await params
  let next: string | undefined
  try {
    next = safeNextPath((await searchParams).next, '')
  } catch {
    next = undefined
  }
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(tenantId)) notFound()

  const returnPath = `/admin-entry/${encodeURIComponent(tenantId)}`
  const auth = await currentUser(await headers())
  if (!auth) redirect(`/login?next=${encodeURIComponent(returnPath)}`)

  const websites = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    overrideAccess: false,
    where: {
      and: [
        websiteScope(auth.user),
        { tenantId: { equals: tenantId } },
      ],
    },
    limit: 2,
    depth: 0,
  })
  if (websites.docs.length !== 1) notFound()

  const website = websites.docs[0]
  return (
    <main className="app-shell">
      <div className="app-main">
        <div className="eyebrow"><span className="eyebrow-dot" /> secure workspace handoff</div>
        <h1 className="app-heading">Opening {website.name}</h1>
        <ProjectEntry websiteKey={String(website.slug || website.tenantId || website.id)} name={String(website.name || 'your website')} next={next || undefined} />
      </div>
    </main>
  )
}
