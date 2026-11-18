import Link from 'next/link'

import { sitePath } from '@/lib/site-url'
import { HelloAdaMark } from '@/workspace/components/HelloAdaLogo'

export type SiteNavView = '' | 'growth' | 'gallery' | 'history' | 'messages' | 'calendar' | 'settings'

/**
 * The single control-plane navigation for a website. The workspace and the
 * mailbox both render it, so the owner is never handed a second shell — and it
 * carries the same HelloAda lockup as the marketing site and the portfolio.
 */
export function SiteNav({
  slug,
  tenantId,
  siteName,
  liveSite,
  bookings,
  view,
}: {
  slug: string
  tenantId: string
  siteName: string
  liveSite: string
  bookings: boolean
  view: SiteNavView
}) {
  const base = sitePath(slug)
  const items: Array<{ view: SiteNavView; label: string; href: string }> = [
    { view: '', label: 'Workspace', href: base },
    { view: 'growth', label: 'Growth', href: `${base}?view=growth` },
    { view: 'gallery', label: 'Gallery', href: `${base}?view=gallery` },
    { view: 'history', label: 'History', href: `${base}?view=history` },
    { view: 'messages', label: 'Messages', href: sitePath(slug, '/mail') },
    ...(bookings ? [{ view: 'calendar' as const, label: 'Calendar', href: sitePath(slug, '/mail/calendar') }] : []),
    { view: 'settings', label: 'Settings', href: sitePath(slug, '/settings') },
  ]

  return (
    <nav className="helloada-control-nav" aria-label="Website workspace">
      <Link className="helloada-control-brand wordmark" href="/portfolio" aria-label="HelloAda portfolio">
        <HelloAdaMark size={26} />
        <span>HelloAda</span>
      </Link>
      <span className="helloada-control-site">{siteName}</span>
      <div className="helloada-control-links">
        {items.map((item) => (
          <Link key={item.label} href={item.href} aria-current={view === item.view ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
        <Link className="is-separated" href={`/admin-entry/${tenantId}`}>Manage content ↗</Link>
        <a href={liveSite} target="_blank" rel="noopener noreferrer">Open site ↗</a>
      </div>
    </nav>
  )
}
