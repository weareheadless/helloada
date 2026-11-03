import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { provisioningPhase, matchesGithubSource } from '../src/lib/github-provisioning.ts'

const root = new URL('../', import.meta.url).pathname
const moduleFor = async (entry) => {
  const result = await build({
    entryPoints: [root + entry], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'route-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(next\/|@\/lib\/)/ }, ({ path }) => {
        if (['@/lib/github-provisioning', '@/lib/platform-admin', '@/lib/intelligence-identity', '@/lib/tenant-admin', '@/lib/bootstrap-contract'].includes(path)) {
          return { path: root + path.replace('@/', 'src/') + '.ts' }
        }
        return { path, namespace: 'boundary' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'boundary' }, ({ path }) => ({ contents: path === 'next/server'
        ? 'export const NextResponse = { json: (value, options) => Response.json(value, options) }'
        : path === 'next/headers' ? 'export const headers = async () => new Headers()'
          : path === '@/lib/auth' ? 'export const currentUser = async () => globalThis.__githubProvision.auth'
            : `export { normalizeGithubRepository } from ${JSON.stringify(root + 'src/lib/github-provisioning.ts')};
              export const resolveOrCreateOwnerWebsite = async (_p,_r,_u,identity) => { globalThis.__githubProvision.effects.push('resolve'); return { website: globalThis.__githubProvision.website, identity }; };
              export const canonicalIntelligenceReceipt = () => ({ status: 'pending' });
              export const registerWebsiteTenant = async (...args) => { globalThis.__githubProvision.effects.push(['register', ...args]); return Response.json({ tenant_id: args[0], provisioning_source: globalThis.__githubProvision.sourceEcho === false ? undefined : { kind: args[3] ? 'github_static' : 'intake', repository: args[3] || '', branch: 'main' } }); };
              export const startWebsiteBootstrap = async (...args) => { globalThis.__githubProvision.effects.push(['bootstrap', ...args]); return Response.json({ ...globalThis.__githubProvision.remote, tenant_id: args[0], provisioning_source: { kind: args[2] ? 'github_static' : 'intake', repository: args[2] || '', branch: 'main' } }); };
              export const websiteBootstrapStatus = async () => Response.json(globalThis.__githubProvision.remote);
              export const ownedWebsite = async () => globalThis.__githubProvision.website;`,
        resolveDir: root, loader: 'ts',
      }))
    } }],
  })
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
}

function fixture({ admin = true, receipts, remote } = {}) {
  const state = { effects: [], job: receipts === undefined ? null : { id: 2, resourceReceipts: receipts },
    website: { id: 1, name: 'Astrid', tenantId: 'site-existing', phase: 'designing' },
    remote: { status: 'queued', step: 'requested', workspace_ready: false, website_live: false, ...remote } }
  state.auth = { user: admin ? { id: 8, email: 'admin@helloada.app', createdAt: '2026-10-20T15:14:51.990Z', collection: 'users' }
    : { id: 9, email: 'owner@example.com', collection: 'users' }, req: {}, payload: {
    find: async () => ({ docs: state.job ? [state.job] : [] }),
    create: async ({ data }) => (state.job = { id: 2, ...data }),
    update: async ({ collection, data }) => {
      if (collection === 'bootstrap-jobs') state.job = { ...state.job, ...data }
      if (collection === 'websites') state.website = { ...state.website, ...data }
      return collection === 'websites' ? state.website : state.job
    },
  } }
  globalThis.__githubProvision = state
  return state
}

const request = (repository) => new Request('https://helloada.app/api/helloada/websites', { method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': '01234567-89ab-cdef-0123-456789abcdef' },
  body: JSON.stringify({ name: 'Astrid', github_repository: repository }) })

test('create route rejects invalid input and nonoperators before provider effects', async () => {
  const route = await moduleFor('src/app/api/helloada/websites/route.ts')
  for (const repository of ['https://evil.invalid/x', null, 'https://github.com/weareheadless/x#main']) {
    const state = fixture()
    assert.equal((await route.POST(request(repository))).status, 400)
    assert.deepEqual(state.effects, [])
  }
  const state = fixture({ admin: false })
  assert.equal((await route.POST(request('weareheadless/astrid-rincon-website'))).status, 403)
  assert.deepEqual(state.effects, [])
  state.auth = null
  assert.equal((await route.POST(request('weareheadless/astrid-rincon-website'))).status, 401)
})

test('create route pins source, forwards it twice and does not enter intake or claim live early', async () => {
  const route = await moduleFor('src/app/api/helloada/websites/route.ts')
  const state = fixture()
  const response = await route.POST(request('https://github.com/weareheadless/astrid-rincon-website.git'))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).phase, 'designing')
  assert.equal(state.website.phase, 'designing')
  assert.equal(state.job.resourceReceipts.github_repository, 'weareheadless/astrid-rincon-website')
  assert.equal(state.effects.find(effect => effect[0] === 'register')[4], 'weareheadless/astrid-rincon-website')
  assert.equal(state.effects.find(effect => effect[0] === 'bootstrap')[3], 'weareheadless/astrid-rincon-website')
  const count = state.effects.length
  assert.equal((await route.POST(request('weareheadless/different'))).status, 409)
  assert.equal(state.effects.length, count + 1) // resolve same owner website, no provider call
  assert.equal((await route.POST(request(''))).status, 409)
})

test('legacy intake source cannot be switched and blank retains the intake path', async () => {
  const route = await moduleFor('src/app/api/helloada/websites/route.ts')
  fixture({ receipts: {} })
  assert.equal((await route.POST(request('weareheadless/astrid-rincon-website'))).status, 409)
  const state = fixture({ admin: false })
  const response = await route.POST(request(''))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).phase, 'intake')
  assert.equal(state.website.phase, 'intake')
})

test('retry reads the saved repository; verified GET projects live without intake', async () => {
  const route = await moduleFor('src/app/api/helloada/websites/[id]/bootstrap/route.ts')
  const state = fixture({ receipts: { github_repository: 'weareheadless/astrid-rincon-website' } })
  const params = { params: Promise.resolve({ id: '1' }) }
  assert.equal((await route.POST(new Request('https://helloada.app/retry', { method: 'POST', body: '{"github_repository":"weareheadless/other"}' }), params)).status, 202)
  assert.equal(state.effects.find(effect => effect[0] === 'bootstrap')[3], 'weareheadless/astrid-rincon-website')
  assert.equal(state.website.phase, 'designing')
  state.remote = { ...state.remote, tenant_id: state.website.tenantId, status: 'done', step: 'ready', workspace_ready: true, website_live: true,
    provisioning_source: { kind: 'github_static', repository: 'weareheadless/astrid-rincon-website', branch: 'main' },
    resource_receipts: { creating_worker: { worker_url: 'https://helloada-astrid.weareheadless.workers.dev' } } }
  const response = await route.GET(new Request('https://helloada.app/status'), params)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).website.phase, 'live')
  assert.equal(state.website.phase, 'live')
})

test('an old backend cannot silently turn a GitHub request into intake', async () => {
  const route = await moduleFor('src/app/api/helloada/websites/route.ts')
  const state = fixture()
  state.sourceEcho = false
  const response = await route.POST(request('weareheadless/astrid-rincon-website'))
  assert.equal((await response.json()).error, 'tenant_registration_failed')
  assert.equal(state.website.phase, 'needs_attention')
  assert.equal(state.effects.filter(effect => effect[0] === 'bootstrap').length, 0)
})

test('phase requires exact independent workspace and public-site readiness', () => {
  assert.equal(provisioningPhase('weareheadless/x', { workspace_ready: true, website_live: false }), 'designing')
  assert.equal(provisioningPhase('weareheadless/x', { workspace_ready: true, website_live: true }), 'live')
  assert.equal(provisioningPhase('', { workspace_ready: true, website_live: true }), 'intake')
  assert.equal(matchesGithubSource({ kind: 'github_static', repository: 'weareheadless/x', branch: 'main' }, ''), false)
  assert.equal(matchesGithubSource(undefined, ''), true)
})
