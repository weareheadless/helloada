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
  if (!repository) {
    // Older APIs have no source echo. An explicit static echo, however, must
    // never be mistaken for an intake request after lost/stale UI receipts.
    if (value === undefined || value === null) return true
    if (!value || typeof value !== 'object') return false
    const source = value as Record<string, unknown>
    // A website started without an imported repository is provisioned from the
    // canonical template: site-agent echoes that as `new_repository`, which is
    // the same source as an empty intake request.
    return Object.keys(source).length === 0
      || ((source.kind === 'intake' || source.kind === 'new_repository')
        && source.repository === '' && source.branch === 'main')
  }
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return source.kind === 'github_static' && source.repository === repository && source.branch === 'main'
}
