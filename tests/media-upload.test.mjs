import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { MEDIA_UPLOAD_LIMIT_BYTES, mediaUploadKind, mediaUploadRejection, mediaUploadSizeError } from '../src/workspace/api/upload-media.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a clip is recognised from its content type or its filename', () => {
  assert.equal(mediaUploadKind({ type: 'video/mp4', name: 'clip.mp4' }), 'video')
  assert.equal(mediaUploadKind({ type: 'VIDEO/quicktime', name: 'clip.MOV' }), 'video')
  assert.equal(mediaUploadKind({ type: 'image/jpeg', name: 'photo.jpg' }), 'image')
  // Some phone pickers hand over `application/octet-stream`; the filename is
  // the stable second signal, and the tenant bridge repeats the decision from
  // the bytes before it stores anything.
  assert.equal(mediaUploadKind({ type: 'application/octet-stream', name: 'clip.mp4' }), 'video')
  assert.equal(mediaUploadKind({ type: '', name: 'photo.HEIC' }), 'image')
  assert.equal(mediaUploadKind({ type: 'application/pdf', name: 'notes.pdf' }), undefined)
  assert.equal(mediaUploadKind({ type: '', name: 'notes' }), undefined)
})

test('the picker and the tenant bridge share one 25 MB ceiling', () => {
  assert.equal(MEDIA_UPLOAD_LIMIT_BYTES, 25 * 1024 * 1024)
  assert.equal(mediaUploadSizeError(MEDIA_UPLOAD_LIMIT_BYTES, 'too large'), undefined)
  assert.equal(mediaUploadSizeError(MEDIA_UPLOAD_LIMIT_BYTES + 1, 'too large'), 'too large')
})

test('a rejection from an ingress is reported by its status, not as a connection fault', () => {
  const messages = { unsupported: 'unsupported', tooLarge: 'tooLarge', timedOut: 'timedOut', failed: 'failed' }
  // The shared API's ingress answers an oversized body with its own HTML 413.
  assert.equal(mediaUploadRejection(413, messages), 'tooLarge')
  assert.equal(mediaUploadRejection(415, messages), 'unsupported')
  assert.equal(mediaUploadRejection(502, messages), 'failed')
  const source = read('src/workspace/api/upload-media.ts')
  // A body that is not the bridge's JSON still reaches the status decision.
  assert.match(source, /catch \{\s*\/\/ An intermediary answered with its own page[\s\S]{0,320}mediaUploadRejection\(request\.status, options\.messages\)/)
})

test('a media upload is bounded by progress, not by a fixed wall clock', () => {
  const source = read('src/workspace/api/upload-media.ts')
  // A fixed total timeout is the defect: a 20 MB clip on a slow phone uplink
  // legitimately takes minutes. The idle watchdog only fires without progress.
  assert.match(source, /const UPLOAD_IDLE_TIMEOUT_MS = 90_000/)
  assert.match(source, /request\.upload\.onprogress = \(event\) => \{\s*armIdle\(\)/)
  assert.match(source, /request\.upload\.onload = \(\) => \{\s*clearIdle\(\)\s*request\.timeout = UPLOAD_RESPONSE_TIMEOUT_MS/)
  assert.doesNotMatch(source, /25_000/)
})

test('the gallery, page editor and chat share the canonical upload helper', () => {
  const gallery = read('src/workspace/components/HelloAdaGallery.tsx')
  assert.match(gallery, /uploadMediaFile<\{ attachment\?:/)
  assert.match(gallery, /mediaUploadKind\(file\)/)
  assert.doesNotMatch(gallery, /fetchHelloAda\('\/api\/helloada\/media\/upload'/)

  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  assert.equal((workspace.match(/uploadMediaFile<\{ attachment\?: ChatAttachment/g) || []).length, 2)
  assert.doesNotMatch(workspace, /fetchHelloAda\('\/api\/helloada\/media\/upload'/)

  const chat = read('src/workspace/lib/chat-attachments.ts')
  assert.match(chat, /return uploadMediaFile<T>\(file, \{/)
  assert.doesNotMatch(chat, /CHAT_UPLOAD_TIMEOUT_MS/)
})
