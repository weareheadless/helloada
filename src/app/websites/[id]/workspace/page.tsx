import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite } from '@/lib/website'

export const dynamic = 'force-dynamic'

export default async function LegacyWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const { view } = await searchParams
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()
  const slug = String(website.slug || '')
  if (!slug) redirect('/portfolio')
  redirect(`${sitePath(slug)}${view ? `?view=${encodeURIComponent(view)}` : ''}`)
}
