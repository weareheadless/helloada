/**
 * Owner-facing site URLs.
 *
 * A website's runtime identity is its immutable `tenantId`; its URL uses the
 * human `slug`. They are deliberately separate: a tenant rename or a legacy
 * `site-<digest>` tenant must never change where the owner finds their site,
 * and a readable slug must never be mistaken for a runtime identity.
 */

/** First path segments the app already owns; a site slug may not shadow them. */
export const RESERVED_SITE_SLUGS = new Set([
  '_next',
  'admin',
  'admin-entry',
  'api',
  'favicon.ico',
  'icon.svg',
  'login',
  'portfolio',
  'robots.txt',
  'signup',
  'sitemap.xml',
  'websites',
])

const MAX_SLUG_LENGTH = 48

/** Deterministic, URL-safe label from a website name. */
export function siteSlugFromName(name: string): string {
  const base = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  return base || 'site'
}

export function isRoutableSiteSlug(value: unknown): value is string {
  return typeof value === 'string'
    && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
    && !RESERVED_SITE_SLUGS.has(value)
}

export function sitePath(slug: string, suffix = '/workspace'): string {
  const base = `/${encodeURIComponent(slug)}`
  if (!suffix || suffix === '/') return base
  return `${base}${suffix.startsWith('/') ? '' : '/'}${suffix}`
}

/**
 * Allocates a unique, routable slug. Reserved and taken labels get a numeric
 * suffix so a site called "Portfolio" or a second "Casamigo" still has a URL
 * that resolves to exactly one website.
 */
export async function uniqueSiteSlug(
  isTaken: (slug: string) => Promise<boolean>,
  name: string,
): Promise<string> {
  const base = siteSlugFromName(name)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!isRoutableSiteSlug(candidate)) continue
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error('site_slug_unavailable')
}
