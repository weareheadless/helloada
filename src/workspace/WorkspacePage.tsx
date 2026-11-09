import { SiteNav, type SiteNavView } from './SiteNav'
import { loadSiteView } from './site-view'
import { WorkspaceClient } from './WorkspaceClient'

export async function WorkspacePage({
  siteKey,
  view: requestedView,
}: {
  siteKey: string
  view?: string
}) {
  const { slug, tenantId, config } = await loadSiteView(siteKey)
  const view = String(requestedView || '') as SiteNavView

  return (
    <>
      <SiteNav
        slug={slug}
        tenantId={tenantId}
        siteName={config.siteName}
        liveSite={config.routes.liveSite}
        bookings={Boolean(config.features.bookings)}
        view={view}
      />
      <WorkspaceClient config={config} />
    </>
  )
}
