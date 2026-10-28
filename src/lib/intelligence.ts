export type IntelligenceFact = { label: string; value: string }

export type IntelligenceSummary = {
  state: 'available' | 'not_started' | 'unavailable'
  reason: string | null
  business: IntelligenceFact[]
  research: { title: string; period: string | null; status: string | null; sources: number | null; findings: number | null } | null
  coverage: { covered: number; unresolved: number }
  actions: { open: number; total: number }
  visibility: { state: string; surfaces: number }
}

const CLOSED = new Set(['verified', 'dismissed', 'complete', 'completed', 'done'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function factValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : 'Not recorded'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    return keys.length ? JSON.stringify(value) : 'Not recorded'
  }
  return value == null || value === '' ? 'Not recorded' : String(value)
}

function businessFacts(profile: unknown): IntelligenceFact[] {
  const document = record(record(profile).document ?? profile)
  const fields = record(document.fields)
  return Object.entries(fields)
    .slice(0, 12)
    .map(([label, fact]) => ({ label, value: factValue(record(fact).value ?? fact) }))
}

function researchSummary(report: unknown) {
  const body = record(record(report).report ?? report)
  const title = text(body.title) ?? text(record(report).title)
  if (!title && Object.keys(body).length === 0) return null
  return {
    title: title ?? 'Latest research report',
    period: text(body.period),
    status: text(body.status),
    sources: typeof body.sourceCount === 'number' ? body.sourceCount : null,
    findings: typeof body.findingCount === 'number' ? body.findingCount : null,
  }
}

/** The bridge returns three lifecycle states; anything else is treated as unavailable. */
export function normalizeIntelligence(payload: unknown): IntelligenceSummary {
  const body = record(payload)
  const state = body.state === 'available' ? 'available' : body.state === 'not_started' ? 'not_started' : 'unavailable'
  const reason = text(body.reason)
  if (state !== 'available') {
    return {
      state,
      reason,
      business: [],
      research: null,
      coverage: { covered: 0, unresolved: 0 },
      actions: { open: 0, total: 0 },
      visibility: { state: 'unknown', surfaces: 0 },
    }
  }
  const coverageRows = list(record(body.coverage).findings ?? body.coverage)
  const actionRows = list(record(body.actions).actions ?? body.actions)
  const openActions = actionRows.filter((row) => {
    const status = String(record(row).status ?? '').toLowerCase()
    return status && !CLOSED.has(status)
  }).length
  const visibility = record(body.visibility)
  return {
    state,
    reason,
    business: businessFacts(body.businessProfile),
    research: researchSummary(body.research),
    coverage: {
      covered: coverageRows.filter((row) => String(record(row).status ?? '').toUpperCase() === 'COVERED').length,
      unresolved: coverageRows.filter((row) => String(record(row).status ?? '').toUpperCase() === 'UNRESOLVED').length,
    },
    actions: { open: openActions, total: actionRows.length },
    visibility: {
      state: text(visibility.state) ?? 'unknown',
      surfaces: list(visibility.surfaces).length,
    },
  }
}
