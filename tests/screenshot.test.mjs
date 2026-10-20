import test from 'node:test'
import assert from 'node:assert/strict'
import { cachedScreenshot, verifiedScreenshotOrigin, screenshotRequestAllowed } from '../src/lib/screenshot-policy.ts'

const origin = 'https://helloada-example.weareheadless.workers.dev'
const health = { ok: true, service: 'helloada-site', tenant: 'example' }

test('capture verifies the live Worker identity rather than stale bootstrap publication flags', () => {
  assert.equal(verifiedScreenshotOrigin(origin, health, 'example'), origin)
  for (const value of [null, { ...health, tenant: 'other' }, { ...health, ok: false }, { ...health, service: 'other' }]) {
    assert.equal(verifiedScreenshotOrigin(origin, value, 'example'), null)
  }
  for (const url of ['http://127.0.0.1', 'https://127.0.0.1', 'https://localhost', 'https://evil.example', 'https://user:password@helloada-example.weareheadless.workers.dev']) {
    assert.equal(verifiedScreenshotOrigin(url, health, 'example'), null)
  }
})

test('capture blocks navigation off the verified origin and private network resource URLs', () => {
  assert.equal(screenshotRequestAllowed(origin + '/', origin, true), true)
  assert.equal(screenshotRequestAllowed('https://fonts.googleapis.com/css', origin, false), true)
  for (const url of ['http://169.254.169.254/', 'https://127.0.0.1/', 'https://[::1]/', 'https://metadata.internal/', 'file:///etc/passwd']) {
    assert.equal(screenshotRequestAllowed(url, origin, false), false)
  }
  assert.equal(screenshotRequestAllowed('https://other.example', origin, true), false)
})

test('a fresh cached screenshot avoids browser capture', async () => {
  const image = new Uint8Array([1, 2, 3]).buffer
  const bucket = { get: async () => ({ uploaded: new Date(), arrayBuffer: async () => image }), put: async () => assert.fail('must not write') }
  assert.equal(await cachedScreenshot(bucket, 'cached', async () => assert.fail('must not capture')), image)
})

test('expired captures are replaced and failed captures can be retried', async () => {
  const writes = []
  const bucket = { get: async () => ({ uploaded: new Date(0), arrayBuffer: async () => assert.fail('must refresh') }), put: async (...args) => writes.push(args) }
  await assert.rejects(cachedScreenshot(bucket, 'expired', async () => { throw new Error('browser unavailable') }))
  assert.equal(writes.length, 0)
  const result = await cachedScreenshot(bucket, 'expired', async () => new Uint8Array([4, 5]))
  assert.deepEqual([...new Uint8Array(result)], [4, 5])
  assert.equal(writes.length, 1)
  assert.equal(writes[0][0], 'expired')
  assert.equal(writes[0][2].httpMetadata.contentType, 'image/jpeg')
})
