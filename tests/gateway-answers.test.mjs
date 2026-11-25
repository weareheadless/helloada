import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { asJsonAnswer } from '../src/workspace/api/json-answer.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a JSON answer is handed through untouched', async () => {
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  assert.equal(await asJsonAnswer(original), original)
})

test('an edge text answer becomes the empty object the callers expect', async () => {
  const gateway = new Response('error code: 502', {
    status: 502,
    headers: { 'Content-Type': 'text/plain' },
  })
  const answer = await asJsonAnswer(gateway)
  // The status is the fact worth keeping; the parser text is not.
  assert.equal(answer.status, 502)
  assert.match(answer.headers.get('content-type') || '', /application\/json/)
  assert.deepEqual(await answer.json(), {})
})

test('a bodiless success is not wrapped', async () => {
  const empty = new Response(null, { status: 204 })
  assert.equal(await asJsonAnswer(empty), empty)
})

test('the shared fetch layer is where a caller gets JSON', () => {
  const fetchLayer = read('src/workspace/api/fetchHelloAda.ts')
  assert.match(fetchLayer, /return await asJsonAnswer\(response\)/)
  // No caller is expected to guard against a text body: the layer normalises it.
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  const jsonReads = (workspace.match(/await response\.json\(\)/g) || []).length
  assert.ok(jsonReads > 0)
  assert.doesNotMatch(workspace, /Unexpected token/)
})

test('a recovered workspace clears the failure it showed, and offers a reconnect', () => {
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  // The banner left behind after a restart must not outlive the recovery.
  assert.match(workspace, /setWorkspaceError\(''\)/)
  // And a first load that failed must not be a dead end.
  assert.match(workspace, /workspaceError \? <div className="helloada-alert"/)
  assert.match(workspace, /t\('owner\.retry'\)/)
})
