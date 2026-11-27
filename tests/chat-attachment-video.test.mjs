import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { canSendChatAttachments, splitChatImageFiles } from '../src/workspace/lib/chat-attachment-files.ts'

/**
 * The gallery lets an owner pick a clip and hand it to Ada, and the chat
 * composer accepts a clip too. The composer's file split only knew images, so a
 * clip was classified as unsupported and never reached the upload at all — the
 * owner saw a rejection before any request was made.
 */

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const files = [
  { name: 'studio.mp4', type: 'video/mp4' },
  { name: 'photo.jpg', type: 'image/jpeg' },
  { name: 'menu.pdf', type: 'application/pdf' },
  { name: 'clip.mov', type: 'video/quicktime' },
]

test('a clip chosen in the composer reaches the upload instead of being refused', () => {
  const { supported, unsupported } = splitChatImageFiles(files)

  assert.deepEqual(supported.map((file) => file.name), ['studio.mp4', 'photo.jpg', 'clip.mov'])
  assert.deepEqual(unsupported.map((file) => file.name), ['menu.pdf'])
})

test('a file the chat cannot take is still refused', () => {
  const { supported, unsupported } = splitChatImageFiles([{ name: 'notes.txt', type: 'text/plain' }])

  assert.deepEqual(supported, [])
  assert.equal(unsupported.length, 1)
})

test('a clip is enough on its own to send a turn', () => {
  // The turn needs text or an attachment; a lone clip must satisfy it.
  assert.equal(canSendChatAttachments(true, 1, []), true)
  assert.equal(canSendChatAttachments(false, 0, []), false)
})

test('the chat composer accepts clips as well as stills', () => {
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  // The composer input is the one that feeds uploadImages; the two page-image
  // fields stay image-only on purpose.
  const chatInput = workspace.slice(workspace.indexOf('ref={fileInputRef}'), workspace.indexOf('ref={fileInputRef}') + 400)
  assert.match(chatInput, /accept="image\/\*,video\/\*"/)
})
