import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('the workspace has one mailbox and hands old Messages links to it', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /view: 'messages', label: 'Messages'/)
  assert.match(nav, /href: sitePath\(slug, '\/mail'\)/)
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  // The mailbox is the control-plane route; the workspace only hands an old
  // ?view=messages link over instead of rendering a second mailbox.
  assert.match(workspace, /<MailboxHandoff slug=\{slug\} \/>/)
  assert.match(workspace, /router\.replace\(sitePath\(slug, '\/mail\/inbox'\)\)/)
  assert.doesNotMatch(workspace, /<HelloAdaMail \/>/)
  assert.equal(existsSync(resolve(root, 'src/workspace/components/MailflarePayloadView.tsx')), false)
})

test('the integrated mailbox talks to the tenant bridge instead of an iframe', () => {
  const mail = read('src/workspace/components/HelloAdaMail.tsx')
  assert.match(mail, /fetchHelloAda\('\/api\/helloada\/mail\/mailboxes'/)
  assert.match(mail, /\/api\/helloada\/mail\/messages/)
  assert.match(mail, /\/api\/helloada\/mail\/send/)
  assert.doesNotMatch(mail, /<iframe/)
})

test('the workspace navigation keeps advanced content separate from Messages', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /Manage content ↗/)
  assert.match(nav, /bookings\s*\?/)
})
