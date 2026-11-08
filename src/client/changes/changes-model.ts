/**
 * The 变更 panel's data and the pure rules over it: the status the git routes answer with,
 * which files a commit takes (the selection), the summary row's totals, and how a path is
 * split for display. Mirrors the Node half's types, which the browser bundle cannot import.
 * @module dsh-ccgui/client/changes/changes-model
 */

/** M modified, A added, D deleted, R renamed, C copied, T type changed, U conflicted, ? untracked. */
export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'

export interface ChangeEntry {
  readonly path: string
  readonly origPath?: string
  readonly status: ChangeStatus
  readonly additions?: number
  readonly deletions?: number
}

export interface RepoStatus {
  readonly repo: true
  readonly root: string
  readonly branch: string | undefined
  readonly ahead: number | undefined
  readonly behind: number | undefined
  readonly staged: readonly ChangeEntry[]
  readonly unstaged: readonly ChangeEntry[]
  readonly untracked: readonly ChangeEntry[]
}

/** What every operation answers for a directory outside any repository. */
interface NotRepo {
  readonly repo: false
}

export type StatusAnswer = RepoStatus | NotRepo

export interface BranchList {
  readonly current: string | undefined
  readonly local: readonly string[]
  readonly remote: readonly string[]
}

export interface FileDiff {
  readonly patch: string
  readonly truncated: boolean
}

/** The panel's three groups, in the order it lists them. */
export type GroupId = 'staged' | 'unstaged' | 'untracked'
export const GROUP_IDS: readonly GroupId[] = ['staged', 'unstaged', 'untracked']

export const GROUP_TITLES: Readonly<Record<GroupId, string>> = {
  staged: '已暂存',
  unstaged: '未暂存',
  untracked: '未跟踪',
}

export interface Summary {
  /** Distinct files with any change. */
  readonly files: number
  readonly additions: number
  readonly deletions: number
}

function sum(entries: readonly ChangeEntry[], key: 'additions' | 'deletions'): number {
  return entries.reduce((total, entry) => total + (entry[key] ?? 0), 0)
}

/**
 * Every path with a change, each once.
 * @param status - the repository status.
 * @returns the paths, staged ones first.
 */
export function changedPaths(status: RepoStatus): ReadonlySet<string> {
  return new Set(GROUP_IDS.flatMap((group) => status[group].map((entry) => entry.path)))
}

/**
 * The summary row's totals.
 * @param status - the repository status.
 * @returns distinct files and line counts across all groups.
 */
export function summarize(status: RepoStatus): Summary {
  const entries = GROUP_IDS.flatMap((group) => status[group])
  return {
    files: changedPaths(status).size,
    additions: sum(entries, 'additions'),
    deletions: sum(entries, 'deletions'),
  }
}

/**
 * Carry the commit selection over to a new status, as CC GUI does: files that no longer
 * have changes leave it, and files that became staged join it. The first status selects
 * everything staged.
 * @param selection - the current selection.
 * @param before - the status the selection was made against, if any.
 * @param after - the new status.
 * @returns the new selection.
 */
export function reconcileSelection(
  selection: ReadonlySet<string>,
  before: RepoStatus | undefined,
  after: RepoStatus,
): ReadonlySet<string> {
  const present = changedPaths(after)
  const wasStaged = new Set(before?.staged.map((entry) => entry.path) ?? [])
  const kept = [...selection].filter((path) => present.has(path))
  const newlyStaged = after.staged.map((entry) => entry.path).filter((path) => !wasStaged.has(path))
  return new Set([...kept, ...newlyStaged])
}

/**
 * Add or remove paths from the selection.
 * @param selection - the current selection.
 * @param paths - the paths to change.
 * @param selected - whether they should be selected.
 * @returns a new selection.
 */
export function toggleSelection(
  selection: ReadonlySet<string>,
  paths: readonly string[],
  selected: boolean,
): ReadonlySet<string> {
  if (selected) return new Set([...selection, ...paths])
  const removed = new Set(paths)
  return new Set([...selection].filter((path) => !removed.has(path)))
}

/**
 * The selected paths that still have changes, which is what a commit takes.
 * @param selection - the selection.
 * @param status - the repository status.
 * @returns the paths to commit.
 */
export function commitPaths(selection: ReadonlySet<string>, status: RepoStatus): readonly string[] {
  const present = changedPaths(status)
  return [...selection].filter((path) => present.has(path))
}

/** How much of a group is selected, for its tri-state checkbox. */
export type GroupCheck = 'all' | 'some' | 'none'

/**
 * @param selection - the selection.
 * @param entries - one group's entries.
 * @returns whether all, some or none of them are selected.
 */
export function groupCheck(selection: ReadonlySet<string>, entries: readonly ChangeEntry[]): GroupCheck {
  const count = entries.filter((entry) => selection.has(entry.path)).length
  if (count === 0) return 'none'
  return count === entries.length ? 'all' : 'some'
}

/**
 * Split a path into its directory, shown dimmed and cut from the left, and its file name.
 * @param path - a repository-relative path.
 * @returns the directory with its trailing slash (empty at the top level) and the name.
 */
export function splitPath(path: string): { readonly dir: string; readonly name: string } {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) }
}

/** What each status letter means, for the letter's tooltip. */
export const STATUS_LABELS: Readonly<Record<ChangeStatus, string>> = {
  M: '已修改',
  A: '新文件',
  D: '已删除',
  R: '已重命名',
  C: '已复制',
  T: '类型已变',
  U: '有冲突',
  '?': '未跟踪',
}
