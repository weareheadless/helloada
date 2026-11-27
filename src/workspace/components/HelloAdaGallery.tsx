'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { fetchHelloAda } from '../api/fetchHelloAda'
import { useHelloAdaTranslations } from '../api/useHelloAdaTranslations'
import { useHelloAdaSite } from '../config/provider'
import { helloAdaPath } from '../config/site'
import { mediaOrigin, mediaUrl, resolveMediaUrl } from '../lib/media'
import { filterMedia, mediaCounts, mediaKind, type GalleryFilter } from '../lib/gallery-filter'
import { mediaUploadKind, uploadMediaFile } from '../api/upload-media'
import { ownerNoteChanged, ownerNoteRequest } from '../lib/owner-note'
import { WorkspaceIcon } from './WorkspaceIcon'
import { responseMessage } from '../api/response-message'

type GalleryMedia = {
  id: string | number
  url?: string | null
  filename?: string | null
  alt?: string | null
  sourceId?: string | null
  sourceUrl?: string | null
  originalUrl?: string | null
  sourcePages?: string[]
  mimeType?: string | null
  description?: string | null
  analysisStatus?: string | null
  tags?: string[]
  /** The owner's own words about this file. Ada reads it; analysis never rewrites it. */
  ownerNote?: string | null
  /** The exact revision the note was read at, so a save cannot overwrite a newer change. */
  documentHash?: string | null
}

/** The media library holds videos as well as images; only images can be drawn with <img>. */
const isVideo = (media: GalleryMedia) => mediaKind(media.mimeType) === 'video'

type GalleryResponse = {
  media?: GalleryMedia[]
  hasNextPage?: boolean
}

const mediaLabel = (media: GalleryMedia) => media.alt || media.filename || media.sourcePages?.[0] || `Image ${media.id}`

/**
 * "Use in Ada" hands the asset to the workspace chat, which reads these query
 * parameters. The asset URL stays tenant-relative because the chat sends it
 * back to the tenant API; only the link target is control-plane local.
 */
const conversationHref = (media: GalleryMedia, workspacePath: string) => {
  const params = new URLSearchParams({
    asset_id: String(media.id),
    asset_name: media.filename || media.alt || 'Selected media',
  })
  const source = mediaUrl(media)
  if (source) params.set('asset_url', source)
  if (media.mimeType) params.set('asset_type', media.mimeType)
  return `${workspacePath}?${params.toString()}`
}

export function HelloAdaGallery() {
  const { t } = useHelloAdaTranslations()
  const site = useHelloAdaSite()
  const pathname = usePathname()
  const origin = mediaOrigin(site.routes.liveSite)
  const [media, setMedia] = useState<GalleryMedia[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const [loading, setLoading] = useState(true)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const analysisPollsRef = useRef(0)
  // Notes are edited per picture and saved explicitly, so a note is never
  // written while the owner is still typing it.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [noteState, setNoteState] = useState<Record<string, '' | 'saving' | 'saved' | 'error'>>({})
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})

  const load = useCallback(async (nextPage: number, append: boolean, query: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '72', page: String(nextPage) })
      if (query.trim()) params.set('search', query.trim())
      const response = await fetchHelloAda(`/api/helloada/media-library?${params.toString()}`, { cache: 'no-store' })
      const body = (await response.json()) as GalleryResponse & { message?: string }
      if (!response.ok) throw new Error(responseMessage(body, t('error.pageLoad')))
      setMedia((current) => append ? [...current, ...(body.media || []).filter((item) => !current.some((known) => String(known.id) === String(item.id)))] : body.media || [])
      setPage(nextPage)
      setHasNextPage(body.hasNextPage === true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.pageLoad'))
      if (!append) setMedia([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, false, search), search ? 240 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const saveNote = async (item: GalleryMedia, explicitNote?: string) => {
    const key = String(item.id)
    const draft = explicitNote ?? noteDrafts[key] ?? item.ownerNote ?? ''
    const request = ownerNoteRequest({
      mediaId: item.id,
      saved: item.ownerNote || '',
      draft,
      expectedHash: item.documentHash || '',
    })
    if (!request) {
      // Nothing to send, or no usable revision: the owner is told why rather
      // than a save silently doing nothing.
      if (ownerNoteChanged({ mediaId: item.id, saved: item.ownerNote || '', draft, expectedHash: item.documentHash || '' })) {
        setNoteErrors((current) => ({ ...current, [key]: t('owner.galleryNoteConflict') }))
      }
      return
    }
    setNoteState((current) => ({ ...current, [key]: 'saving' }))
    setNoteErrors((current) => ({ ...current, [key]: '' }))
    try {
      const response = await fetchHelloAda('/api/helloada/media/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.mediaId, note: request.note, expectedHash: request.expectedHash }),
      })
      const body = (await response.json()) as { ownerNote?: string; expectedHash?: string; message?: string }
      if (!response.ok) throw new Error(body.message || t('owner.galleryNoteFailed'))
      setMedia((current) => current.map((known) => String(known.id) === key
        ? { ...known, ownerNote: body.ownerNote ?? request.note, documentHash: body.expectedHash || known.documentHash }
        : known))
      setNoteDrafts((current) => ({ ...current, [key]: body.ownerNote ?? request.note }))
      setNoteState((current) => ({ ...current, [key]: 'saved' }))
    } catch (cause) {
      setNoteState((current) => ({ ...current, [key]: 'error' }))
      setNoteErrors((current) => ({
        ...current,
        [key]: cause instanceof Error ? cause.message : t('owner.galleryNoteFailed'),
      }))
    }
  }

  /**
   * One request per file keeps every upload on the same canonical
   * `/media/upload` contract and lets a single rejected file fail alone.
   */
  const upload = async (files: File[]) => {
    if (uploading) return
    const accepted = files.filter((file) => mediaUploadKind(file) !== undefined)
    const rejected = files.filter((file) => !accepted.includes(file))
    if (!accepted.length) {
      setError(t('owner.galleryUnsupported'))
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setUploading(true)
    setError('')
    setUploadedCount(0)
    setUploadTotal(accepted.length)
    setUploadProgress(0)
    const failures = rejected.map((file) => `${file.name}: ${t('owner.galleryUnsupported')}`)
    let uploaded = 0
    try {
      for (const [index, file] of accepted.entries()) {
        try {
          setUploadProgress(0)
          const body = await uploadMediaFile<{ attachment?: { asset_id?: string | number; url?: string; preview_url?: string; name?: string; alt_text?: string }; message?: string }>(file, {
            resolvePath: helloAdaPath,
            onProgress: setUploadProgress,
            messages: {
              unsupported: t('owner.galleryUnsupported'),
              tooLarge: t('owner.uploadTooLarge'),
              timedOut: t('owner.uploadTimeout'),
              failed: t('owner.uploadFailed'),
            },
          })
          if (body.attachment?.asset_id === undefined) throw new Error(t('owner.uploadFailed'))
          uploaded += 1
        } catch (cause) {
          failures.push(`${file.name}: ${cause instanceof Error ? cause.message : t('owner.uploadFailed')}`)
        }
        setUploadedCount(index + 1)
      }
      if (uploaded) {
        analysisPollsRef.current = 0
        await load(1, false, search)
      }
    } finally {
      setUploading(false)
      setUploadTotal(0)
      setUploadedCount(0)
      setUploadProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
    if (failures.length) setError(failures.join('\n'))
  }

  // Ada analyzes uploads in the background; refresh a bounded number of times
  // so the owner sees the resulting alt text and tags without reloading.
  const analyzing = media.some((item) => item.analysisStatus === 'pending' || item.analysisStatus === 'processing')
  const counts = mediaCounts(media)
  const visible = filterMedia(media, filter)
  useEffect(() => {
    if (!analyzing || analysisPollsRef.current >= 30) return
    const timer = window.setTimeout(() => {
      analysisPollsRef.current += 1
      void load(1, false, search)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [analyzing, load, media, search])

  return (
    <main className="helloada-gallery">
      <header className="helloada-gallery-header">
        <div className="helloada-gallery-heading">
          <h1>{t('owner.galleryTitle')}</h1>
          <p>{t('owner.galleryIntro')}</p>
          <p className="helloada-gallery-limit">{t('owner.galleryLimit')}</p>
        </div>
        <div className="helloada-gallery-actions">
          <Link className="helloada-gallery-secondary" href="/admin/collections/media">{t('owner.galleryOpenPayload')}<WorkspaceIcon name="external" size={15} /></Link>
          <button className="helloada-gallery-upload" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <WorkspaceIcon name="plus" size={15} />
            {uploading
              ? `${t('workspace.attachingImage')} ${Math.min(uploadedCount + 1, uploadTotal)}/${uploadTotal}${uploadProgress > 0 ? ` · ${uploadProgress}%` : ''}`
              : t('owner.galleryUpload')}
          </button>
          <input
            ref={inputRef}
            className="helloada-file-input"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || [])
              if (files.length) void upload(files)
            }}
          />
        </div>
      </header>

      <section className="helloada-gallery-shell" aria-label={t('owner.galleryTitle')}>
        <div className="helloada-gallery-toolbar">
          <label>
            <span>{t('workspace.pageGallerySearchLabel')}</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('workspace.pageGallerySearchPlaceholder')} />
          </label>
          <div className="helloada-gallery-filter" role="group" aria-label={t('owner.galleryFilter')}>
            {([
              ['all', t('owner.galleryAll'), media.length],
              ['image', t('owner.galleryImages'), counts.image],
              ['video', t('owner.galleryVideos'), counts.video],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={`helloada-gallery-filter-chip${filter === value ? ' is-active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <span className="helloada-gallery-count">{visible.length} {t('owner.galleryCount')}</span>
        </div>
        {error ? <p className="helloada-gallery-message is-error" role="alert">{error}</p> : null}
        {loading && !media.length ? <p className="helloada-gallery-message">{t('workspace.pageGalleryLoading')}</p> : null}
        {!loading && !media.length && !error ? <p className="helloada-gallery-message">{t('workspace.pageGalleryNoMatch')}</p> : null}
        {!loading && media.length && !visible.length ? <p className="helloada-gallery-message">{t('owner.galleryNoKind')}</p> : null}
        {visible.length ? (
          <div className="helloada-gallery-grid">
            {visible.map((item) => {
              const source = resolveMediaUrl(item, origin)
              return (
                <article className="helloada-gallery-card" key={String(item.id)}>
                  <div className="helloada-gallery-card-image">
                    {!source ? <span>{t('workspace.pageGalleryUnavailable')}</span>
                      : isVideo(item) ? <video src={source} controls playsInline muted preload="metadata" aria-label={mediaLabel(item)} />
                        : <Image src={source} alt={mediaLabel(item)} width={360} height={250} unoptimized />}
                    {isVideo(item) ? (
                      <span className="helloada-gallery-kind">
                        <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                        {t('owner.galleryVideo')}
                      </span>
                    ) : null}
                  </div>
                  <div className="helloada-gallery-card-meta">
                    <div><strong>{mediaLabel(item)}</strong><small>{item.filename || `#${item.id}`}</small></div>
                    {item.tags?.length ? (
                      <ul className="helloada-gallery-tags" aria-label={t('owner.galleryTags')}>
                        {item.tags.slice(0, 4).map((tag) => <li key={tag}>{tag}</li>)}
                      </ul>
                    ) : null}
                    {item.analysisStatus && item.analysisStatus !== 'ready' ? (
                      <small className="helloada-gallery-analysis">{t(item.analysisStatus === 'failed' ? 'workspace.analysisUnavailable' : 'owner.galleryAnalysing')}</small>
                    ) : null}
                    {(() => {
                      const key = String(item.id)
                      const draft = noteDrafts[key] ?? item.ownerNote ?? ''
                      const state = noteState[key]
                      const changed = ownerNoteChanged({
                        mediaId: item.id,
                        saved: item.ownerNote || '',
                        draft,
                        expectedHash: item.documentHash || '',
                      })
                      return (
                        <div className="helloada-gallery-note">
                          <label htmlFor={`gallery-note-${key}`}>{t('owner.galleryNoteLabel')}</label>
                          <textarea
                            id={`gallery-note-${key}`}
                            value={draft}
                            rows={3}
                            maxLength={2_000}
                            placeholder={t('owner.galleryNotePlaceholder')}
                            onChange={(event) => {
                              const value = event.target.value
                              setNoteDrafts((current) => ({ ...current, [key]: value }))
                              setNoteState((current) => ({ ...current, [key]: '' }))
                            }}
                          />
                          <div className="helloada-gallery-note-actions">
                            <button
                              type="button"
                              disabled={!changed || state === 'saving'}
                              onClick={() => void saveNote(item)}
                            >
                              {state === 'saving' ? t('owner.galleryNoteSaving') : t('owner.galleryNoteSave')}
                            </button>
                            {item.ownerNote ? (
                              <button
                                type="button"
                                className="is-quiet"
                                disabled={state === 'saving'}
                                onClick={() => {
                                  setNoteDrafts((current) => ({ ...current, [key]: '' }))
                                  void saveNote(item, '')
                                }}
                              >
                                {t('owner.galleryNoteClear')}
                              </button>
                            ) : null}
                            {state === 'saved' && !changed ? <small className="is-ok">{t('owner.galleryNoteSaved')}</small> : null}
                            {noteErrors[key] ? <small className="is-error" role="alert">{noteErrors[key]}</small> : null}
                          </div>
                        </div>
                      )
                    })()}
                    <Link className="helloada-gallery-use" href={conversationHref(item, pathname)}>{t('owner.galleryUseInChat')}<WorkspaceIcon name="arrow" size={15} /></Link>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
        {hasNextPage ? <button className="helloada-gallery-more" type="button" onClick={() => void load(page + 1, true, search)} disabled={loading}>{loading ? t('workspace.pageGalleryLoading') : t('workspace.pageGalleryMore')}</button> : null}
      </section>
    </main>
  )
}
