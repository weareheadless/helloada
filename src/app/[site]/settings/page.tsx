import { SettingsPage } from '@/workspace/SettingsPage'

export const dynamic = 'force-dynamic'

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ site: string }>
}) {
  const { site } = await params
  return <SettingsPage siteKey={site} />
}
