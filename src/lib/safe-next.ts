const LOCAL_ORIGIN = 'https://helloada.app'

/**
 * Accept only a local path for a post-handoff destination.
 *
 * The tenant validates the same value again against its own origin; this
 * function keeps the control-plane side from ever minting an open redirect.
 */
export function safeNextPath(value: unknown, fallback = '/admin'): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    throw new Error('next_path_invalid')
  }
  const resolved = new URL(raw, LOCAL_ORIGIN)
  if (resolved.origin !== LOCAL_ORIGIN) throw new Error('next_path_invalid')
  return `${resolved.pathname}${resolved.search}`
}
