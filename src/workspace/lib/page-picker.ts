export type PagePickerRoute = {
  path: string
  kind: string
  collection: string
  sourceId: string
}

export type PagePickerGroupKey =
  | 'home'
  | 'pages'
  | 'posts'
  | 'listings'
  | 'cities'
  | 'collections'
  | 'dashboards'
  | 'spanish'
  | 'other'

export type PagePickerGroup = {
  key: PagePickerGroupKey
  total: number
  routes: PagePickerRoute[]
}

export const PAGE_PICKER_GROUP_ORDER: PagePickerGroupKey[] = [
  'home',
  'pages',
  'posts',
  'listings',
  'cities',
  'collections',
  'dashboards',
  'spanish',
  'other',
]

const GROUP_LIMITS: Record<PagePickerGroupKey, number> = {
  home: 1,
  pages: 12,
  posts: 8,
  listings: 8,
  cities: 10,
  collections: 8,
  dashboards: 8,
  spanish: 8,
  other: 8,
}

const SEARCH_GROUP_LIMIT = 20
const SEARCH_TOTAL_LIMIT = 80

const segments = (path: string) => path.split('/').filter(Boolean)

const humanize = (value: string) => {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }
  const text = decoded.replace(/[-_]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

export const pagePickerGroup = (route: PagePickerRoute): PagePickerGroupKey => {
  const parts = segments(route.path)
  if (!parts.length) return 'home'
  if (parts[0] === 'es') return 'spanish'
  const top = parts[0]
  if (route.kind === 'post' || route.kind === 'post_index' || top === 'blog') return 'posts'
  if (route.kind === 'product' || top === 'property' || top === 'properties') return 'listings'
  if (top === 'cities') return 'cities'
  if (top === 'collections') return 'collections'
  if (top === 'daily-dashboards') return 'dashboards'
  if (top === 'about-us' || top === 'pulse' || top === 'weekly-brief' || top === 'privacy-notice'
    || top === 'terms-and-conditions-of-use' || top === 'transparency-cookie-policy' || top === 'login'
    || top === 'sign-up') return 'pages'
  return 'other'
}

export const pagePickerLabel = (route: PagePickerRoute, homeLabel: string): string => {
  if (route.path === '/') return homeLabel
  const parts = segments(route.path)
  const spanish = parts[0] === 'es'
  const rest = spanish ? parts.slice(1) : parts
  const label = humanize(rest[rest.length - 1] || '')
  if (!label) return route.path
  const prefix = route.kind === 'post'
    ? 'Blog · '
    : route.kind === 'product'
      ? 'Listing · '
      : ''
  return `${prefix}${label}${spanish ? ' · ES' : ''}`
}

const searchText = (route: PagePickerRoute, homeLabel: string) =>
  `${pagePickerLabel(route, homeLabel)} ${route.path} ${route.kind} ${route.collection}`.toLowerCase()

const matchScore = (route: PagePickerRoute, query: string, homeLabel: string) => {
  const label = pagePickerLabel(route, homeLabel).toLowerCase()
  const path = route.path.toLowerCase()
  if (path === query || path === `/${query}`) return 0
  if (label === query) return 1
  if (label.startsWith(query)) return 2
  if (path.startsWith(`/${query}`)) return 3
  if (label.includes(query)) return 4
  return 5
}

export const filterPageRoutes = (
  routes: PagePickerRoute[],
  query: string,
  homeLabel = 'Home',
): PagePickerRoute[] => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return routes
  const terms = normalized.split(/\s+/)
  return routes
    .filter((route) => {
      const haystack = searchText(route, homeLabel)
      return terms.every((term) => haystack.includes(term))
    })
    .sort((left, right) => {
      const score = matchScore(left, normalized, homeLabel) - matchScore(right, normalized, homeLabel)
      if (score) return score
      const group = PAGE_PICKER_GROUP_ORDER.indexOf(pagePickerGroup(left))
        - PAGE_PICKER_GROUP_ORDER.indexOf(pagePickerGroup(right))
      if (group) return group
      return pagePickerLabel(left, homeLabel).localeCompare(pagePickerLabel(right, homeLabel))
    })
}

export const groupPageRoutes = (
  routes: PagePickerRoute[],
  query: string,
  homeLabel = 'Home',
): PagePickerGroup[] => {
  const searching = Boolean(query.trim())
  const matched = searching
    ? filterPageRoutes(routes, query, homeLabel)
    : [...routes].sort((left, right) =>
      pagePickerLabel(left, homeLabel).localeCompare(pagePickerLabel(right, homeLabel))
      || left.path.localeCompare(right.path))
  const grouped = new Map<PagePickerGroupKey, PagePickerRoute[]>()
  for (const route of matched) {
    const key = pagePickerGroup(route)
    const group = grouped.get(key) || []
    group.push(route)
    grouped.set(key, group)
  }
  const groups: PagePickerGroup[] = []
  let remaining = searching ? SEARCH_TOTAL_LIMIT : Number.POSITIVE_INFINITY
  for (const key of PAGE_PICKER_GROUP_ORDER) {
    const groupRoutes = grouped.get(key)
    if (!groupRoutes?.length) continue
    const limit = searching ? Math.min(SEARCH_GROUP_LIMIT, remaining) : GROUP_LIMITS[key]
    const visible = groupRoutes.slice(0, Math.max(0, limit))
    if (!visible.length) continue
    groups.push({ key, total: groupRoutes.length, routes: visible })
    remaining -= visible.length
    if (searching && remaining <= 0) break
  }
  return groups
}
