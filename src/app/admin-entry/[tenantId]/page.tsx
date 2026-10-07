import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { ProjectEntry } from '@/app/websites/[id]/project-entry'

export const dynamic = 'force-dynamic'

export default async function AdminEntryPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(tenantId)) notFound()

  const returnPath = `/admin-entry/${encodeURIComponent(tenantId)}`
  const auth = await currentUser(await headers())
  if (!auth) redirect(`/login?next=${encodeURIComponent(returnPath)}`)

  const websites = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: {
      and: [
        { owner: { equals: auth.user.id } },
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
        <ProjectEntry websiteId={String(website.id)} name={String(website.name || 'your website')} />
      </div>
    </main>
  )
}
