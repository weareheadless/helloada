export type PortableMediaLike = {
  id?: string | number | null
  sourceId?: string | null
  url?: string | null
  sourceUrl?: string | null
  originalUrl?: string | null
}

/** Resolve a portable media reference without coupling the admin to a customer migration model. */
export const mediaReferenceId = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const candidate = value as PortableMediaLike
  return String(candidate.sourceId || candidate.id || '').trim()
}

export const mediaUrl = (value: PortableMediaLike | null | undefined): string => {
  if (!value) return ''
  return String(value.url || value.sourceUrl || value.originalUrl || '').trim()
}

/**
 * The origin that serves tenant media. Payload returns media paths relative to
 * the tenant Worker (`/api/media/file/...`), so the control plane must resolve
 * them against the live site rather than its own origin.
 */
export const mediaOrigin = (liveSite: string): string => {
  const value = String(liveSite || '').trim()
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).origin
    } catch {
      // Fall through to this deployment for a malformed live URL.
    }
  }
  return typeof window === 'undefined' ? '' : window.location.origin
}

/**
 * Turn a tenant media reference into a browser URL. Absolute, protocol-relative,
 * `data:` and `blob:` values are already usable and stay untouched; a relative
 * tenant path is joined to the tenant origin.
 */
export const resolveMediaUrl = (
  value: string | PortableMediaLike | null | undefined,
  origin: string,
): string => {
  const raw = typeof value === 'string' ? value.trim() : mediaUrl(value)
  if (!raw) return ''
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return raw
  const base = String(origin || '').replace(/\/+$/, '')
  if (!base) return raw
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`
}
