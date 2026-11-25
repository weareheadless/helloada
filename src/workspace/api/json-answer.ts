/**
 * Hand every caller a JSON answer, even when the bridge did not send one.
 *
 * Every caller of `fetchHelloAda` reads the body as JSON before it looks at the
 * status, which is the right order only while the body really is JSON. During a
 * platform restart, or while a Worker is booting, the edge answers with plain
 * text - `error code: 502` - and the parser's message ("Unexpected token 'e'")
 * became the owner's explanation of why their website would not load.
 *
 * A failed request is not a parsing event. The status is preserved, the body is
 * replaced with an empty object so the caller's own translated message is what
 * the owner sees, and no parser text ever reaches the screen.
 */
export const asJsonAnswer = async (response: Response): Promise<Response> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('json') || response.status === 204 || response.status === 205) return response
  try {
    await response.body?.cancel()
  } catch {
    // Already read or closed: the body is being replaced either way.
  }
  return new Response(JSON.stringify({}), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}
