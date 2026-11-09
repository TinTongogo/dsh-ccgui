/**
 * Whether a newer release of this plugin is out: asks GitHub for the repository's latest release
 * and compares its tag with the running version.
 * @module dsh-ccgui/client/update-check
 */

/** `window.fetch`, or a stand-in in tests. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** A published release newer than the running one. */
export interface LatestRelease {
  /** Its version without the leading `v`, e.g. `1.0.2`. */
  readonly version: string
  /** Its release page, which carries the generated notes. */
  readonly url: string
}

// The release workflow creates a GitHub Release for every v* tag, so its latest one is the newest
// published version; GitHub serves the API with CORS open, which the renderer needs.
export const LATEST_RELEASE_API = 'https://api.github.com/repos/zhukunpenglinyutong/dsh-ccgui/releases/latest'
const RELEASE_PAGE_PREFIX = 'https://github.com/zhukunpenglinyutong/dsh-ccgui/releases/'
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/
// A check that hangs must not keep the settings page waiting for a chip that never comes.
const CHECK_TIMEOUT_MS = 8000

function parseVersion(value: string): readonly number[] | undefined {
  const match = SEMVER.exec(value.trim())
  return match ? match.slice(1).map(Number) : undefined
}

/**
 * Compare two `x.y.z` versions; anything else (a development build, a prerelease) is never newer.
 * @param candidate - the version that may be newer.
 * @param current - the running version.
 * @returns whether `candidate` is strictly newer.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate)
  const now = parseVersion(current)
  if (!next || !now) return false
  const index = next.findIndex((part, i) => part !== now[i])
  return index !== -1 && (next[index] ?? 0) > (now[index] ?? 0)
}

function readRelease(body: unknown): { readonly tag: string; readonly url: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const tag = 'tag_name' in body ? body.tag_name : undefined
  const url = 'html_url' in body ? body.html_url : undefined
  if (typeof tag !== 'string') return undefined
  // Only follow a link that stays on this repository's release pages.
  const page = typeof url === 'string' && url.startsWith(RELEASE_PAGE_PREFIX) ? url : `${RELEASE_PAGE_PREFIX}tag/${tag}`
  return { tag, url: page }
}

/**
 * Look up the latest release and report it when it is newer than `current`.
 * @param fetchFn - the fetch to use.
 * @param current - the running version.
 * @returns the newer release, or undefined when there is none or the check failed.
 */
export async function checkForUpdate(fetchFn: Fetch, current: string): Promise<LatestRelease | undefined> {
  // A development build has nothing to compare with, so it never asks.
  if (!parseVersion(current)) return undefined
  try {
    const response = await fetchFn(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return undefined
    const release = readRelease(await response.json())
    if (!release || !isNewerVersion(release.tag, current)) return undefined
    return { version: release.tag.replace(/^v/, ''), url: release.url }
  } catch (_error: unknown) {
    // Offline, rate-limited, timed out or blocked: nothing the user can act on here, so the
    // version pill simply stays as it is.
    return undefined
  }
}

/**
 * Share one check per page load, so reopening the settings page does not ask GitHub again
 * (its unauthenticated limit is 60 requests an hour).
 * @param fetchFn - the fetch to use.
 * @param current - the running version.
 * @returns a function resolving to the newer release, if any.
 */
export function createUpdateChecker(fetchFn: Fetch, current: string): () => Promise<LatestRelease | undefined> {
  let pending: Promise<LatestRelease | undefined> | undefined
  return () => {
    pending ??= checkForUpdate(fetchFn, current)
    return pending
  }
}
