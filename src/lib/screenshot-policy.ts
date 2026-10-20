export function managedScreenshotOrigin(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(url.hostname)
      || !screenshotRequestAllowed(url.origin, url.origin, false)) return null
    return url.origin
  } catch { return null }
}

export function verifiedScreenshotOrigin(candidate: unknown, health: Record<string, unknown> | null, tenantId: string): string | null {
  if (!health || health.ok !== true || health.service !== 'helloada-site' || health.tenant !== tenantId) return null
  return managedScreenshotOrigin(candidate)
}

export function screenshotRequestAllowed(candidate: string, origin: string, navigation: boolean): boolean {
  try {
    const url = new URL(candidate)
    if (navigation) return url.origin === origin && url.protocol === 'https:'
    if (url.protocol === 'data:' || url.protocol === 'blob:') return true
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase()
    return hostname.includes('.') && !/[\[\]:]/.test(hostname) && !/^[\d.]+$/.test(hostname)
      && !/(^|\.)(localhost|local|lan|home|internal|test|invalid|example|onion|arpa)$/.test(hostname)
  } catch { return false }
}

export interface ScreenshotBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; uploaded: Date } | null>
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>
}

const pending = new Map<string, Promise<ArrayBuffer>>()

export async function cachedScreenshot(bucket: ScreenshotBucket, key: string, capture: () => Promise<Uint8Array>): Promise<ArrayBuffer> {
  const cached = await bucket.get(key)
  if (cached && Date.now() - cached.uploaded.getTime() < 86_400_000) return cached.arrayBuffer()
  const existing = pending.get(key)
  if (existing) return existing
  const job = (async () => {
    const bytes = await capture()
    if (!bytes.byteLength || bytes.byteLength > 5_000_000) throw new Error('screenshot_invalid')
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    return Uint8Array.from(bytes).buffer
  })()
  pending.set(key, job)
  try { return await job } finally { pending.delete(key) }
}
