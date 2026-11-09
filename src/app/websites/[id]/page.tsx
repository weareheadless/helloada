import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite } from '@/lib/website'

export const dynamic = 'force-dynamic'

/**
 * Legacy owner link. The canonical URL is the readable site slug; a numeric id
 * keeps working by redirecting to it, so no bookmark or email breaks.
 */
export default async function LegacyWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()
  const slug = String(website.slug || '')
  if (!slug) redirect('/portfolio')
  redirect(sitePath(slug, '/'))
}
