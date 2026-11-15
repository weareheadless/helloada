import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { sitePath } from '@/lib/site-url'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'
import type { HelloAdaSiteConfig } from '@/workspace/config/site'

type SnapshotIdentity = {
  tenantId?: string
  workerName?: string
  workerUrl?: string
  publicUrl?: string
  adminUrl?: string
  payloadUrl?: string
  registeredDomain?: string
  canonicalHost?: string
}

/**
 * Keep the platform's copy of a website's addresses in step with the tenant
 * record. The record owns them; this doc is a projection that older links and
 * listings still read, so it is refreshed whenever the two disagree.
 */
async function reconcileWebsiteIdentity(
  auth: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  website: { id: number | string; workerUrl?: string | null; adminUrl?: string | null },
  identity: SnapshotIdentity,
) {
  try {
    await auth.payload.update({
      collection: 'websites',
      id: website.id,
      req: auth.req,
      overrideAccess: true,
      data: {
        workerUrl: identity.workerUrl || undefined,
        adminUrl: identity.adminUrl || undefined,
        domainStatus: identity.publicUrl && !/\.workers\.dev\/?$/.test(identity.publicUrl)
          ? 'connected'
          : 'not_connected',
      },
    })
  } catch {
    // A projection that cannot be refreshed must never fail the owner's page.
  }
}

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

  const [response, identityResponse] = await Promise.all([
    siteAgentRequest(tenantId, '/worker/workspace', {
      headers: { 'x-helloada-owner-subject': String(auth.user.id) },
      signal: AbortSignal.timeout(30_000),
    }),
    siteAgentRequest(tenantId, '/identity', { signal: AbortSignal.timeout(30_000) }),
  ])
  const snapshot = response.ok ? await response.json() as { site?: SnapshotSite } : {}
  const site = snapshot.site || {}
  const identity = identityResponse.ok
    ? await identityResponse.json().catch(() => null) as SnapshotIdentity | null
    : null
  // The tenant record owns these addresses. The doc's copy is only a fallback
  // for an old bootstrap, and is refreshed as soon as the two disagree.
  const origin = String(identity?.workerUrl || website.workerUrl || site.url || '').replace(/\/$/, '')
  const liveSite = String(identity?.publicUrl || site.url || origin || '/')
  // The preview mount is a path on the live origin, exactly as the Worker
  // rewrites it. Deriving it from the tenant identity rather than from a Worker
  // URL means a domain attach or a Worker rename never strands the frame.
  const previewMount = String(site.preview || `/${tenantId}-preview`)
  const preview = /^https?:\/\//.test(previewMount)
    ? previewMount.replace(/\/$/, '')
    : `/${previewMount.replace(/^\/+/, '').replace(/\/$/, '')}`
  if (
    identity
    && (String(website.workerUrl || '') !== String(identity.workerUrl || '')
      || String(website.adminUrl || '') !== String(identity.adminUrl || ''))
  ) {
    await reconcileWebsiteIdentity(auth, website, identity)
  }

  const config: HelloAdaSiteConfig = {
    tenantId,
    siteName: String(site.name || website.name || 'Your website'),
    defaultLocale: String(site.defaultLocale || 'en'),
    locales: Array.isArray(site.locales) && site.locales.length ? site.locales : ['en'],
    routes: {
      workspaceApi: `/api/helloada/websites/${encodeURIComponent(slug)}/owner`,
      liveSite,
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
