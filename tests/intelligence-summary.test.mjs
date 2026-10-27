import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { ownerWebsiteIntelligence } from '../src/lib/website.ts'

const filename = new URL('../src/app/websites/[id]/intelligence-summary.tsx', import.meta.url).pathname
const source = readFileSync(filename, 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
const mod = new Module(filename)
mod.filename = filename
mod.paths = Module._nodeModulePaths(new URL('..', import.meta.url).pathname)
const originalRequire = mod.require.bind(mod)
mod.require = (id) => id.endsWith('.css') ? {} : id === 'next/link' ? { __esModule: true, default: ({ href, children }) => createElement('a', { href }, children) } : originalRequire(id)
mod._compile(compiled, filename)
const { IntelligenceSummary } = mod.exports
const render = result => renderToStaticMarkup(createElement(IntelligenceSummary, { result }))

test('intelligence is fetched server-side through the authenticated website control-plane route', async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SITE_AGENT_URL
  const previousToken = process.env.HELLOADA_CONTROL_PLANE_TOKEN
  let request
  process.env.SITE_AGENT_URL = 'https://agent.example/v1'
  process.env.HELLOADA_CONTROL_PLANE_TOKEN = 'control-test-token'
  globalThis.fetch = async (url, init) => { request = { url, init }; return Response.json({ businessProfile: {}, research: {}, coverage: {}, visibility: {}, actions: [] }) }
  try {
    const result = await ownerWebsiteIntelligence('tenant-7')
    assert.equal(result.state, 'available')
    assert.equal(request.url, 'https://agent.example/v1/control-plane/websites/tenant-7/intelligence')
    assert.equal(request.init.headers.get('authorization'), 'Bearer control-test-token')
    assert.equal(request.init.cache, 'no-store')
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SITE_AGENT_URL
    else process.env.SITE_AGENT_URL = previousUrl
    if (previousToken === undefined) delete process.env.HELLOADA_CONTROL_PLANE_TOKEN
    else process.env.HELLOADA_CONTROL_PLANE_TOKEN = previousToken
  }
})

test('no-research state is truthful and unknown counts are not rendered as zero', () => {
  const html = render({ state: 'available', data: { businessProfile: { name: 'Example', revision: 4, updatedAt: '2026-10-20' }, research: { status: 'not_started' }, coverage: {}, visibility: { observed: null, unknown: ['AI results not checked'] }, actions: [] } })
  assert.match(html, /No research has run yet/)
  assert.match(html, /Revision:<\/strong> 4/)
  assert.match(html, /Answered:<\/strong> Unknown/)
  assert.match(html, /Observed:<\/strong> Unknown/)
  assert.doesNotMatch(html, /Answered:<\/strong> 0|Waiting on you:<\/strong> 0|Observed:<\/strong> 0/)
})

test('not-started intelligence is informational and explains the next step', () => {
  const html = render({ state: 'not_started' })
  assert.match(html, /Intelligence appears after intake and research/)
  assert.match(html, /Continue with the intake below/)
  assert.doesNotMatch(html, /unavailable|error|role="alert"|\b404\b/i)
})

test('404 becomes not-started and unavailable copy does not expose status codes', async () => {
  const previousFetch = globalThis.fetch
  process.env.SITE_AGENT_URL = 'https://agent.example'
  process.env.HELLOADA_CONTROL_PLANE_TOKEN = 'control-test-token'
  try {
    globalThis.fetch = async () => new Response('{}', { status: 404 })
    assert.deepEqual(await ownerWebsiteIntelligence('tenant-7'), { state: 'not_started' })
    const html = render({ state: 'unavailable', reason: 'HTTP 503 service failure' })
    assert.doesNotMatch(html, /\b\d{3}\b/)
    assert.match(html, /temporarily unavailable/)
  } finally { globalThis.fetch = previousFetch }
})

test('research-present state shows findings, waiting questions, visibility, and owning action link', () => {
  const html = render({ state: 'available', data: { businessProfile: { name: 'Atelier', revision: 2 }, research: { status: 'complete', lastRun: 'Yesterday', findings: ['Local demand is rising'], pending: ['Confirm service area'], blocked: ['Analytics access'] }, coverage: { answered: 3, waitingOnOwner: 1 }, visibility: { observed: ['Mention in one answer'], unknown: ['Other assistants'] }, actions: [{ id: 'a1', title: 'Review service area', href: '/websites/7/admin/growth' }] } })
  for (const text of ['Local demand is rising', 'Confirm service area', 'Analytics access', '3', '1', 'Mention in one answer', 'Other assistants', 'Review service area']) assert.ok(html.includes(text), `missing ${text}`)
  assert.match(html, /href="\/websites\/7\/admin\/growth"/)
})

test('unavailable state exposes service reason and never presents empty success or zero counts', () => {
  const html = render({ state: 'unavailable', reason: 'CrawlSEO workspace_id is invalid' })
  assert.match(html, /Intelligence unavailable/)
  assert.match(html, /CrawlSEO workspace_id is invalid/)
  assert.doesNotMatch(html, /No outstanding actions|Answered:.*0|Waiting on you:.*0/)
})
