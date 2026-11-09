import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('the workspace renders Messages inside the control plane', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /view: 'messages', label: 'Messages'/)
  assert.doesNotMatch(nav, /admin-entry\/\$\{tenantId\}\?next=.*\/mail\/inbox/)
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  assert.match(workspace, /<HelloAdaMail \/>/)
  assert.match(workspace, /<HelloAdaMail surface="calendar" \/>/)
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
