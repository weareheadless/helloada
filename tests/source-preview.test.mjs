import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { previewUrlForRoute } from '../src/workspace/lib/source-preview.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const PREVIEW = 'https://preview.helloada.app/p/inmersion-freediving-bb2a4e404a7fcea4/6782629d-412a-425b-99f1-1c19c8a5efbf/1799999999/0123456789abcdef'

test('a route is appended to the address the build reported', () => {
  assert.equal(previewUrlForRoute(PREVIEW, '/'), PREVIEW)
  assert.equal(previewUrlForRoute(PREVIEW, '/courses'), `${PREVIEW}/courses`)
  assert.equal(previewUrlForRoute(`${PREVIEW}/`, '/courses/'), `${PREVIEW}/courses`)
  assert.equal(previewUrlForRoute(PREVIEW, ''), PREVIEW)
})

test('anything that is not the preview origin is refused', () => {
  // The workspace frames what the build reports; it never composes one.
  assert.equal(previewUrlForRoute('', '/courses'), undefined)
  assert.equal(previewUrlForRoute('/p/tenant/job/1/sig', '/courses'), undefined)
  assert.equal(previewUrlForRoute('http://preview.helloada.app/p/t/j/1/s', '/courses'), undefined)
  assert.equal(previewUrlForRoute('https://preview.helloada.app/p/t/j/1/s" onload="x', '/'), undefined)
})

test('the frame and the full-screen tab open one address, and the app composes none', () => {
  const source = read('src/workspace/components/WebsiteWorkspace.tsx')
  assert.match(source, /src=\{previewUrl\}/)
  assert.match(source, /href=\{previewUrl\}/)
  // No mount derivation and no tenant-scoped route: the build owns the address.
  assert.doesNotMatch(source, /sourcePreviewMount|sourcePreviewUrl|runtime_mount/)
  // The published alias is only the preview when there is nothing to review.
  assert.match(source, /previewUrlForRoute\(sourceReview\.url, selectedRoute\)/)
})

test('the workspace no longer proxies a compiled preview', () => {
  const proxy = read('src/lib/tenant-proxy.ts')
  assert.doesNotMatch(proxy, /next-router-state-tree|previewRuntimePath|redirect: previewRuntime/)
  assert.match(proxy, /siteAgentRequest\(tenantId, `\/worker\/\$\{suffix\}\$\{query\}`/)
})
