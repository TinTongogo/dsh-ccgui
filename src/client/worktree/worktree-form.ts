/**
 * The 新建 Worktree form as plain data: its starting state, the branch and location it implies,
 * what is still missing, and the request it sends. The host checks names and paths for real;
 * this only keeps the create button honest and fills in the defaults the user sees.
 * @module dsh-ccgui/client/worktree/worktree-form
 */

import type { CreateRequest, RepoInfo, WorktreeMode } from './worktree-api.ts'

export interface WorktreeForm {
  readonly mode: WorktreeMode
  /** The new branch's name (新分支). */
  readonly branch: string
  /** What the new branch starts from (新分支). */
  readonly base: string
  /** A local or remote branch to check out (已有分支). */
  readonly existing: string
  /** A number, `#number` or link (从 PR 创建). */
  readonly pr: string
  readonly prBranch: string
  /** Once the user types a PR branch name, a new PR number no longer replaces it. */
  readonly prBranchEdited: boolean
  /** Empty means the default location. */
  readonly path: string
  readonly openSession: boolean
}

const PR_BRANCH_PREFIX = 'pr-'
const PR_INPUT = /^#?(\d+)$|\/pull\/(\d+)(?:[/?#]|$)/
/** Characters some file system refuses in a folder name, and whitespace. */
const UNSAFE_SEGMENT = /[\\/:*?"<>|\s]+/g
const EDGE_DASHES = /^-+|-+$/g
const TITLE_SEPARATOR = ' / '

const MISSING_BRANCH = '请填写分支名'
const MISSING_BASE = '请选择基准分支'
const MISSING_EXISTING = '请选择分支'
const MISSING_PR = '请填写 PR 编号或链接'
const MISSING_PATH = '请填写位置'

/**
 * @param info - the repository.
 * @returns a new branch from the current one, opening a session once created.
 */
export function initialForm(info: RepoInfo): WorktreeForm {
  return {
    mode: 'new',
    branch: '',
    base: info.current ?? info.local[0] ?? '',
    existing: '',
    pr: '',
    prBranch: '',
    prBranchEdited: false,
    path: '',
    openSession: true,
  }
}

/**
 * @param input - what the user typed into the PR field.
 * @returns the pull request number, or undefined when the input names none.
 */
export function prNumber(input: string): number | undefined {
  const match = PR_INPUT.exec(input.trim())
  const number = Number(match?.[1] ?? match?.[2])
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

/**
 * Take a new PR input, naming the branch after it unless the user named the branch.
 * @param form - the form.
 * @param pr - the new input.
 * @returns the updated form.
 */
export function withPr(form: WorktreeForm, pr: string): WorktreeForm {
  if (form.prBranchEdited) return { ...form, pr }
  const number = prNumber(pr)
  return { ...form, pr, prBranch: number === undefined ? '' : `${PR_BRANCH_PREFIX}${String(number)}` }
}

/**
 * @param form - the form.
 * @param info - the repository.
 * @returns the branch the worktree will have checked out; a remote branch becomes its local name.
 */
export function branchOf(form: WorktreeForm, info: RepoInfo): string {
  if (form.mode === 'new') return form.branch.trim()
  if (form.mode === 'pr') return form.prBranch.trim()
  const existing = form.existing.trim()
  return info.remote.includes(existing) ? existing.slice(existing.indexOf('/') + 1) : existing
}

/**
 * @param info - the repository.
 * @param branch - the branch the worktree checks out.
 * @returns `<repo>-worktrees/<branch as one folder>`, or empty when the branch gives no name.
 */
export function defaultPath(info: RepoInfo, branch: string): string {
  const segment = branch.replace(UNSAFE_SEGMENT, '-').replace(EDGE_DASHES, '')
  return segment === '' ? '' : `${info.parent}${info.separator}${segment}`
}

function targetPath(form: WorktreeForm, info: RepoInfo): string {
  const typed = form.path.trim()
  return typed === '' ? defaultPath(info, branchOf(form, info)) : typed
}

function fieldProblem(form: WorktreeForm): string | undefined {
  switch (form.mode) {
    case 'new':
      if (form.branch.trim() === '') return MISSING_BRANCH
      return form.base.trim() === '' ? MISSING_BASE : undefined
    case 'existing':
      return form.existing.trim() === '' ? MISSING_EXISTING : undefined
    case 'pr':
      if (prNumber(form.pr) === undefined) return MISSING_PR
      return form.prBranch.trim() === '' ? MISSING_BRANCH : undefined
  }
}

/**
 * @param form - the form.
 * @param info - the repository.
 * @returns what is still missing, or undefined when the form can be sent.
 */
export function formProblem(form: WorktreeForm, info: RepoInfo): string | undefined {
  return fieldProblem(form) ?? (targetPath(form, info) === '' ? MISSING_PATH : undefined)
}

/**
 * @param form - a form without problems.
 * @param info - the repository.
 * @returns the creation request.
 */
export function requestOf(form: WorktreeForm, info: RepoInfo): CreateRequest {
  const path = targetPath(form, info)
  switch (form.mode) {
    case 'new':
      return { mode: 'new', branch: form.branch.trim(), base: form.base.trim(), path }
    case 'existing':
      return { mode: 'existing', branch: form.existing.trim(), path }
    case 'pr':
      return { mode: 'pr', pr: form.pr.trim(), branch: form.prBranch.trim(), path }
  }
}

/**
 * The sidebar lists workspaces flat, so the title carries the repository the worktree belongs to.
 * @param info - the repository.
 * @param branch - the worktree's branch.
 * @returns the workspace title.
 */
export function workspaceTitle(info: RepoInfo, branch: string): string {
  return `${info.name}${TITLE_SEPARATOR}${branch}`
}
