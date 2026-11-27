import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  normalizeOwnerNote,
  ownerNoteChanged,
  ownerNoteRequest,
  OWNER_NOTE_LIMIT,
} from '../src/workspace/lib/owner-note.ts'

/**
 * A note is the owner's own words about a picture: "Susi, March launch shoot".
 * It is saved against the exact revision the box was loaded from, so a note is
 * never written over content the owner has not seen, and an unchanged note is
 * never written at all.
 */

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const HASH = `sha256:${'a'.repeat(64)}`

test('a note is saved only when it actually differs', () => {
  const base = { mediaId: 7, saved: 'Susi, March launch', expectedHash: HASH }

  assert.equal(ownerNoteChanged({ ...base, draft: 'Susi, March launch' }), false)
  assert.equal(ownerNoteChanged({ ...base, draft: 'Susi, March launch ' }), false, 'trailing space is not a change')
  assert.equal(ownerNoteChanged({ ...base, draft: 'Susi, April launch' }), true)
  assert.equal(ownerNoteRequest({ ...base, draft: 'Susi, March launch' }), null)
})

test('clearing the box is a real change, not a no-op', () => {
  const draft = { mediaId: 7, saved: 'Susi, March launch', draft: '', expectedHash: HASH }

  assert.equal(ownerNoteChanged(draft), true)
  assert.deepEqual(ownerNoteRequest(draft), { mediaId: 7, note: '', expectedHash: HASH })
})

test('a save carries the revision the note was read at', () => {
  const request = ownerNoteRequest({ mediaId: '21', saved: '', draft: 'The dive school owner', expectedHash: HASH })

  assert.equal(request.expectedHash, HASH)
  assert.equal(request.mediaId, '21')
  assert.equal(request.note, 'The dive school owner')
})

test('a save without a real revision sends nothing, so it cannot overwrite blind', () => {
  for (const expectedHash of ['', 'not-a-hash', 'sha256:short']) {
    assert.equal(
      ownerNoteRequest({ mediaId: 7, saved: '', draft: 'a note', expectedHash }),
      null,
      `a save with "${expectedHash}" must not be sent`,
    )
  }
})

test('a long note is cut rather than rejected', () => {
  const long = 'x'.repeat(OWNER_NOTE_LIMIT + 500)
  assert.equal(normalizeOwnerNote(long).length, OWNER_NOTE_LIMIT)
  // CrLf from a textarea is one line break, not two.
  assert.equal(normalizeOwnerNote('one\r\ntwo'), 'one\ntwo')
})

test('the gallery offers a note per picture and names the save honestly', () => {
  const gallery = read('src/workspace/components/HelloAdaGallery.tsx')
  assert.match(gallery, /owner\.galleryNoteLabel/)
  assert.match(gallery, /owner\.galleryNoteSave/)
  assert.match(gallery, /\/api\/helloada\/media\/note/)
  // The note is saved explicitly, never on every keystroke.
  assert.match(gallery, /type="button"\s*\n\s*disabled=\{!changed \|\| state === 'saving'\}/)
})

test('the store owns the note field, not the gallery', () => {
  const gallery = read('src/workspace/components/HelloAdaGallery.tsx')
  // The component must not invent a second place to keep notes.
  assert.doesNotMatch(gallery, /localStorage[\s\S]{0,80}note/i)
})
