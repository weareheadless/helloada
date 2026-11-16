import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite } from '@/lib/website'
import { WorkspacePage } from '@/workspace/WorkspacePage'

export const dynamic = 'force-dynamic'

/**
 * The workspace keeps one canonical address: the site's readable slug.
 *
 * An owner can arrive with a tenant id (older links and bookmarks), a numeric
 * id, or a slug that has since been made readable. Resolving the website here
 * means those addresses keep working and land on the address the portfolio
 * links to, instead of a 404 for a site that exists.
 */
export default async function SiteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { site } = await params
  const { view } = await searchParams
  const auth = await currentUser(await headers())
  if (auth) {
    const website = await ownedWebsite(auth, site)
    const slug = website ? String(website.slug ?? '') : ''
    if (slug && slug !== site) {
      redirect(sitePath(slug) + (view ? `?view=${encodeURIComponent(view)}` : ''))
    }
  }
  return <WorkspacePage siteKey={site} view={view} />
}
