import assert from 'node:assert/strict'
import test from 'node:test'

import { filterMedia, mediaCounts, mediaKind } from '../src/workspace/lib/gallery-filter.ts'

const LIBRARY = [
  { id: 1, mimeType: 'image/jpeg' },
  { id: 2, mimeType: 'video/mp4' },
  { id: 3, mimeType: null },
  { id: 4, mimeType: 'VIDEO/quicktime' },
  { id: 5 },
]

test('a clip is recognised by its content type, whatever the case', () => {
  assert.equal(mediaKind('video/mp4'), 'video')
  assert.equal(mediaKind('VIDEO/quicktime'), 'video')
  assert.equal(mediaKind('image/jpeg'), 'image')
  // Records without a type are stills: the library always stored an image
  // before it stored clips, and a missing type must never hide an image.
  assert.equal(mediaKind(null), 'image')
  assert.equal(mediaKind(undefined), 'image')
})

test('filtering by kind keeps every other item', () => {
  assert.deepEqual(filterMedia(LIBRARY, 'all').map((item) => item.id), [1, 2, 3, 4, 5])
  assert.deepEqual(filterMedia(LIBRARY, 'video').map((item) => item.id), [2, 4])
  assert.deepEqual(filterMedia(LIBRARY, 'image').map((item) => item.id), [1, 3, 5])
})

test('counts agree with the filtered lists', () => {
  const counts = mediaCounts(LIBRARY)
  assert.deepEqual(counts, { image: 3, video: 2 })
  assert.equal(filterMedia(LIBRARY, 'video').length, counts.video)
  assert.equal(filterMedia(LIBRARY, 'image').length, counts.image)
})
