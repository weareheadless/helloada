import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { BrandLink } from '@/components/brand-link'
import { CreateWebsiteForm } from './ui'

export default async function PortfolioPage() {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const websites = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    where: { owner: { equals: auth.user.id } },
    sort: '-updatedAt',
    limit: 50,
  })

  return (
    <main className="app-shell">
      <nav className="app-header"><BrandLink /><span className="text-link">{auth.user.email}</span></nav>
      <div className="app-main">
        <div className="app-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> your portfolio</div><h1 className="app-heading">A home for<br /><em>every idea.</em></h1></div><p>Start with a conversation. Ada keeps the work, the preview, and the next decision together.</p></div>
        <section className="site-grid" aria-label="Your websites">
          {websites.docs.length === 0 ? <div className="empty-card">No websites yet. Give the first one a name and Ada will open its workspace.</div> : websites.docs.map((website) => <Link className="site-card" key={website.id} href={`/websites/${website.id}`}><div><span className="site-phase">{String(website.phase).replace('_', ' ')}</span><h2>{website.name}</h2></div><span className="site-url">{website.workerUrl || 'Worker URL appears during bootstrap'}</span></Link>)}
        </section>
        <CreateWebsiteForm />
      </div>
    </main>
  )
}
