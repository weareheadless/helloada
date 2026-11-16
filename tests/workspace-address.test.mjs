import assert from 'node:assert/strict'
import test from 'node:test'

import { isStaleBuildFailure, shouldReloadForStaleBuild, STALE_BUILD_GUARD_MS } from '../src/lib/stale-build.ts'
import { ownedWebsite } from '../src/lib/website.ts'

const owner = { id: 7, collection: 'users', email: 'owner@example.com', createdAt: '2026-01-01T00:00:00.000Z' }

function authOf(rows) {
  const matches = (row, where) => {
    const clauses = where.and || [where]
    return clauses.every((clause) => {
      const [field] = Object.keys(clause)
      const test = clause[field] || {}
      return test.equals === undefined || String(row[field]) === String(test.equals)
    })
  }
  return {
    user: owner,
    req: {},
    payload: {
      async find({ where }) {
        return { docs: rows.filter((row) => matches(row, where)) }
      },
    },
  }
}

test('a website still answers to the runtime identity that old links use', async () => {
  const rows = [
    { id: 12, name: 'inmersion freediving', slug: 'inmersion-freediving', tenantId: 'inmersion-freediving-bb2a4e404a7fcea4', owner: 7 },
    { id: 17, name: 'Superincompetence', slug: 'superincompetence', tenantId: 'site-be8225c72f3ba01a', owner: 7 },
  ]
  const auth = authOf(rows)

  assert.equal(String((await ownedWebsite(auth, 'inmersion-freediving')).id), '12')
  // Every link written before readable slugs names the tenant id.
  assert.equal(String((await ownedWebsite(auth, 'inmersion-freediving-bb2a4e404a7fcea4')).id), '12')
  assert.equal(String((await ownedWebsite(auth, 'site-be8225c72f3ba01a')).id), '17')
  // The numeric id an older link used still resolves too.
  assert.equal(String((await ownedWebsite(auth, '12')).id), '12')
  assert.equal(await ownedWebsite(auth, 'not-a-site'), null)
})

test('a stale build failure is recognised, a dropped API call is not', () => {
  for (const message of [
    'ChunkLoadError: Loading chunk 4567 failed.',
    'Failed to fetch dynamically imported module: https://helloada.app/_next/static/chunks/app-abc.js',
    'Error: Importing a module script failed.',
  ]) {
    assert.equal(isStaleBuildFailure(message), true, message)
  }
  // These are API/network failures the app retries itself; reloading would not help.
  assert.equal(isStaleBuildFailure('Failed to fetch'), false)
  assert.equal(isStaleBuildFailure('The website preview could not be prepared.'), false)
})

test('one reload per stale build, never a reload loop', () => {
  const now = 1_000_000
  const message = 'ChunkLoadError: Loading chunk 1 failed.'
  assert.equal(shouldReloadForStaleBuild(message, null, now), true)
  assert.equal(shouldReloadForStaleBuild(message, now - 1_000, now), false)
  assert.equal(shouldReloadForStaleBuild(message, now - STALE_BUILD_GUARD_MS - 1, now), true)
  assert.equal(shouldReloadForStaleBuild('Failed to fetch', null, now), false)
})
