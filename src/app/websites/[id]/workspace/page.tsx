import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth'
import { ownedWebsite, siteAgentRequest } from '@/lib/website'
import type { HelloAdaSiteConfig } from '@/workspace/config/site'

import { WorkspaceClient } from './workspace-client'

export const dynamic = 'force-dynamic'

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

export default async function WebsiteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const auth = await currentUser(await headers())
  if (!auth) redirect('/login')
  const { id } = await params
  const view = String((await searchParams).view || '')
  const website = await ownedWebsite(auth, id)
  if (!website) notFound()
  const tenantId = String(website.tenantId || '').trim()
  if (!tenantId) redirect(`/websites/${id}`)

  const workerUrl = String(website.workerUrl || '').replace(/\/$/, '')
  const subject = String(auth.user.id)
  const response = await siteAgentRequest(tenantId, '/worker/workspace', {
    headers: { 'x-helloada-owner-subject': subject },
    signal: AbortSignal.timeout(30_000),
  })
  const snapshot = response.ok
    ? await response.json() as { site?: SnapshotSite }
    : {}
  const site = snapshot.site || {}
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
      // The browser talks only to this control-plane app. Its server proxy
      // authenticates the owner and reaches the tenant workspace.
      workspaceApi: `/api/helloada/websites/${id}/owner`,
      liveSite: String(site.url || origin),
      preview,
      // The exact draft preview is tenant-session scoped; review it in the
      // tenant admin until the same-origin preview bridge exists.
      manage: `/admin-entry/${tenantId}`,
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
      // The published preview is served by the tenant Worker on another
      // origin. In-preview editing needs a same-origin document; the owner
      // edits through Manage content instead.
      inlineEditing: false,
    },
  }

  const nav = [
    { view: '', label: 'Workspace', href: `/websites/${id}/workspace` },
    { view: 'growth', label: 'Growth', href: `/websites/${id}/workspace?view=growth` },
    { view: 'gallery', label: 'Gallery', href: `/websites/${id}/workspace?view=gallery` },
    { view: 'history', label: 'History', href: `/websites/${id}/workspace?view=history` },
    { view: 'messages', label: 'Messages', href: `/websites/${id}/workspace?view=messages` },
    ...(config.features.bookings
      ? [{ view: 'calendar', label: 'Calendar', href: `/websites/${id}/workspace?view=calendar` }]
      : []),
  ]

  return (
    <>
      <nav className="helloada-control-nav" aria-label="Website workspace">
        <Link className="helloada-control-brand" href="/portfolio">
          <span className="helloada-control-brand-mark">A</span>
          HelloAda
        </Link>
        <span className="helloada-control-site">{config.siteName}</span>
        <div className="helloada-control-links">
          {nav.map((item) => (
            <Link key={item.label} href={item.href} aria-current={view === item.view ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
          {/* Messages is a control-plane view backed by the tenant mailbox
              bridge. The tenant admin remains for advanced content work. */}
          <Link className="is-separated" href={`/admin-entry/${tenantId}`}>Manage content ↗</Link>
          <a href={config.routes.liveSite} target="_blank" rel="noopener noreferrer">Open site ↗</a>
        </div>
      </nav>
      <WorkspaceClient config={config} />
    </>
  )
}
