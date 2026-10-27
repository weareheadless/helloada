import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { BrandLink } from '@/components/brand-link'
import { currentUser } from '@/lib/auth'
import { removedWebsiteIds } from '@/lib/portfolio'
import { ownerWebsiteIntelligence } from '@/lib/website'
import { isPlatformAdmin, websiteScope } from '@/lib/platform-admin'
import { CreateWebsiteForm, WebsiteVisibility, WebsiteScreenshot } from './ui'
import { IntelligenceSummary } from '../websites/[id]/intelligence-summary'

const phaseLabels: Record<string, string> = {
  intake: 'Getting started',
  designing: 'In progress',
  live: 'Live',
  needs_attention: 'Needs attention',
}

export default async function PortfolioPage() {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const administrator = isPlatformAdmin(auth.user)
  const websites = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    overrideAccess: false,
    where: websiteScope(auth.user),
    sort: '-updatedAt',
    pagination: false,
  })
  const removedIds = await removedWebsiteIds(auth)
  const visibleWebsites = websites.docs.filter((website) => !removedIds.has(String(website.id)))
  const removedWebsites = websites.docs.filter((website) => removedIds.has(String(website.id)))
  const intelligenceByWebsite = new Map(await Promise.all((administrator ? [] : visibleWebsites).map(async website => [
    String(website.id), await ownerWebsiteIntelligence(website.tenantId ? String(website.tenantId) : null),
  ] as const)))

  return (
    <main className="app-shell">
      <nav className="app-header"><BrandLink /><span className="text-link">{auth.user.email}</span></nav>
      <div className="app-main">
        <div className="app-intro">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> {administrator ? 'platform administrator · all websites' : 'your websites'}</div>
            <h1 className="app-heading">One place for<br /><em>every website.</em></h1>
          </div>
          <p>{administrator ? 'Every website across all accounts. Choose a website to open its admin; the account owner is shown on each card.' : 'Choose a website to open its admin, or create a new one. Ada will prepare the workspace and guide you from there.'}</p>
        </div>
        <section className="site-grid" aria-label={administrator ? 'All websites' : 'Your websites'}>
          {visibleWebsites.length === 0 ? (
            <div className="empty-card">Your websites will appear here. Create one to get started with Ada.</div>
          ) : visibleWebsites.map((website) => {
            const phase = String(website.phase || 'intake')
            return (
              <article className="site-card" key={website.id}>
                <WebsiteScreenshot id={String(website.id)} name={website.name} available={Boolean(website.workerUrl && website.tenantId)} />
                <Link className="site-card-link" href={'/websites/' + website.id}>
                  <div>
                    <span className="site-phase">{phaseLabels[phase] || 'In progress'}</span>
                    <h2>{website.name}</h2>
                    {administrator && <p className="site-owner">Owner: {typeof website.owner === 'object' ? website.owner.email : 'Account ' + website.owner}</p>}
                  </div>
                  <span className="site-url">Open website admin <span aria-hidden="true">↗</span></span>
                </Link>
                <WebsiteVisibility id={String(website.id)} name={website.name} removed={false} />
                {intelligenceByWebsite.has(String(website.id)) && <IntelligenceSummary result={intelligenceByWebsite.get(String(website.id))!} />}
              </article>
            )
          })}
        </section>
        <CreateWebsiteForm />
        {removedWebsites.length > 0 && (
          <details className="removed-websites">
            <summary>Removed websites ({removedWebsites.length})</summary>
            <p>Restore a website to return it to your portfolio. Removing a card only changes your own view.</p>
            {removedWebsites.map((website) => (
              <div className="removed-website" key={website.id}>
                <span>{website.name}</span>
                <WebsiteVisibility id={String(website.id)} name={website.name} removed />
              </div>
            ))}
          </details>
        )}
      </div>
    </main>
  )
}
