import assert from 'node:assert/strict'
import test from 'node:test'

import { tenantWorkspacePath, workspacePathFor } from '../src/lib/tenant-workspace.ts'

const lookupOf = (rows) => async (tenantId) => rows.filter((row) => row.tenantId === tenantId)

test('a tenant surface links to the owner address, not to its runtime identity', async () => {
  const rows = [
    // A readable tenant: the identity happens to match the address.
    { id: 1, slug: 'superincompetence', tenantId: 'superincompetence' },
    // A site created before readable identities keeps its digest identity but
    // its owner still lands on the slug.
    { id: 2, slug: 'northstar-coffee', tenantId: 'site-be8225c72f3ba01a' },
  ]
  const lookup = lookupOf(rows)

  assert.equal(await tenantWorkspacePath(lookup, 'superincompetence'), '/superincompetence')
  assert.equal(await tenantWorkspacePath(lookup, 'site-be8225c72f3ba01a'), '/northstar-coffee')
})

test('an unknown, malformed or ambiguous tenant opens no guessed address', async () => {
  const lookup = lookupOf([{ id: 3, slug: 'studio', tenantId: 'site-shared' }, { id: 4, slug: 'other', tenantId: 'site-shared' }])

  assert.equal(await tenantWorkspacePath(lookup, 'site-missing'), undefined)
  assert.equal(await tenantWorkspacePath(lookup, '../superincompetence'), undefined)
  assert.equal(await tenantWorkspacePath(lookup, 'site-shared'), undefined)
})

test('a site without a slug stays reachable by the address its old links use', () => {
  assert.equal(workspacePathFor({ id: 7, slug: '' }), '/7')
  assert.equal(workspacePathFor({ id: 7, slug: 'Bad Slug' }), '/7')
  assert.equal(workspacePathFor({ slug: 'studio' }), '/studio')
  assert.equal(workspacePathFor(undefined), undefined)
})
