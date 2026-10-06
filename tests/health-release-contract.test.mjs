import test from 'node:test'
import assert from 'node:assert/strict'

import { GET } from '../src/app/api/health/route.ts'

test('HelloAda health fails closed without an exact release identity', async () => {
  const original = process.env.HELLOADA_RELEASE_SHA
  delete process.env.HELLOADA_RELEASE_SHA
  try {
    const response = await GET()
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false, error: 'release_identity_missing' })
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
  } finally {
    if (original === undefined) delete process.env.HELLOADA_RELEASE_SHA
    else process.env.HELLOADA_RELEASE_SHA = original
  }
})

test('HelloAda health identifies the exact uploaded source SHA', async () => {
  const original = process.env.HELLOADA_RELEASE_SHA
  const expected = 'a'.repeat(40)
  process.env.HELLOADA_RELEASE_SHA = expected
  try {
    const response = await GET()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, service: 'helloada', releaseSha: expected })
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
  } finally {
    if (original === undefined) delete process.env.HELLOADA_RELEASE_SHA
    else process.env.HELLOADA_RELEASE_SHA = original
  }
})
