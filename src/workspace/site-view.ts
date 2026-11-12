import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'
import type { HelloAdaSiteConfig } from '@/workspace/config/site'

type SnapshotSite = {
  name?: string
  url?: string
  tenantId?: string
  defaultLocale?: string
  locales?: string[]
  preview?: string
  content?: { primaryCollections?: string[]; settingsGlobals?: string[] }
  features?: { commerce?: boolean; posts?: boolean; social?: boolean; bookings?: boolean }
}

/**
 * Owner-scoped site view shared by the workspace and the mailbox.
 *
 * Both surfaces resolve the same website by its canonical slug, redirect any
 * legacy or non-canonical key, and read the tenant snapshot once. The mailbox
 * must not invent its own tenant lookup or its own copy of the site config.
 */
export async function loadSiteView(siteKey: string) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const website = await ownedWebsite(auth, siteKey)
  if (!website) notFound()
  const slug = String(website.slug || '')
  if (!slug) redirect('/portfolio')
  if (siteKey !== slug) redirect(sitePath(slug))
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) redirect(sitePath(slug, '/'))

  const response = await siteAgentRequest(tenantId, '/worker/workspace', {
    headers: { 'x-helloada-owner-subject': String(auth.user.id) },
    signal: AbortSignal.timeout(30_000),
  })
  const snapshot = response.ok ? await response.json() as { site?: SnapshotSite } : {}
  const site = snapshot.site || {}
  const workerUrl = String(website.workerUrl || '').replace(/\/$/, '')
  const origin = workerUrl || String(site.url || '').replace(/\/$/, '')
  const previewMount = String(site.preview || `/${tenantId}-preview`)
  const preview = /^https?:\/\//.test(previewMount)
    ? previewMount.replace(/\/$/, '')
    : `${origin}${previewMount.startsWith('/') ? '' : '/'}${previewMount}`

  const config: HelloAdaSiteConfig = {
    tenantId,
    siteName: String(site.name || website.name || 'Your website'),
    defaultLocale: String(site.defaultLocale || 'en'),
    locales: Array.isArray(site.locales) && site.locales.length ? site.locales : ['en'],
    routes: {
      workspaceApi: `/api/helloada/websites/${encodeURIComponent(slug)}/owner`,
      liveSite: String(site.url || origin),
      preview,
    },
    content: {
      primaryCollections: site.content?.primaryCollections || ['pages', 'posts', 'products', 'media'],
      settingsGlobals: site.content?.settingsGlobals || ['siteSettings', 'navigation'],
    },
    features: {
      commerce: Boolean(site.features?.commerce),
      posts: Boolean(site.features?.posts ?? true),
      social: Boolean(site.features?.social),
      bookings: Boolean(site.features?.bookings),
      inlineEditing: false,
    },
  }

  return { auth, website, slug, tenantId, config }
}
