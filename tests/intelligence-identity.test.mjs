import test from 'node:test'
import assert from 'node:assert/strict'

import { helloAdaIntelligenceIdentity, isMatchingIntelligenceIdentity } from '../src/lib/intelligence-identity.ts'
import { canonicalIntelligenceReceipt, registerWebsiteTenant, resolveOrCreateOwnerWebsite } from '../src/lib/website.ts'

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

function payloadFake() {
  const websites = []
  let nextId = 1
  return {
    websites,
    async find({ collection, where }) {
      if (collection !== 'websites') return { docs: [] }
      const tenant = where.and.find(clause => clause.tenantId)?.tenantId || {}
      const owner = where.and.find(clause => clause.owner)?.owner || {}
      return { docs: websites.filter(row => (tenant.equals === undefined || row.tenantId === tenant.equals)
        && (tenant.contains === undefined || row.tenantId.includes(tenant.contains))
        && row.owner === owner.equals) }
    },
    async create({ data }) {
      await Promise.resolve()
      const collision = websites.find(row => row.tenantId === data.tenantId)
      if (collision) throw new Error('unique tenant collision')
      const row = { id: nextId++, ...data }
      websites.push(row)
      return row
    },
  }
}

test('owner create service reuses concurrent/repeated identities and rejects changed labels', async () => {
  const payload = payloadFake()
  const identity = await helloAdaIntelligenceIdentity('owner-a', requestKey)
  const simultaneous = await Promise.all([
    resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Studio'),
    resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Studio'),
  ])
  assert.equal(payload.websites.length, 1)
  assert.equal(simultaneous[0].website.id, simultaneous[1].website.id)
  assert.equal((await resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Studio')).website.id, simultaneous[0].website.id)
  assert.deepEqual(await resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Renamed'), { error: 'idempotency_conflict' })
  const otherOwner = await resolveOrCreateOwnerWebsite(payload, {}, 'owner-b', await helloAdaIntelligenceIdentity('owner-b', requestKey), 'Studio')
  assert.notEqual(otherOwner.website.id, simultaneous[0].website.id)
  assert.equal(payload.websites.length, 2)
})

test('owner create service reuses one legacy suffix and refuses ambiguous legacy records', async () => {
  const payload = payloadFake()
  const identity = await helloAdaIntelligenceIdentity('owner-a', requestKey)
  payload.websites.push({ id: 30, owner: 'owner-a', name: 'Old name', tenantId: `old-name-${identity.requestDigest}` })
  const reused = await resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Old name')
  assert.equal(reused.website.id, 30)
  assert.equal(reused.identity.tenantId, `old-name-${identity.requestDigest}`)
  payload.websites.push({ id: 31, owner: 'owner-a', name: 'Old name', tenantId: `another-old-name-${identity.requestDigest}` })
  assert.deepEqual(await resolveOrCreateOwnerWebsite(payload, {}, 'owner-a', identity, 'Old name'), { error: 'idempotency_conflict' })
  assert.equal(payload.websites.length, 2)
})

test('canonical registration receipt is optional, scope-bound, and retains only whitelisted IDs', async () => {
  const identity = await helloAdaIntelligenceIdentity('42', requestKey)
  const echo = {
    external_organization_id: identity.externalOrganizationId,
    owner_subject: identity.ownerSubject,
    origin: { system: 'helloada', external_id: identity.origin.externalId },
    external_project_id: identity.externalProjectId,
  }
  assert.equal(canonicalIntelligenceReceipt({}, identity).status, 'pending')
  assert.equal(canonicalIntelligenceReceipt({ intelligence_identity: echo }, identity).status, 'acknowledged')
  assert.equal(canonicalIntelligenceReceipt({ intelligence_identity: echo, intelligence_registration: {
    status: 'registered', workspace_id: 'ws-7', project_id: 'pr-9', token: 'must-not-persist',
    external_organization_id: identity.externalOrganizationId,
    origin: { system: 'helloada', external_id: identity.origin.externalId },
    external_project_id: identity.externalProjectId,
  } }, identity).projectId, 'pr-9')
  assert.equal(canonicalIntelligenceReceipt({ intelligence_identity: { ...echo, external_project_id: 'wrong' },
    intelligence_registration: { status: 'registered', workspace_id: 'ws-7', project_id: 'pr-9' } }, identity), 'invalid')
  assert.equal(canonicalIntelligenceReceipt({ intelligence_identity: echo,
    intelligence_registration: { status: 'registered', workspace_id: 'ws-8', project_id: 'pr-9',
      external_organization_id: identity.externalOrganizationId,
      origin: { system: 'helloada', external_id: identity.origin.externalId }, external_project_id: 'wrong' } }, identity), 'invalid')
})

test('registration outage and mismatched receipt fail closed; retry reuses the same tenant and project', async () => {
  const payload = payloadFake()
  const identity = await helloAdaIntelligenceIdentity('owner-retry', requestKey)
  const first = await resolveOrCreateOwnerWebsite(payload, {}, 'owner-retry', identity, 'Retry Site')
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SITE_AGENT_URL
  const previousToken = process.env.HELLOADA_CONTROL_PLANE_TOKEN
  process.env.SITE_AGENT_URL = 'https://agent.example'
  process.env.HELLOADA_CONTROL_PLANE_TOKEN = 'test-control-token'
  let attempts = 0
  try {
    globalThis.fetch = async () => { attempts += 1; throw new Error('offline') }
    const outage = await registerWebsiteTenant(identity.tenantId, 'Retry Site', identity)
    assert.equal(outage.ok, false)
    globalThis.fetch = async () => {
      attempts += 1
      return Response.json({ tenant_id: identity.tenantId, intelligence_identity: { external_project_id: 'wrong' } })
    }
    const mismatchResponse = await registerWebsiteTenant(identity.tenantId, 'Retry Site', identity)
    const mismatch = canonicalIntelligenceReceipt(await mismatchResponse.json(), identity)
    assert.equal(mismatch, 'invalid')
    const retry = await resolveOrCreateOwnerWebsite(payload, {}, 'owner-retry', identity, 'Retry Site')
    assert.equal(retry.website.id, first.website.id)
    assert.equal(retry.identity.externalProjectId, first.identity.externalProjectId)
    assert.equal(payload.websites.length, 1)
    assert.equal(attempts, 2)
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SITE_AGENT_URL
    else process.env.SITE_AGENT_URL = previousUrl
    if (previousToken === undefined) delete process.env.HELLOADA_CONTROL_PLANE_TOKEN
    else process.env.HELLOADA_CONTROL_PLANE_TOKEN = previousToken
  }
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
