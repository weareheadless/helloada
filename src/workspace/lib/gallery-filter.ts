/** The media library holds stills and short clips; this is the one place that decides which is which. */
export type GalleryKind = 'image' | 'video'
export type GalleryFilter = 'all' | GalleryKind

type Typed = { mimeType?: string | null }

export const mediaKind = (mimeType?: string | null): GalleryKind =>
  String(mimeType || '').toLowerCase().startsWith('video/') ? 'video' : 'image'

export const filterMedia = <T extends Typed>(items: T[], filter: GalleryFilter): T[] =>
  filter === 'all' ? items : items.filter((item) => mediaKind(item.mimeType) === filter)

export const mediaCounts = (items: Typed[]): Record<GalleryKind, number> =>
  items.reduce<Record<GalleryKind, number>>(
    (counts, item) => {
      counts[mediaKind(item.mimeType)] += 1
      return counts
    },
    { image: 0, video: 0 },
  )
