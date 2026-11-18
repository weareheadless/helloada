import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { MailboxApp } from '@weareheadless/helloada-mailbox-ui'

import { sitePath } from '@/lib/site-url'
import { SiteNav } from '@/workspace/SiteNav'
import { loadSiteView } from '@/workspace/site-view'

export const dynamic = 'force-dynamic'

export default async function SiteMailPage({
  params,
}: {
  params: Promise<{ site: string; path?: string[] }>
}) {
  const { site, path } = await params
  const { slug, tenantId, config } = await loadSiteView(site)
  const mailboxPath = `/${(path || []).join('/')}`.replace(/\/$/, '') || '/'
  // The mailbox landing is the inbox; there is no upstream root page.
  if (mailboxPath === '/') redirect(sitePath(slug, '/mail/inbox'))
  // The generated package ships the mail routes and the owner calendar. Its
  // booking editor is not part of it: the tenant booking API is HelloAda's
  // settings model, so there is no page here to render for that path.
  if (mailboxPath === '/booking' || mailboxPath.startsWith('/booking/')) notFound()
  // Settings and Drive live outside the package, so they keep going to the
  // real surface instead of rendering an empty window.
  if (mailboxPath === '/settings' || mailboxPath.startsWith('/settings/')) {
    redirect(sitePath(slug, '/settings'))
  }
  if (mailboxPath === '/drive' || mailboxPath.startsWith('/drive/')) {
    redirect(sitePath(slug, '/'))
  }
  const language = (await cookies()).get('payload-lng')?.value || 'en'
  const onCalendar = mailboxPath === '/calendar' || mailboxPath.startsWith('/calendar/')

  return (
    <>
      <SiteNav
        slug={slug}
        tenantId={tenantId}
        siteName={config.siteName}
        liveSite={config.routes.liveSite}
        bookings={Boolean(config.features.bookings)}
        view={onCalendar ? 'calendar' : 'messages'}
      />
      <main className="helloada-mailbox-page">
        <MailboxApp
          config={{
            apiBase: `/api/helloada/websites/${encodeURIComponent(slug)}/owner/mail`,
            basePath: sitePath(slug, '/mail'),
          }}
          path={mailboxPath}
          locale={language}
        />
      </main>
    </>
  )
}
