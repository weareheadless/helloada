import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('the mailbox is mounted at the canonical site path', () => {
  const page = read('src/app/[site]/mail/[[...path]]/page.tsx')
  assert.match(page, /<MailboxApp/)
  assert.match(page, /basePath: sitePath\(slug, '\/mail'\)/)
  assert.match(page, /apiBase: `\/api\/helloada\/websites\/\$\{encodeURIComponent\(slug\)\}\/owner\/mail`/)
  assert.match(page, /loadSiteView\(site\)/)
})

test('one origin serves many tenants, so the mailbox runtime is keyed on the tenant', () => {
  // Every website's mailbox renders from helloada.app. Without the tenant in the
  // mailbox identity, the package's caches and browser storage are shared by
  // whichever sites the owner visited, which is the defect this key prevents.
  const page = read('src/app/[site]/mail/[[...path]]/page.tsx')
  assert.match(page, /key=\{tenantId\}/, 'the mailbox must remount per tenant')
  assert.match(page, /tenantKey: tenantId/, 'the mailbox config must carry the tenant identity')
  const types = read('src/types/helloada-mailbox-ui.d.ts')
  assert.match(types, /MailboxConfig = \{ apiBase: string; basePath: string; tenantKey: string \}/)
})

test('the mailbox shares the control-plane navigation', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /sitePath\(slug, '\/mail'\)/)
  const page = read('src/app/[site]/mail/[[...path]]/page.tsx')
  assert.match(page, /<SiteNav/)
})

test('the mailbox package is pinned to an exact release artifact', () => {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  const name = '@weareheadless/helloada-mailbox-ui'
  const url = pkg.dependencies[name]
  assert.match(url, /^https:\/\/github\.com\/weareheadless\/site-agent\/releases\/download\/helloada-mailbox-ui-v\d+\.\d+\.\d+\/weareheadless-helloada-mailbox-ui-\d+\.\d+\.\d+\.tgz$/)
  const entry = lock.packages[`node_modules/${name}`]
  assert.equal(entry.resolved, url)
  assert.match(entry.integrity, /^sha512-/)
  assert.equal(lock.packages[''].dependencies[name], url)
})

test('the owner proxy keeps attachment download headers', () => {
  const route = read('src/app/api/helloada/websites/[id]/owner/[...path]/route.ts')
  assert.match(route, /proxyTenantWorkspace\(/)
  const proxy = read('src/lib/tenant-proxy.ts')
  assert.match(proxy, /content-disposition/)
})

test('the mailbox route loads Tailwind and the package styles only there', () => {
  const layout = read('src/app/[site]/mail/[[...path]]/layout.tsx')
  assert.match(layout, /workspace\/styles\/mailbox\.css/)
  assert.match(layout, /workspace\/styles\/mail-tokens\.scss/)
  const mailbox = read('src/workspace/styles/mailbox.css')
  assert.match(mailbox, /@import "tailwindcss"/)
  assert.match(mailbox, /helloada-mailbox-ui\/dist\/styles\.css/)
  assert.match(mailbox, /@source/)
  // The workspace must not load Tailwind and its reset.
  const workspace = read('src/app/[site]/workspace/layout.tsx')
  assert.doesNotMatch(workspace, /tailwind|mailbox\.css/)
})
