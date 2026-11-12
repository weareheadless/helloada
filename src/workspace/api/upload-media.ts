/**
 * The tenant bridge stores one file per request. This ceiling is the bridge's
 * own 25 MB limit: it keeps the in-memory multipart body bounded across the
 * proxy chain, so the picker must promise the same number, not a bigger one.
 */
export const MEDIA_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024

/**
 * An upload is bounded by progress, not by a fixed wall clock. A clip on a slow
 * phone uplink legitimately takes minutes; a stalled connection still has to
 * be abandoned. These two budgets cover those different waits.
 */
const UPLOAD_IDLE_TIMEOUT_MS = 90_000
const UPLOAD_RESPONSE_TIMEOUT_MS = 180_000

export type MediaUploadKind = 'image' | 'video'

export type MediaUploadMessages = {
  unsupported: string
  tooLarge: string
  timedOut: string
  failed: string
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'])

const extensionOf = (name: string) => name.toLowerCase().split('.').pop() || ''

/**
 * The picker's pre-flight decision. The browser's MIME guess is not
 * authoritative — a phone clip can arrive as `application/octet-stream` — so
 * the filename is the second, stable signal. The tenant bridge makes the same
 * decision from the file's own bytes before it stores anything.
 */
export function mediaUploadKind(file: { type?: string | null; name?: string | null }): MediaUploadKind | undefined {
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  const extension = extensionOf(String(file.name || ''))
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return undefined
}

export function mediaUploadSizeError(size: number, tooLarge: string): string | undefined {
  return size > MEDIA_UPLOAD_LIMIT_BYTES ? tooLarge : undefined
}

type UploadOptions = {
  resolvePath?: (path: string) => string
  onProgress?: (progress: number) => void
  messages: MediaUploadMessages
}

/**
 * Send one file through the canonical `/media/upload` bridge.
 *
 * A single total timeout was wrong here: it treated a 200 KB still and a 20 MB
 * clip as the same transfer. XHR is used instead of fetch because it reports
 * upload progress, so a slow but living connection is allowed to finish while
 * a silent one is abandoned.
 */
export function uploadMediaFile<T>(file: File, options: UploadOptions): Promise<T> {
  const kind = mediaUploadKind(file)
  if (!kind) return Promise.reject(new Error(options.messages.unsupported))
  const sizeError = mediaUploadSizeError(file.size, options.messages.tooLarge)
  if (sizeError) return Promise.reject(new Error(sizeError))

  const resolvePath = options.resolvePath || ((path: string) => path)
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    let settled = false
    let idle: ReturnType<typeof setTimeout> | undefined

    const clearIdle = () => {
      if (idle !== undefined) clearTimeout(idle)
      idle = undefined
    }
    const finish = (error?: Error, value?: T) => {
      if (settled) return
      settled = true
      clearIdle()
      if (error) reject(error)
      else resolve(value as T)
    }
    const armIdle = () => {
      clearIdle()
      idle = setTimeout(() => {
        request.abort()
        finish(new Error(options.messages.timedOut))
      }, UPLOAD_IDLE_TIMEOUT_MS)
    }

    request.open('POST', resolvePath('/api/helloada/media/upload'))
    request.withCredentials = true
    // The wall clock is the wrong bound while bytes are moving; `armIdle`
    // watches progress and the response budget is armed once they are sent.
    request.timeout = 0
    request.upload.onprogress = (event) => {
      armIdle()
      if (!event.lengthComputable || event.total <= 0) return
      options.onProgress?.(Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100))))
    }
    request.upload.onload = () => {
      clearIdle()
      request.timeout = UPLOAD_RESPONSE_TIMEOUT_MS
    }
    request.onerror = () => finish(new Error(options.messages.failed))
    request.ontimeout = () => finish(new Error(options.messages.timedOut))
    request.onabort = () => finish(new Error(options.messages.timedOut))
    request.onload = () => {
      let body: { message?: string } & Record<string, unknown>
      try {
        body = JSON.parse(request.responseText || '{}') as typeof body
      } catch {
        finish(new Error(options.messages.failed))
        return
      }
      if (request.status < 200 || request.status >= 300) {
        const message = typeof body.message === 'string' ? body.message.trim() : ''
        finish(new Error(message || options.messages.failed))
        return
      }
      finish(undefined, body as T)
    }

    armIdle()
    const form = new FormData()
    form.append('file', file)
    request.send(form)
  })
}
