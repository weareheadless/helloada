import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { mediaOrigin, resolveMediaUrl } from '../src/workspace/lib/media.ts'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('tenant media paths resolve against the tenant origin', () => {
  assert.equal(
    resolveMediaUrl('/api/media/file/diver.jpeg', 'https://tenant.example'),
    'https://tenant.example/api/media/file/diver.jpeg',
  )
  assert.equal(
    resolveMediaUrl({ url: '/api/media/file/diver.jpeg' }, 'https://tenant.example/'),
    'https://tenant.example/api/media/file/diver.jpeg',
  )
  assert.equal(
    resolveMediaUrl('api/media/file/diver.jpeg', 'https://tenant.example'),
    'https://tenant.example/api/media/file/diver.jpeg',
  )
})

test('already usable media URLs are left untouched', () => {
  for (const value of [
    'https://cdn.example/diver.jpeg',
    '//cdn.example/diver.jpeg',
    'data:image/png;base64,AAAA',
    'blob:https://helloada.app/1234',
  ]) {
    assert.equal(resolveMediaUrl(value, 'https://tenant.example'), value)
  }
  assert.equal(resolveMediaUrl('', 'https://tenant.example'), '')
  assert.equal(resolveMediaUrl(null, 'https://tenant.example'), '')
})

test('a missing origin leaves the tenant path relative', () => {
  assert.equal(resolveMediaUrl('/api/media/file/diver.jpeg', ''), '/api/media/file/diver.jpeg')
})

test('the media origin comes from the live site, not the control plane', () => {
  assert.equal(mediaOrigin('https://tenant.example/'), 'https://tenant.example')
  assert.equal(mediaOrigin('https://tenant.example/some/path'), 'https://tenant.example')
  // No browser in this test, so a relative live site has no origin to offer.
  assert.equal(mediaOrigin('/'), '')
})

test('the gallery renders tenant media and hands assets to the workspace chat', () => {
  const gallery = read('src/workspace/components/HelloAdaGallery.tsx')
  assert.match(gallery, /resolveMediaUrl\(item, origin\)/)
  assert.match(gallery, /mediaOrigin\(site\.routes\.liveSite\)/)
  assert.match(gallery, /conversationHref\(item, pathname\)/)
  assert.match(gallery, /return `\$\{workspacePath\}\?\$\{params\.toString\(\)\}`/)
  assert.doesNotMatch(gallery, /return `\/admin\?/)
})

test('workspace thumbnails resolve tenant media before rendering', () => {
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  assert.match(workspace, /const resolved = resolveMediaUrl\(src, mediaOrigin\(site\.routes\.liveSite\)\)/)
  assert.match(workspace, /resolveMediaUrl\(attachment\.thumbnail_url \|\| attachment\.preview_url \|\| attachment\.url \|\| '', siteOrigin\)/)
  assert.match(workspace, /resolveMediaUrl\(publicMediaUrl\(media\), siteOrigin\)/)
})
