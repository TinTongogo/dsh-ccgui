/**
 * Which workspaces are worktrees of which, and what the 「Worktrees」 group lists under each:
 * plain data derived from the harness's workspace and session lists plus what the host said
 * about each workspace's checkout. A worktree is nested only under a workspace whose folder is
 * its repository's main checkout; one whose repository is not a workspace stays where it is.
 * @module dsh-ccgui/client/worktree/worktree-layout
 */

/** One workspace, as the harness's workspace list reports it. */
export interface WorkspaceItem {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/** What the host said about a workspace's checkout; see src/git/git-worktree.ts. */
export interface Checkout {
  readonly top: string
  readonly main: string
  readonly branch: string
}

/** A worktree workspace, listed under its repository's workspace. */
export interface WorktreeEntry extends WorkspaceItem {
  readonly branch: string
}

export interface WorktreeLayout {
  /** Worktrees by the workspace they are nested under, in the workspace list's order. */
  readonly byParent: ReadonlyMap<string, readonly WorktreeEntry[]>
  /** Every nested worktree, which therefore leaves the top level. */
  readonly childIds: ReadonlySet<string>
}

/** One session, as far as the group shows it. */
export interface SessionSummary {
  readonly title?: string | undefined
  readonly blank?: boolean | undefined
  readonly updatedAt?: string | number | undefined
  readonly running?: boolean | undefined
  readonly retainedBy?: { readonly mainView?: number | undefined } | undefined
}

export interface SessionRow {
  readonly id: string
  readonly title: string
  readonly updatedAt: number | undefined
  readonly running: boolean
  readonly current: boolean
}

type SessionsById = Readonly<Record<string, SessionSummary | undefined>>

/** The harness's own label for a session that has no title yet. */
const UNTITLED = '新会话'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Compare paths the way both the host and git may print them. */
const pathKey = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * @param items - the workspaces, in the order the harness lists them.
 * @param checkouts - what the host said about each workspace path; `null` for no repository.
 * @returns the worktrees by parent workspace, and the set of nested ones.
 */
export function layoutWorktrees(
  items: readonly WorkspaceItem[],
  checkouts: ReadonlyMap<string, Checkout | null>,
): WorktreeLayout {
  const byPath = new Map(items.map((item) => [pathKey(item.path), item.workspaceId]))
  const pairs = items.flatMap((item) => {
    const checkout = checkouts.get(item.path)
    if (checkout === undefined || checkout === null || pathKey(checkout.top) === pathKey(checkout.main)) return []
    const parent = byPath.get(pathKey(checkout.main))
    return parent === undefined || parent === item.workspaceId
      ? []
      : [{ parent, entry: { ...item, branch: checkout.branch } }]
  })
  const byParent = pairs.reduce<ReadonlyMap<string, readonly WorktreeEntry[]>>(
    (groups, { parent, entry }) => new Map(groups).set(parent, [...(groups.get(parent) ?? []), entry]),
    new Map(),
  )
  return { byParent, childIds: new Set(pairs.map(({ entry }) => entry.workspaceId)) }
}

/**
 * @param byId - the harness's sessions.
 * @returns the session in the main view, if any.
 */
export function currentSessionId(byId: SessionsById): string | undefined {
  return Object.entries(byId).find(([, session]) => (session?.retainedBy?.mainView ?? 0) > 0)?.[0]
}

function timeOf(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? value : Date.parse(value)
}

/**
 * The sessions a worktree row lists, like the harness's own rows: archived ones and empty new
 * sessions are left out, except the new session that is open, where the user is about to type.
 * @param entry - the worktree.
 * @param byId - the harness's sessions.
 * @param archived - archived session ids.
 * @returns the rows, in the workspace's order.
 */
export function sessionRows(entry: WorktreeEntry, byId: SessionsById, archived: ReadonlySet<string>): SessionRow[] {
  const current = currentSessionId(byId)
  return entry.sessionIds.flatMap((id) => {
    const session = byId[id]
    if (session === undefined || archived.has(id)) return []
    if (session.blank === true && id !== current) return []
    const title = session.blank === true ? '' : (session.title?.trim() ?? '')
    return [
      {
        id,
        title: title === '' ? UNTITLED : title,
        updatedAt: timeOf(session.updatedAt),
        running: session.running === true,
        current: id === current,
      },
    ]
  })
}

/**
 * @param at - when, in milliseconds.
 * @param now - the current time, in milliseconds.
 * @returns how long ago in the coarsest whole unit, as the session list shows it.
 */
export function relativeTime(at: number | undefined, now: number): string {
  if (at === undefined || Number.isNaN(at)) return ''
  const elapsed = Math.max(0, now - at)
  if (elapsed < MINUTE_MS) return '刚刚'
  if (elapsed < HOUR_MS) return `${String(Math.floor(elapsed / MINUTE_MS))}分钟`
  if (elapsed < DAY_MS) return `${String(Math.floor(elapsed / HOUR_MS))}小时`
  return `${String(Math.floor(elapsed / DAY_MS))}天`
}
