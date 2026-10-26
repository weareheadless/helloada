import test from 'node:test'
import assert from 'node:assert/strict'

import { helloAdaIntelligenceIdentity, isMatchingIntelligenceIdentity } from '../src/lib/intelligence-identity.ts'
import { registerWebsiteTenant } from '../src/lib/website.ts'

const requestKey = '01234567-89ab-cdef-0123-456789abcdef'

test('intelligence identity is stable for an owner request and independent of names', async () => {
  const first = await helloAdaIntelligenceIdentity('42', requestKey)
  const retry = await helloAdaIntelligenceIdentity('42', requestKey)
  const otherOwner = await helloAdaIntelligenceIdentity('43', requestKey)

  assert.deepEqual(first, retry)
  assert.notEqual(first.tenantId, otherOwner.tenantId)
  assert.equal(first.externalOrganizationId, 'helloada:42')
  assert.equal(first.ownerSubject, '42')
  assert.deepEqual(first.origin, { system: 'helloada', externalId: first.tenantId })
  assert.equal(first.externalProjectId, `helloada:${first.tenantId}`)
})

test('registration accepts only an exact, nonsecret identity echo', async () => {
  const identity = await helloAdaIntelligenceIdentity('42', requestKey)
  assert.equal(isMatchingIntelligenceIdentity({
    external_organization_id: identity.externalOrganizationId,
    owner_subject: identity.ownerSubject,
    origin: { system: 'helloada', external_id: identity.origin.externalId },
    external_project_id: identity.externalProjectId,
  }, identity), true)
  assert.equal(isMatchingIntelligenceIdentity({ external_organization_id: 'helloada:other' }, identity), false)
  assert.equal(isMatchingIntelligenceIdentity(null, identity), false)
})

test('registration sends trusted identity metadata only in the server request body', async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SITE_AGENT_URL
  const previousToken = process.env.HELLOADA_CONTROL_PLANE_TOKEN
  let captured
  process.env.SITE_AGENT_URL = 'https://agent.example'
  process.env.HELLOADA_CONTROL_PLANE_TOKEN = 'test-control-token'
  globalThis.fetch = async (url, init) => {
    captured = { url, init }
    return new Response('{}', { status: 200 })
  }
  try {
    const identity = await helloAdaIntelligenceIdentity('42', requestKey)
    await registerWebsiteTenant(identity.tenantId, 'Example', identity)
    const body = JSON.parse(captured.init.body)
    assert.equal(captured.url, `https://agent.example/v1/control-plane/websites/${identity.tenantId}/register`)
    assert.equal(body.display_name, 'Example')
    assert.equal(body.external_organization_id, 'helloada:42')
    assert.equal(body.owner_subject, '42')
    assert.deepEqual(body.origin, { system: 'helloada', external_id: identity.tenantId })
    assert.equal(body.external_project_id, `helloada:${identity.tenantId}`)
    assert.equal(JSON.stringify(body).includes('test-control-token'), false)
    assert.equal(captured.init.headers.get('authorization'), 'Bearer test-control-token')
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SITE_AGENT_URL
    else process.env.SITE_AGENT_URL = previousUrl
    if (previousToken === undefined) delete process.env.HELLOADA_CONTROL_PLANE_TOKEN
    else process.env.HELLOADA_CONTROL_PLANE_TOKEN = previousToken
  }
})
