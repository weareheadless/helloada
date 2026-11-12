import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { documentRequest, workspacePathNotFound } from '../src/lib/unavailable.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const pageRequest = () => new Request('https://helloada.app/api/helloada/source/preview/job/runtime/courses', {
  headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
})
const dataRequest = () => new Request('https://helloada.app/api/helloada/source/preview/job/runtime', {
  headers: { accept: 'application/json' },
})

test('only a browser asking for a document is treated as a page request', () => {
  assert.equal(documentRequest(pageRequest()), true)
  assert.equal(documentRequest(dataRequest()), false)
  assert.equal(documentRequest(new Request('https://helloada.app/')), false)
})

test('an unknown workspace address answers a page request with a page', async () => {
  const response = workspacePathNotFound(pageRequest())
  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type'), /text\/html/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.text()
  assert.match(body, /This page does not exist/)
  assert.match(body, /Reload the page you came from/)
  // The CMS's own REST answer is exactly what must never reach the owner.
  assert.doesNotMatch(body, /Route not found/)
  assert.doesNotMatch(body, /payload/i)
})

test('a data caller still gets JSON from the same address', async () => {
  const response = workspacePathNotFound(dataRequest())
  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('the workspace owns its namespace and the preview frame never shows a machine error', () => {
  const catchAll = read('src/app/api/helloada/[...path]/route.ts')
  assert.match(catchAll, /workspacePathNotFound\(request\)/)
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.match(catchAll, new RegExp(`export const ${method} = notFound`))
  }

})
