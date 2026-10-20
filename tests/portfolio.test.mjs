import test from 'node:test'
import assert from 'node:assert/strict'
import { removedWebsiteIds, setWebsiteRemoved } from '../src/lib/portfolio.ts'

function fixture(results = []) {
  const calls = []
  const payload = Object.fromEntries(['find', 'create', 'delete'].map((method) => [method, async (args) => {
    calls.push({ method, ...args })
    return method === 'find' ? { docs: results.shift() || [] } : {}
  }]))
  return { auth: { payload, user: { id: 7, collection: 'users' }, req: { user: { id: 7, collection: 'users' } } }, calls }
}

test('only owned websites can be removed or restored', async () => {
  for (const removed of [true, false]) {
    const { auth, calls } = fixture([[]])
    assert.equal(await setWebsiteRemoved(auth, 23, removed), false)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].where.and, [{ id: { equals: 23 } }, { owner: { equals: 7 } }])
    assert.equal(calls[0].overrideAccess, false)
  }
})

test('removing a failed workspace changes only its owner preference, without contacting provisioning', async () => {
  const { auth, calls } = fixture([[{ id: 23, phase: 'needs_attention' }], []])
  assert.equal(await setWebsiteRemoved(auth, 23, true), true)
  const write = calls.at(-1)
  assert.equal(write.method, 'create')
  assert.equal(write.collection, 'payload-preferences')
  assert.deepEqual(write.data, { key: 'helloada.portfolio.removed.23', value: true, user: { relationTo: 'users', value: 7 } })
  assert.ok(calls.every((call) => call.overrideAccess === false && call.req === auth.req))
})

test('repeated removal is idempotent', async () => {
  const { auth, calls } = fixture([[{ id: 23 }], [{ id: 90 }]])
  assert.equal(await setWebsiteRemoved(auth, 23, true), true)
  assert.equal(calls.some((call) => call.method === 'create'), false)
})

test('restore deletes only the matching preference for the authenticated owner', async () => {
  const { auth, calls } = fixture([[{ id: 23 }]])
  assert.equal(await setWebsiteRemoved(auth, 23, false), true)
  const write = calls.at(-1)
  assert.equal(write.collection, 'payload-preferences')
  assert.equal(write.method, 'delete')
  assert.deepEqual(write.where.and, [
    { 'user.value': { equals: 7 } },
    { 'user.relationTo': { equals: 'users' } },
    { key: { equals: 'helloada.portfolio.removed.23' } },
  ])
})

test('visibility lists are owner scoped and ignore unrelated or malformed preference keys', async () => {
  const { auth, calls } = fixture([[
    { key: 'helloada.portfolio.removed.23' }, { key: 'other.helloada.portfolio.removed.42' },
    { key: 'helloada.portfolio.removed.invalid' }, { key: null },
  ]])
  assert.deepEqual([...await removedWebsiteIds(auth)], ['23'])
  assert.equal(calls[0].pagination, false)
  assert.equal(calls[0].overrideAccess, false)
  assert.deepEqual(calls[0].where.and.slice(0, 2), [
    { 'user.value': { equals: 7 } }, { 'user.relationTo': { equals: 'users' } },
  ])
})
