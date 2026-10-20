import { headers } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { BrowserWorker } from '@cloudflare/puppeteer'
import { currentUser } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { ownedWebsite } from '@/lib/website'
import { cachedScreenshot, captureWithBrowserCleanup, managedScreenshotOrigin, screenshotRequestAllowed, verifiedScreenshotOrigin } from '@/lib/screenshot-policy'
import type { ScreenshotBucket } from '@/lib/screenshot-policy'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentUser(await headers())
  if (!auth) return Response.json({ error: 'authentication_required' }, { status: 401 })
  const { id } = await params
  const website = await ownedWebsite(auth, id)
  if (!website) return Response.json({ error: 'website_not_found' }, { status: 404 })
  if (!website.tenantId) return Response.json({ error: 'website_not_ready' }, { status: 404 })

  let stage = 'health'
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
    stage = 'cache_read'
    const image = await cachedScreenshot(bindings.R2, key, async () => {
      stage = 'browser_import'
      const { default: puppeteer } = await import('@cloudflare/puppeteer')
      stage = 'browser_launch'
      const browser = await puppeteer.launch(bindings.BROWSER)
      return captureWithBrowserCleanup(async () => {
        stage = 'browser_page'
        const page = await browser.newPage()
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
        await page.setRequestInterception(true)
        page.on('request', (request) => {
          const allowed = screenshotRequestAllowed(request.url(), origin, request.isNavigationRequest())
          void (allowed ? request.continue() : request.abort()).catch(() => {})
        })
        stage = 'navigation'
        const response = await page.goto(origin, { waitUntil: 'networkidle2', timeout: 25_000 })
        if (!response?.ok() || new URL(page.url()).origin !== origin) throw new Error('website_capture_failed')
        stage = 'render'
        await page.evaluate(async () => { await document.fonts.ready })
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)))
        return page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })
      }, () => browser.close())
    })
    return new Response(image, { headers: {
      'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
    } })
  } catch (error) {
    const detail = error instanceof Error
      ? error.message.replace(/(?:https?|wss?):\/\/\S+/g, '[url]').replace(/[A-Za-z0-9_-]{48,}/g, '[identifier]').slice(0, 300)
      : 'Capture failed'
    return Response.json({
      error: 'screenshot_unavailable',
      ...(isPlatformAdmin(auth.user) ? { stage, detail } : {}),
    }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
