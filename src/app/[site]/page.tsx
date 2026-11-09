import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { BrandLink } from '@/components/brand-link'
import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite, ownerWebsiteIntelligence } from '@/lib/website'
import { IntelligenceSummary, type IntelligenceResult } from '@/workspace/components/IntelligenceSummary'
import { ProjectEntry } from '@/workspace/components/ProjectEntry'

export const dynamic = 'force-dynamic'

export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { site } = await params
  const website = await ownedWebsite(auth, site)
  if (!website) notFound()
  const slug = String(website.slug || '')
  if (!slug) redirect('/portfolio')
  if (site !== slug) redirect(sitePath(slug, '/'))
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
        <ProjectEntry websiteKey={slug} name={String(website.name || 'Your website')} />
      </div>
    </main>
  )
}
