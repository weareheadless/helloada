import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterPageRoutes,
  groupPageRoutes,
  pagePickerGroup,
  pagePickerLabel,
} from '../src/workspace/lib/page-picker.ts'

const route = (path, kind = 'page', collection = '', sourceId = '') => ({ path, kind, collection, sourceId })

const routes = [
  route('/'),
  route('/about-us'),
  route('/pulse'),
  route('/cities/tulum'),
  route('/blog', 'post_index', 'posts'),
  route('/blog/tulum-yields', 'post', 'posts', 'post-1'),
  route('/property/ceiba', 'product', 'products', 'product-1'),
  route('/es/pulse'),
]

test('the picker groups basic pages apart from the large catalogs', () => {
  assert.equal(pagePickerGroup(route('/')), 'home')
  assert.equal(pagePickerGroup(route('/about-us')), 'pages')
  assert.equal(pagePickerGroup(route('/cities/tulum')), 'cities')
  assert.equal(pagePickerGroup(route('/blog/tulum-yields', 'post', 'posts')), 'posts')
  assert.equal(pagePickerGroup(route('/property/ceiba', 'product', 'products')), 'listings')
  assert.equal(pagePickerGroup(route('/es/pulse')), 'spanish')
})

test('labels expose the page name without the repeated route prefix', () => {
  assert.equal(pagePickerLabel(route('/'), 'Home'), 'Home')
  assert.equal(pagePickerLabel(route('/pulse'), 'Home'), 'Pulse')
  assert.equal(pagePickerLabel(route('/cities/tulum'), 'Home'), 'Tulum')
  assert.equal(pagePickerLabel(route('/blog/tulum-yields', 'post', 'posts'), 'Home'), 'Blog · Tulum yields')
  assert.equal(pagePickerLabel(route('/property/ceiba', 'product', 'products'), 'Home'), 'Listing · Ceiba')
  assert.equal(pagePickerLabel(route('/es/pulse'), 'Home'), 'Pulse · ES')
})

test('search reaches every page without rendering the whole catalog', () => {
  const matches = filterPageRoutes(routes, 'tulum', 'Home')
  assert.deepEqual(matches.map((item) => item.path), ['/cities/tulum', '/blog/tulum-yields'])
  assert.deepEqual(filterPageRoutes(routes, 'yields', 'Home').map((item) => item.path), ['/blog/tulum-yields'])
  assert.deepEqual(filterPageRoutes(routes, 'listing ceiba', 'Home').map((item) => item.path), ['/property/ceiba'])
})

test('the default picker view is bounded and starts with basic pages', () => {
  const groups = groupPageRoutes(routes, '', 'Home')
  assert.deepEqual(groups.map((group) => group.key), ['home', 'pages', 'posts', 'listings', 'cities', 'spanish'])
  assert.ok(groups.every((group) => group.routes.length <= 12))
  assert.equal(groups.reduce((total, group) => total + group.routes.length, 0), routes.length)
})

test('a broad search stays bounded while reporting the full match count', () => {
  const many = Array.from({ length: 300 }, (_, index) => route(`/property/listing-${index}`, 'product', 'products', String(index)))
  const groups = groupPageRoutes(many, 'listing', 'Home')
  assert.ok(groups.reduce((total, group) => total + group.routes.length, 0) <= 80)
  assert.equal(groups[0].total, 300)
})
