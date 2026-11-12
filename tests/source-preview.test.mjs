import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { sourcePreviewMount, sourcePreviewUrl } from '../src/workspace/lib/source-preview.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the candidate mount comes from the tenant, so every starter builds one artifact', () => {
  const mount = sourcePreviewMount('inmersion-freediving-bb2a4e404a7fcea4')
  assert.equal(mount, '/api/helloada/tenants/inmersion-freediving-bb2a4e404a7fcea4/source/preview')
  assert.equal(
    sourcePreviewUrl(mount, '345e1df4-4995-4289-b140-cdaf930dac3b'),
    '/api/helloada/tenants/inmersion-freediving-bb2a4e404a7fcea4/source/preview/345e1df4-4995-4289-b140-cdaf930dac3b/runtime',
  )
  // The same identity rule the preview service applies to the build.
  assert.equal(sourcePreviewMount(''), '')
  assert.equal(sourcePreviewMount('../tenant'), '')
  assert.equal(sourcePreviewMount('tenant/other'), '')
})

test('a job identity that is not a safe path never becomes a URL', () => {
  const mount = '/api/helloada/tenants/tenant/source/preview'
  assert.equal(sourcePreviewUrl(mount, ''), undefined)
  assert.equal(sourcePreviewUrl(mount, '../elsewhere'), undefined)
  assert.equal(sourcePreviewUrl('', 'job'), undefined)
})

test('the workspace frames the candidate and opens that same URL full screen', () => {
  const source = read('src/workspace/components/WebsiteWorkspace.tsx')
  // No tenant handoff, no published alias standing in for the candidate.
  assert.doesNotMatch(source, /exactSourcePreviewHref|externalDraftReview|Open exact preview/)
  assert.doesNotMatch(source, /runtime_mount:/)
  assert.match(source, /src=\{previewUrl\}/)
  assert.match(source, /href=\{previewUrl\}/)
})

test('the tenant preview route proxies through the owner session', () => {
  const route = read('src/app/api/helloada/tenants/[tenantId]/source/preview/[job]/runtime/[[...path]]/route.ts')
  assert.match(route, /ownedWebsiteByTenant\(auth, tenantId\)/)
  assert.match(route, /proxyTenantWorkspace\(tenantId, String\(auth\.user\.id\)/)
  const proxy = read('src/lib/tenant-proxy.ts')
  assert.match(proxy, /'rsc'/)
  assert.match(proxy, /'next-router-state-tree'/)
  assert.match(proxy, /redirect: previewRuntime \? 'manual' : 'follow'/)
  assert.match(proxy, /out\.set\('location', location\)/)
})
