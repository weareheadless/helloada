import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

/**
 * Growth must not depend on the tenant Worker's compiled bridge.
 *
 * A site built before the one-click routes shipped keeps the old allowlist, so
 * the owner's click dies with "HelloAda service is unavailable" on every site
 * the platform has not rebuilt yet. The canonical API already owns those
 * routes, and the control plane has already authenticated the owner.
 */
test('the owner workspace sends Growth straight to the canonical API', () => {
  const proxy = read('src/lib/tenant-proxy.ts')

  assert.match(proxy, /const CANONICAL_API_PREFIXES = \['growth\/'\]/)
  assert.match(proxy, /const isCanonicalApiPath = /)
  assert.match(proxy, /\/workspace\/\$\{suffix\}/)
  assert.match(proxy, /'x-helloada-owner-id': `helloada:\$\{ownerSubject\}`/)
})

test('the workspace keeps Growth paths the tenant runtime serves itself', () => {
  const proxy = read('src/lib/tenant-proxy.ts')

  // These two are computed inside the tenant Worker from its own contract and
  // candidate; the canonical API does not own them.
  assert.match(proxy, /TENANT_LOCAL_PATHS = new Set\(\['growth\/contract', 'growth\/candidate'\]\)/)
})

test('every other workspace surface still travels through the tenant Worker', () => {
  const proxy = read('src/lib/tenant-proxy.ts')

  assert.match(proxy, /siteAgentRequest\(tenantId, `\/worker\/\$\{suffix\}\$\{query\}`/)
})
