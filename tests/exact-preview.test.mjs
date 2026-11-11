import assert from 'node:assert/strict'
import test from 'node:test'

import { exactSourcePreviewHref } from '../src/workspace/lib/exact-preview.ts'

const MANAGE = '/admin-entry/inmersion-freediving-bb2a4e404a7fcea4'
const CANDIDATE = '/api/helloada/source/preview/345e1df4-4995-4289-b140-cdaf930dac3b/runtime/'

test('the exact candidate opens through the owner handoff', () => {
  const href = exactSourcePreviewHref(MANAGE, CANDIDATE)
  assert.equal(
    href,
    `${MANAGE}?next=${encodeURIComponent(CANDIDATE)}`,
  )
  // The handoff accepts any same-origin path, so the candidate destination
  // survives the control-plane check and the tenant's own check.
  const resolved = new URL(href, 'https://helloada.app')
  assert.equal(resolved.origin, 'https://helloada.app')
  assert.equal(resolved.pathname, MANAGE)
  assert.equal(resolved.searchParams.get('next'), CANDIDATE)
})

test('a handoff entry that already carries a query stays one query', () => {
  const href = exactSourcePreviewHref(`${MANAGE}?from=portfolio`, CANDIDATE)
  assert.equal(href, `${MANAGE}?next=${encodeURIComponent(CANDIDATE)}`)
})

test('no link before the exact candidate exists', () => {
  assert.equal(exactSourcePreviewHref(MANAGE, ''), undefined)
  assert.equal(exactSourcePreviewHref(MANAGE, undefined), undefined)
  assert.equal(exactSourcePreviewHref(undefined, CANDIDATE), undefined)
})

test('only the tenant bridge mount is a candidate destination', () => {
  // The published alias and the API-side workspace path are different
  // surfaces; handing off to either would not show the compiled candidate.
  assert.equal(exactSourcePreviewHref(MANAGE, '/inmersion-freediving-preview/'), undefined)
  assert.equal(exactSourcePreviewHref(MANAGE, '/api/workspace/source/preview/j/runtime/'), undefined)
  assert.equal(exactSourcePreviewHref(MANAGE, 'https://evil.example/api/helloada/x'), undefined)
})
