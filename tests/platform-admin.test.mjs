import test from 'node:test'
import assert from 'node:assert/strict'
import { isPlatformAdmin, platformAdministrators, websiteScope, userScope } from '../src/lib/platform-admin.ts'

const configured = platformAdministrators[0]
const admin = { ...configured, collection: 'users' }

test('platform administration requires the exact deployed account identity', () => {
  assert.equal(isPlatformAdmin(admin), true)
  assert.equal(isPlatformAdmin({ ...admin, id: Number(admin.id) }), true)
  for (const user of [null, {}, { ...admin, id: '999' }, { ...admin, createdAt: '2027-01-01' }, { ...admin, collection: 'other' }, { email: admin.email, role: 'admin' }]) {
    assert.equal(isPlatformAdmin(user), false)
  }
})

test('only the administrator can query every website and user account', () => {
  assert.deepEqual(websiteScope(admin), {})
  assert.deepEqual(userScope(admin), {})
  const user = { id: 99, email: 'owner@example.test', collection: 'users', role: 'admin' }
  assert.deepEqual(websiteScope(user), { owner: { equals: 99 } })
  assert.deepEqual(userScope(user), { id: { equals: 99 } })
})

const { Users } = await import('../src/collections/Users.ts')
const { ownedWebsite } = await import('../src/lib/website.ts')

test('users cannot read or change other accounts; administrators cannot alter other users credentials', () => {
  const ordinary = { id: 99, collection: 'users' }
  assert.equal(Users.access.read({ req: {} }), false)
  assert.deepEqual(Users.access.read({ req: { user: ordinary } }), { id: { equals: 99 } })
  assert.deepEqual(Users.access.update({ req: { user: ordinary } }), { id: { equals: 99 } })
  assert.deepEqual(Users.access.read({ req: { user: admin } }), {})
  assert.deepEqual(Users.access.update({ req: { user: admin } }), { id: { equals: admin.id } })
  assert.equal(Users.access.delete({ req: { user: admin } }), false)
})

test('reserved administrator addresses cannot be claimed through signup or profile changes', () => {
  const guard = Users.hooks.beforeChange[0]
  assert.throws(() => guard({ operation: 'create', data: { email: 'ADMIN@HELLOADA.APP' } }), /reserved/)
  assert.throws(() => guard({ operation: 'update', originalDoc: { id: 99 }, data: { email: admin.email } }), /reserved/)
  assert.deepEqual(guard({ operation: 'update', originalDoc: admin, data: { email: admin.email } }), { email: admin.email })
})

test('website entry always enforces Payload access and an explicit owner or administrator scope', async () => {
  for (const user of [admin, { id: 99, collection: 'users' }]) {
    let query
    const auth = { user, req: { user }, payload: { find: async (options) => { query = options; return { docs: [{ id: 23 }] } } } }
    assert.deepEqual(await ownedWebsite(auth, '23'), { id: 23 })
    assert.equal(query.overrideAccess, false)
    assert.deepEqual(query.where.and, [{ id: { equals: '23' } }, websiteScope(user)])
  }
  assert.equal(await ownedWebsite(null, '23'), null)
})

const { Websites } = await import('../src/collections/Websites.ts')

test('direct API callers cannot replace the owner or tenant routing identity of a website', () => {
  for (const name of ['owner', 'tenantId', 'workerUrl', 'adminUrl']) {
    const field = Websites.fields.find((field) => field.name === name)
    for (const user of [admin, { id: 99, collection: 'users' }]) {
      assert.equal(field.access.create({ req: { user } }), false, name + ' cannot be supplied by public creation')
      assert.equal(field.access.update({ req: { user } }), false, name + ' cannot be reassigned by an API client')
    }
  }
  assert.deepEqual(Websites.access.read({ req: { user: { id: 99, collection: 'users' } } }), { owner: { equals: 99 } })
  assert.equal(Websites.access.read({ req: { user: admin } }), true)
})
