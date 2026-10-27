import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { BrandLink } from '@/components/brand-link'
import { currentUser } from '@/lib/auth'
import { ownedWebsite, ownerWebsiteIntelligence } from '@/lib/website'
import { ProjectEntry } from './project-entry'
import { IntelligenceSummary, type IntelligenceResult } from './intelligence-summary'

export const dynamic = 'force-dynamic'

export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()
  const intelligence: IntelligenceResult = await ownerWebsiteIntelligence(website.tenantId ? String(website.tenantId) : null)

  return (
    <main className="app-shell">
      <nav className="app-header">
        <BrandLink href="/portfolio" />
        <Link className="text-link" href="/portfolio">All websites</Link>
      </nav>
      <div className="app-main">
        <div className="eyebrow"><span className="eyebrow-dot" /> opening your workspace</div>
        <h1 className="app-heading">{website.name}</h1>
        <IntelligenceSummary result={intelligence} />
        <ProjectEntry websiteId={String(website.id)} name={String(website.name || 'Your website')} />
      </div>
    </main>
  )
}
