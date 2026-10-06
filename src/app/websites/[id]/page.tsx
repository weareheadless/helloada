import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { BrandLink } from '@/components/brand-link'
import { currentUser } from '@/lib/auth'
import { tenantAdminUrl } from '@/lib/tenant-admin'
import { ownedWebsite } from '@/lib/website'
import { ProjectEntry } from './project-entry'

export const dynamic = 'force-dynamic'

export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()

  const adminUrl = tenantAdminUrl(website.adminUrl)
  if (adminUrl && website.phase !== 'intake') redirect(adminUrl)

  return (
    <main className="app-shell">
      <nav className="app-header">
        <BrandLink href="/portfolio" />
        <Link className="text-link" href="/portfolio">All websites</Link>
      </nav>
      <div className="app-main">
        <div className="eyebrow"><span className="eyebrow-dot" /> getting your workspace ready</div>
        <h1 className="app-heading">{website.name}</h1>
        <ProjectEntry websiteId={String(website.id)} name={String(website.name || 'Your website')} />
      </div>
    </main>
  )
}
