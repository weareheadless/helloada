import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'
import { BrandLink } from '@/components/brand-link'
import { WebsiteRoom } from './room'

export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()
  const roomWebsite = {
    id: String(website.id),
    name: String(website.name || 'Untitled website'),
    phase: String(website.phase || 'intake'),
    workerUrl: website.workerUrl ? String(website.workerUrl) : null,
    adminUrl: website.adminUrl ? String(website.adminUrl) : null,
    tenantId: website.tenantId ? String(website.tenantId) : null,
  }
  const bootstrapJobs = await auth.payload.find({
    collection: 'bootstrap-jobs',
    req: auth.req,
    where: { website: { equals: website.id } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
  })
  const bootstrapJob = bootstrapJobs.docs[0]
  const bootstrap = {
    status: String(bootstrapJob?.status || 'queued'),
    step: String(bootstrapJob?.step || 'requested'),
    label: bootstrapJob?.step === 'ready' ? 'Workspace ready' : 'Opening your workspace',
    diagnostic: String(bootstrapJob?.diagnostic || ''),
  }
  let recommendations: Array<{ id: number; title: string; summary: string; action_label: string }> = []
  if (roomWebsite.tenantId) {
    const response = await siteAgentRequest(roomWebsite.tenantId, '/design/recommendations')
    if (response.ok) {
      const body = await response.json() as { recommendations?: Array<{ id: number; title: string; summary: string; action_label: string }> }
      recommendations = body.recommendations || []
    }
  }

  return (
    <main className="app-shell">
      <nav className="app-header"><BrandLink href="/portfolio" /><Link className="text-link" href="/portfolio">All websites ↗</Link></nav>
      <div className="app-main">
        <div className="app-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> {website.phase}</div><h1 className="app-heading">{website.name}<br /><em>is taking shape.</em></h1></div><p>Tell Ada what matters. She will keep the brief close, show the real site, and pause when there is a meaningful choice.</p></div>
        <WebsiteRoom website={roomWebsite} bootstrap={bootstrap} initialRecommendations={recommendations} />
      </div>
    </main>
  )
}
