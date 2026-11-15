import { siteAgentRequest } from '@/lib/website'

import { SiteNav } from './SiteNav'
import { SiteSettings, type SiteSettingsSnapshot } from './components/SiteSettings'
import { loadSiteView } from './site-view'

/**
 * The website's one settings surface.
 *
 * Identity, domain, mail and SEO all describe the same tenant record. Keeping
 * them on one page is what stops a domain change, a mailbox and a Search
 * Console property from drifting into three different answers.
 */
export async function SettingsPage({ siteKey }: { siteKey: string }) {
  const { slug, tenantId, config, website } = await loadSiteView(siteKey)
  let initial: SiteSettingsSnapshot | null = null
  let initialError = ''
  try {
    const response = await siteAgentRequest(tenantId, '/settings', {
      signal: AbortSignal.timeout(40_000),
    })
    if (response.ok) {
      initial = await response.json() as SiteSettingsSnapshot
    } else {
      initialError = response.status === 409
        ? 'This website is still being set up, so its record is not readable yet.'
        : `The website record could not be read (${response.status}).`
    }
  } catch {
    initialError = 'The website record could not be reached. Try again in a moment.'
  }
  return (
    <>
      <SiteNav
        slug={slug}
        tenantId={tenantId}
        siteName={config.siteName}
        liveSite={config.routes.liveSite}
        bookings={Boolean(config.features.bookings)}
        view="settings"
      />
      <main className="helloada-settings-page">
        <SiteSettings
          slug={slug}
          websiteName={String(website.name || config.siteName || '')}
          initial={initial}
          initialError={initialError}
        />
      </main>
    </>
  )
}
