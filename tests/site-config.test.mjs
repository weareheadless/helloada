import assert from 'node:assert/strict'
import test from 'node:test'

import { defineHelloAdaSite, getHelloAdaSite, helloAdaPath } from '../src/workspace/config/site.ts'

test('the control plane keeps the tenant origins and scopes workspace calls', () => {
  defineHelloAdaSite({
    tenantId: 'inmersion-freediving',
    siteName: 'Inmersion Freediving',
    defaultLocale: 'en',
    locales: ['en'],
    routes: {
      workspaceApi: '/api/helloada/websites/7/owner',
      liveSite: 'https://tenant.example',
      preview: 'https://tenant.example/inmersion-freediving-preview',
    },
  })
  const site = getHelloAdaSite()
  assert.equal(site.routes.liveSite, 'https://tenant.example')
  assert.equal(site.routes.preview, 'https://tenant.example/inmersion-freediving-preview')
  assert.equal(helloAdaPath('/api/helloada/workspace'), '/api/helloada/websites/7/owner/workspace')
  assert.equal(
    helloAdaPath('/api/helloada/drafts?status=pending'),
    '/api/helloada/websites/7/owner/drafts?status=pending',
  )
})

test('a relative route stays on the deployment origin', () => {
  defineHelloAdaSite({
    tenantId: 'local',
    siteName: 'Local',
    routes: { workspaceApi: '/api/helloada', liveSite: '/', preview: '/local-preview' },
  })
  assert.equal(getHelloAdaSite().routes.preview, '/local-preview')
})
