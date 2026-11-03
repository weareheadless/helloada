/** One supported, operator-only source convention. No arbitrary URL or ref. */
export function normalizeGithubRepository(value: unknown): string | null {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string') return null
  let input = value.trim()
  if (!input) return ''
  if (input.startsWith('https://github.com/')) input = input.slice('https://github.com/'.length)
  if (input.endsWith('.git')) input = input.slice(0, -4)
  const match = input.match(/^weareheadless\/([A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*)$/)
  if (!match || match[1].length > 100) return null
  return input.toLowerCase()
}

export function provisioningPhase(repository: string, state: { status?: unknown; workspace_ready?: unknown; website_live?: unknown }) {
  if (state.status === 'failed') return 'needs_attention' as const
  if (!repository) return 'intake' as const
  return state.workspace_ready === true && state.website_live === true ? 'live' as const : 'designing' as const
}

export function matchesGithubSource(value: unknown, repository: string): boolean {
  if (!repository) return true
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return source.kind === 'github_static' && source.repository === repository && source.branch === 'main'
}
