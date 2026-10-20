import { headers } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { BrowserWorker } from '@cloudflare/puppeteer'
import { currentUser } from '@/lib/auth'
import { ownedWebsite } from '@/lib/website'
import { cachedScreenshot, managedScreenshotOrigin, screenshotRequestAllowed, verifiedScreenshotOrigin } from '@/lib/screenshot-policy'
import type { ScreenshotBucket } from '@/lib/screenshot-policy'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return Response.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return Response.json({ error: 'website_not_ready' }, { status: 404 })

  try {
    const candidate = managedScreenshotOrigin(website.workerUrl)
    if (!candidate) return Response.json({ error: 'website_not_ready' }, { status: 404 })
    const health = await fetch(candidate + '/api/health', {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    const origin = health.ok ? verifiedScreenshotOrigin(candidate, await health.json().catch(() => null), website.tenantId) : null
    if (!origin) return Response.json({ error: 'website_identity_unverified' }, { status: 503 })
    const { env } = await getCloudflareContext({ async: true })
    const bindings = env as unknown as { BROWSER: BrowserWorker; R2: ScreenshotBucket }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(origin)))
    const originHash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const key = `portfolio/screenshots/${website.id}/${originHash}.jpg`
    const image = await cachedScreenshot(bindings.R2, key, async () => {
      const { default: puppeteer } = await import('@cloudflare/puppeteer')
      const browser = await puppeteer.launch(bindings.BROWSER)
      try {
        const page = await browser.newPage()
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
        await page.setRequestInterception(true)
        page.on('request', (request) => {
          const allowed = screenshotRequestAllowed(request.url(), origin, request.isNavigationRequest())
          void (allowed ? request.continue() : request.abort()).catch(() => {})
        })
        const response = await page.goto(origin, { waitUntil: 'networkidle2', timeout: 25_000 })
        if (!response?.ok() || new URL(page.url()).origin !== origin) throw new Error('website_capture_failed')
        await page.evaluate(async () => { await document.fonts.ready })
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
        return page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })
      } finally { await browser.close() }
    })
    return new Response(image, { headers: {
      'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
    } })
  } catch {
    return Response.json({ error: 'screenshot_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
