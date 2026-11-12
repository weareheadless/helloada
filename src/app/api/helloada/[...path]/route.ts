import { workspacePathNotFound } from '@/lib/unavailable'

export const dynamic = 'force-dynamic'

/**
 * The workspace API namespace owns its own misses.
 *
 * Without this, an unknown `/api/helloada/*` path fell through to the CMS's
 * REST catch-all, so a page request inside the preview frame rendered
 * `{"message":"Route not found …"}` as the document. A page address gets a
 * page, a data caller gets JSON, and neither learns anything about Payload.
 */
async function notFound(request: Request) {
  return workspacePathNotFound(request)
}

export const GET = notFound
export const HEAD = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
