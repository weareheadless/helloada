/**
 * Where the compiled candidate is served.
 *
 * A preview is a complete Next application, so it lives on its own origin at a
 * path the preview service signs for this exact job. The workspace never
 * composes that address; it frames the one URL the build reports, and the
 * full-screen tab opens the same value. Nothing here has to agree with a route
 * in this app, which is what made every previous mismatch a broken preview.
 */
export const previewUrlForRoute = (url: string | undefined, route: string): string | undefined => {
  const base = String(url || '').trim()
  if (!/^https:\/\/[^/\s]+\//.test(base) || /[\s"'<>]/.test(base)) return undefined
  const target = String(route || '/').trim() || '/'
  const path = target === '/' ? '' : '/' + target.replace(/^\/+/, '').replace(/\/+$/, '')
  return `${base.replace(/\/+$/, '')}${path}`
}
