import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { BrandLink } from '@/components/brand-link'
import { currentUser } from '@/lib/auth'
import { CreateWebsiteForm } from './ui'

const phaseLabels: Record<string, string> = {
  intake: 'Getting started',
  designing: 'In progress',
  live: 'Live',
  needs_attention: 'Needs attention',
}

export default async function PortfolioPage() {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const websites = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: { owner: { equals: auth.user.id } },
    sort: '-updatedAt',
    pagination: false,
  })

  return (
    <main className="app-shell">
      <nav className="app-header"><BrandLink /><span className="text-link">{auth.user.email}</span></nav>
      <div className="app-main">
        <div className="app-intro">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> your websites</div>
            <h1 className="app-heading">One place for<br /><em>every website.</em></h1>
          </div>
          <p>Choose a website to open its admin, or create a new one. Ada will prepare the workspace and guide you from there.</p>
        </div>
        <section className="site-grid" aria-label="Your websites">
          {websites.docs.length === 0 ? (
            <div className="empty-card">Your websites will appear here. Create one to get started with Ada.</div>
          ) : websites.docs.map((website) => {
            const phase = String(website.phase || 'intake')
            return (
              <Link className="site-card" key={website.id} href={'/websites/' + website.id}>
                <div>
                  <span className="site-phase">{phaseLabels[phase] || 'In progress'}</span>
                  <h2>{website.name}</h2>
                </div>
                <span className="site-url">Open website admin <span aria-hidden="true">↗</span></span>
              </Link>
            )
          })}
        </section>
        <CreateWebsiteForm />
      </div>
    </main>
  )
}
