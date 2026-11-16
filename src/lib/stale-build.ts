/**
 * A deployed build replaces the previous one's JS chunks.
 *
 * A tab that was opened before the deploy keeps running its old document, keeps
 * its API calls working, and then fails the moment it navigates, because the
 * chunk it asks for no longer exists. The browser reports that as a chunk-load
 * error or a rejected dynamic import, and the owner is left on a dead page
 * until they reload by hand. One reload fixes it, so the app asks for it once.
 */
export const STALE_BUILD_GUARD_KEY = 'helloada:stale-build-reload-at'
export const STALE_BUILD_GUARD_MS = 30_000

const STALE_BUILD_MESSAGE = /ChunkLoadError|Loading chunk [\w.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

export function isStaleBuildFailure(message: string): boolean {
  return STALE_BUILD_MESSAGE.test(String(message || ''))
}

/**
 * True at most once per guard window, so a genuinely broken chunk cannot put
 * the tab in a reload loop.
 */
export function shouldReloadForStaleBuild(
  message: string,
  lastReloadAt: number | null,
  now: number,
): boolean {
  if (!isStaleBuildFailure(message)) return false
  if (lastReloadAt === null || !Number.isFinite(lastReloadAt)) return true
  return now - lastReloadAt > STALE_BUILD_GUARD_MS
}
