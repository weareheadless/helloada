/**
 * What the workspace answers when an owner-facing address has no page.
 *
 * A document request inside the preview frame ran into Payload's REST
 * catch-all, which replied `{"message":"Route not found \"…\""}` — an owner
 * saw that JSON as the entire page. A page address is answered with a page;
 * only programmatic callers get JSON. Neither response names an internal route
 * or exposes the CMS.
 */

const escape = (value: string) => value.replace(/[&<>"]/g, (character) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] as string
))

const page = (title: string, detail: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px;
    background: #0d0f13; color: #e8e6e1;
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 460px; }
  p.eyebrow { margin: 0 0 14px; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #8d8f96; }
  h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.25; font-weight: 600; }
  p.detail { margin: 0; color: #a9abb2; }
  @media (prefers-color-scheme: light) {
    body { background: #faf8f4; color: #1b1d21; }
    p.eyebrow { color: #6f7178; }
    p.detail { color: #55575e; }
  }
</style>
</head>
<body><main>
  <p class="eyebrow">HelloAda</p>
  <h1>${escape(title)}</h1>
  <p class="detail">${escape(detail)}</p>
</main></body>
</html>
`

const pageResponse = (status: number, title: string, detail: string) => new Response(page(title, detail), {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
})

/** A browser asking for a document, as opposed to a fetch for data or an asset. */
export const documentRequest = (request: Request): boolean =>
  (request.headers.get('accept') || '').toLowerCase().includes('text/html')

/**
 * The compiled candidate is gone: its build was cleaned up, or the address came
 * from a workspace version that mounted previews somewhere else.
 */
export const previewUnavailable = (status = 404): Response => pageResponse(
  status,
  'This preview is no longer available',
  'The build behind it has finished or been cleaned up, or this address was opened by an earlier version of the workspace. Reload the workspace page to see the current preview.',
)

/** An address in the workspace API namespace that this app does not serve. */
export const workspacePathNotFound = (request: Request): Response => (
  documentRequest(request)
    ? pageResponse(
      404,
      'This page does not exist',
      'It may belong to an earlier version of the workspace. Reload the page you came from and try again.',
    )
    : Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } })
)
