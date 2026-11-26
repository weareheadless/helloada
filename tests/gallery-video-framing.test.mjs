import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

/**
 * A gallery card is an aspect-ratio box with no height of its own, so a media
 * child sized `height: 100%` falls back to the file's intrinsic size and spills
 * out of the frame. The frame clips it, and a tall clip was shown as a middle
 * slice that no longer said what the clip was. These rules keep the child
 * inside the frame and show the whole clip.
 */

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const rule = (source, selector) => {
  // Anchor on the selector starting its own rule; the same selector also
  // appears inside a grouped rule above it.
  const pattern = new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm')
  const match = pattern.exec(source)
  assert.ok(match, `${selector} has no rule of its own`)
  const start = match.index + match[0].length
  return source.slice(start, source.indexOf('}', start))
}

const gallery = read('src/workspace/styles/owner-workspace.scss')
const surfaces = read('src/workspace/styles/_surfaces.scss')

test('a gallery card keeps its media inside the aspect-ratio frame', () => {
  const shared = rule(gallery, '.helloada-gallery-card-image img, .helloada-gallery-card-image video')
  // `height: 100%` alone does not resolve against an aspect-ratio frame; the
  // absolute inset is what makes the child the size of the frame.
  assert.match(shared, /position: absolute;/)
  assert.match(shared, /inset: 0;/)
  assert.match(shared, /width: 100%;/)
  assert.match(shared, /height: 100%;/)
})

test('a clip is shown whole and centred rather than cropped to the frame', () => {
  assert.match(rule(gallery, '.helloada-gallery-card-image video'), /object-fit: contain;/)
  // A still may fill the frame; a clip may not be cropped to it.
  assert.match(rule(gallery, '.helloada-gallery-card-image img'), /object-fit: cover;/)
})

test('the letterbox around a clip is a media band in every theme', () => {
  // The band is the surface a clip sits on, not a themed panel: it is the same
  // dark value in both mixes, so a letterboxed clip never reads as empty card.
  const light = surfaces.slice(0, surfaces.indexOf('@mixin chrome'))
  const dark = surfaces.slice(surfaces.indexOf('@mixin chrome'))
  const band = (source) => {
    const match = /--helloada-video-band: (#[0-9a-f]{6});/i.exec(source)
    assert.ok(match, 'the media band is not declared')
    return match[1].toLowerCase()
  }
  assert.equal(band(light), band(dark))
  assert.match(rule(gallery, '.helloada-gallery-card-image video'), /background: var\(--helloada-video-band\);/)
})

test('the kind badge reads on the media, not in the theme ink', () => {
  // The badge must outrank `.helloada-gallery-card-image > span`, the other
  // direct span child of the frame, or its label silently turns placeholder-grey.
  const badge = rule(gallery, '.helloada-gallery-card-image > span.helloada-gallery-kind')
  assert.match(badge, /color: #fff;/)
  assert.doesNotMatch(badge, /color: var\(--helloada-ink\);/)
  // It also has to sit above the media it labels.
  assert.match(badge, /z-index: 1;/)
})
