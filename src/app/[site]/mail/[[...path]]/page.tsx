import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

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
  const language = (await cookies()).get('payload-lng')?.value || 'en'

  return (
    <>
      <SiteNav
        slug={slug}
        tenantId={tenantId}
        siteName={config.siteName}
        liveSite={config.routes.liveSite}
        bookings={Boolean(config.features.bookings)}
        view={mailboxPath === '/calendar' ? 'calendar' : 'messages'}
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
