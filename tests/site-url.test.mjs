import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  RESERVED_SITE_SLUGS,
  isRoutableSiteSlug,
  sitePath,
  siteSlugFromName,
  uniqueSiteSlug,
} from '../src/lib/site-url.ts'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('a website name becomes a readable URL label', () => {
  assert.equal(siteSlugFromName('Atelier de l’Harmonie'), 'atelier-de-lharmonie')
  assert.equal(siteSlugFromName('Inmersión Freediving'), 'inmersion-freediving')
  assert.equal(siteSlugFromName('  Oceanic   Vibes!  '), 'oceanic-vibes')
  assert.equal(siteSlugFromName('***'), 'site')
  assert.equal(siteSlugFromName('x'.repeat(120)).length, 48)
})

test('reserved and taken labels are never routable as a site', async () => {
  for (const reserved of ['portfolio', 'login', 'api', 'admin', 'websites']) {
    assert.equal(isRoutableSiteSlug(reserved), false, reserved)
    assert.ok(RESERVED_SITE_SLUGS.has(reserved))
  }
  assert.equal(isRoutableSiteSlug('studio'), true)
  assert.equal(isRoutableSiteSlug('Studio'), false)
  assert.equal(isRoutableSiteSlug('-studio'), false)
  assert.equal(isRoutableSiteSlug(''), false)

  const taken = new Set(['portfolio', 'studio', 'studio-2'])
  const isTaken = async (slug) => taken.has(slug)
  assert.equal(await uniqueSiteSlug(isTaken, 'Studio'), 'studio-3')
  // A reserved label never reaches the owner URL even when nothing owns it.
  assert.equal(await uniqueSiteSlug(async () => false, 'Portfolio'), 'portfolio-2')
})

test('the canonical site URL is the slug, not the numeric record id', () => {
  assert.equal(sitePath('casamigo'), '/casamigo/workspace')
  assert.equal(sitePath('casamigo', '/'), '/casamigo')
  assert.equal(sitePath('casamigo', ''), '/casamigo')
  assert.equal(sitePath('atelier-harmonie'), '/atelier-harmonie/workspace')
})

test('workspace navigation and the portfolio use the slug URL', () => {
  const workspace = read('src/workspace/WorkspacePage.tsx')
  assert.match(workspace, /sitePath\(slug\)/)
  assert.doesNotMatch(workspace, /\/websites\/\$\{id\}/)
  assert.match(workspace, /workspaceApi: `\/api\/helloada\/websites\/\$\{encodeURIComponent\(slug\)\}\/owner`/)

  const portfolio = read('src/app/portfolio/page.tsx')
  assert.match(portfolio, /website\.slug \|\| website\.id/)
  assert.doesNotMatch(portfolio, /'\/websites\/' \+ website\.id/)

  const create = read('src/app/portfolio/ui.tsx')
  assert.match(create, /result\.slug \|\| result\.id/)
})

test('legacy numeric links redirect to the slug URL', () => {
  for (const path of ['src/app/websites/[id]/page.tsx', 'src/app/websites/[id]/workspace/page.tsx']) {
    const source = read(path)
    assert.match(source, /redirect\(/, path)
    assert.match(source, /sitePath\(slug/, path)
  }
})
