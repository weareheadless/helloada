import { WorkspacePage } from '@/workspace/WorkspacePage'

export const dynamic = 'force-dynamic'

export default async function SiteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { site } = await params
  const { view } = await searchParams
  return <WorkspacePage siteKey={site} view={view} />
}
