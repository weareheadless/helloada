import { helloAdaPath } from '../config/site'
import { asJsonAnswer } from './json-answer'

const ADMIN_REQUEST_TIMEOUT_MS = 25_000
/** The workspace snapshot names every route and document; on a large site it is
 * slow enough that a busy platform outlasts a normal request timeout. */
export const WORKSPACE_SNAPSHOT_TIMEOUT_MS = 60_000

export const fetchHelloAda = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = ADMIN_REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const forwardAbort = () => controller.abort()

  if (init.signal?.aborted) controller.abort()
  else init.signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const resolvedInput = typeof input === 'string' ? helloAdaPath(input) : input
    const response = await fetch(resolvedInput, { ...init, signal: controller.signal })
    // The bridge may answer with the edge's plain text while the platform
    // restarts; every caller here parses JSON, so normalise it once, here.
    return await asJsonAnswer(response)
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', forwardAbort)
  }
}
