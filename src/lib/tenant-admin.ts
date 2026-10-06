export function tenantAdminUrl(value: unknown): string | null {
  const candidate = String(value || '').trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    if (!url.pathname.endsWith('/admin')) url.pathname = url.pathname.replace(/\/+$/, '') + '/admin'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}
