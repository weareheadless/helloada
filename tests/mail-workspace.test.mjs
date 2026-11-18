import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('the workspace has one mailbox and hands old links to it', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /view: 'messages', label: 'Messages'/)
  assert.match(nav, /href: sitePath\(slug, '\/mail'\)/)
  assert.match(nav, /view: 'calendar' as const, label: 'Calendar', href: sitePath\(slug, '\/mail\/calendar'\)/)
  const workspace = read('src/workspace/components/WebsiteWorkspace.tsx')
  // The mailbox and the calendar are the control-plane routes; the workspace
  // only hands an old ?view= link over instead of rendering a second surface.
  assert.match(workspace, /<MailboxHandoff slug=\{slug\} target="\/mail\/inbox" \/>/)
  assert.match(workspace, /<MailboxHandoff slug=\{slug\} target="\/mail\/calendar" \/>/)
  assert.match(workspace, /router\.replace\(sitePath\(slug, target\)\)/)
  assert.doesNotMatch(workspace, /<HelloAdaMail/)
  // There is no bespoke composer or calendar left beside the generated UI.
  assert.equal(existsSync(resolve(root, 'src/workspace/components/HelloAdaMail.tsx')), false)
  assert.equal(existsSync(resolve(root, 'src/workspace/components/MailflarePayloadView.tsx')), false)
})

test('the mailbox is the generated package mounted on the tenant bridge', () => {
  const page = read('src/app/[site]/mail/[[...path]]/page.tsx')
  assert.match(page, /<MailboxApp/)
  assert.match(page, /apiBase: `\/api\/helloada\/websites\/\$\{encodeURIComponent\(slug\)\}\/owner\/mail`/)
  // The calendar tabs move between Calendar and Bookings inside the package, so
  // neither may be redirected away from it.
  assert.match(page, /if \(mailboxPath === '\/drive'/)
  assert.equal((page.match(/redirect\(sitePath\(slug, '\/'\)\)/g) || []).length, 1,
    'only Drive may leave the mailbox for the site root')
  assert.match(page, /const onCalendar = mailboxPath === '\/calendar'/)
  // Booking configuration is not in the package yet, so the path is not served
  // by a page that would fail to load the tenant's booking model.
  assert.match(page, /if \(mailboxPath === '\/booking' \|\| mailboxPath\.startsWith\('\/booking\/'\)\) notFound\(\)/)
  assert.doesNotMatch(page, /<iframe/)
})

test('the workspace navigation keeps advanced content separate from Messages', () => {
  const nav = read('src/workspace/SiteNav.tsx')
  assert.match(nav, /Manage content ↗/)
  assert.match(nav, /bookings\s*\?/)
})
