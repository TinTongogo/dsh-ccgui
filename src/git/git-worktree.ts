/**
 * `git worktree` for the 新建 Worktree dialog: what the dialog needs to fill its fields (the
 * main checkout, where worktrees go by default, the branches), and creating one from a new
 * branch, an existing branch, or a pull request. Names and paths always follow `--` or are
 * checked first, so nothing the user types is read as an option.
 * @module dsh-ccgui/git/git-worktree
 */

import { basename, dirname, join, resolve, sep } from 'node:path'
import { readBranches } from './git-read.ts'
import { GitError, mustGit, runGit } from './git-run.ts'
import type { Spawn } from './git-run.ts'
import { validBranch } from './git-write.ts'

/** Fetching waits on a remote. */
const FETCH_TIMEOUT_MS = 120_000
/** Checking out a large repository writes every file once. */
const ADD_TIMEOUT_MS = 300_000
/** Beside the main checkout, as CC GUI does: `<parent>/<repo>-worktrees/<branch>`. */
const WORKTREES_SUFFIX = '-worktrees'
/** Where a fork's pull requests live, before the fork itself. */
const PREFERRED_REMOTES = ['upstream', 'origin'] as const

const PR_NUMBER = /^#?(\d+)$/
const PR_LINK = /\/([^/]+)\/([^/]+?)(?:\.git)?\/pull\/(\d+)(?:[/?#].*)?$/

/** What the dialog shows before anything is created. */
export interface WorktreeInfo {
  readonly repo: true
  /** The main checkout, even when asked from inside a worktree. */
  readonly root: string
  readonly name: string
  /** The default directory new worktrees go in. */
  readonly parent: string
  /** The host's path separator, so the browser can join paths the host's way. */
  readonly separator: string
  readonly current: string | undefined
  readonly local: readonly string[]
  readonly remote: readonly string[]
}

/** One creation, already validated by the request layer. */
export type WorktreeRequest =
  | { readonly mode: 'new'; readonly branch: string; readonly base: string; readonly path: string }
  | { readonly mode: 'existing'; readonly branch: string; readonly path: string }
  | { readonly mode: 'pr'; readonly pr: PrRef; readonly branch: string; readonly path: string }

/** Which repository a checkout belongs to, for grouping worktrees under it in the sidebar. */
export interface WorktreeOf {
  readonly repo: true
  /** The checkout's top level. */
  readonly top: string
  /** The repository's main checkout; equal to `top` for the main checkout itself. */
  readonly main: string
  /** The branch checked out, or the short commit on a detached HEAD. */
  readonly branch: string
}

export interface WorktreeCreated {
  readonly path: string
  readonly branch: string
}

/** A pull request named by number, `#number` or link; a link also names `owner/repo`. */
export interface PrRef {
  readonly number: number
  readonly repo?: string
}

function prNumber(digits: string | undefined): number | undefined {
  const number = Number(digits)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

/**
 * Read what the user typed into the PR field.
 * @param input - a number, `#number`, or a pull request link.
 * @returns the pull request, or undefined when the input names none.
 */
export function parsePrInput(input: string): PrRef | undefined {
  const text = input.trim()
  const bare = PR_NUMBER.exec(text)
  if (bare !== null) {
    const number = prNumber(bare[1])
    return number === undefined ? undefined : { number }
  }
  const link = PR_LINK.exec(text)
  if (link === null) return undefined
  const number = prNumber(link[3])
  return number === undefined ? undefined : { number, repo: `${link[1] ?? ''}/${link[2] ?? ''}` }
}

async function mainCheckout(spawn: Spawn, root: string): Promise<string> {
  const result = await mustGit(spawn, root, ['worktree', 'list', '--porcelain'], '读取 worktree 列表失败')
  const first = result.stdout.split('\n').find((line) => line.startsWith('worktree '))
  // resolve: git prints C:/x on Windows, where the host's own paths read C:\x.
  return resolve(first === undefined ? root : first.slice('worktree '.length))
}

/**
 * Say which repository a checkout belongs to.
 * @param spawn - the subprocess service's spawn.
 * @param root - the checkout's top level.
 * @returns the top level, the main checkout and the branch.
 */
export async function readWorktreeOf(spawn: Spawn, root: string): Promise<WorktreeOf> {
  const main = await mainCheckout(spawn, root)
  const current = await runGit(spawn, root, ['branch', '--show-current'])
  const named = current.stdout.trim()
  const branch = named === '' ? (await runGit(spawn, root, ['rev-parse', '--short', 'HEAD'])).stdout.trim() : named
  return { repo: true, top: resolve(root), main, branch }
}

/**
 * Read what the dialog needs.
 * @param spawn - the subprocess service's spawn.
 * @param root - the top level of the checkout the user right-clicked.
 * @returns the main checkout, the default parent directory and the branches.
 */
export async function readWorktreeInfo(spawn: Spawn, root: string): Promise<WorktreeInfo> {
  const main = await mainCheckout(spawn, root)
  const name = basename(main)
  const branches = await readBranches(spawn, root)
  return {
    repo: true,
    root: main,
    name,
    parent: join(dirname(main), `${name}${WORKTREES_SUFFIX}`),
    separator: sep,
    ...branches,
  }
}

async function refExists(spawn: Spawn, root: string, ref: string): Promise<boolean> {
  const result = await runGit(spawn, root, ['show-ref', '--verify', '--quiet', ref])
  return result.exitCode === 0
}

async function remotes(spawn: Spawn, root: string): Promise<readonly string[]> {
  const result = await mustGit(spawn, root, ['remote'], '读取远程仓库失败')
  return result.stdout.split('\n').filter((line) => line !== '')
}

/** Split `origin/feature/x` into a configured remote and its branch, if it is one. */
async function remoteBranch(
  spawn: Spawn,
  root: string,
  name: string,
): Promise<{ remote: string; branch: string } | undefined> {
  const known = await remotes(spawn, root)
  const remote = known.find((candidate) => name.startsWith(`${candidate}/`))
  return remote === undefined ? undefined : { remote, branch: name.slice(remote.length + 1) }
}

async function fetchRemoteBranch(spawn: Spawn, root: string, name: string): Promise<void> {
  const target = await remoteBranch(spawn, root, name)
  if (target === undefined) return
  await mustGit(spawn, root, ['fetch', '--quiet', '--', target.remote, target.branch], {
    failure: `拉取 ${name} 失败`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

async function requireNewBranch(spawn: Spawn, root: string, branch: string): Promise<void> {
  await validBranch(spawn, root, branch)
  if (await refExists(spawn, root, `refs/heads/${branch}`)) throw new GitError(`分支已存在：${branch}`)
}

async function worktreeAdd(spawn: Spawn, root: string, args: readonly string[]): Promise<void> {
  await mustGit(spawn, root, ['worktree', 'add', '--quiet', ...args], {
    failure: '创建 worktree 失败',
    signal: AbortSignal.timeout(ADD_TIMEOUT_MS),
  })
}

async function addNewBranch(spawn: Spawn, root: string, request: { branch: string; base: string; path: string }) {
  await requireNewBranch(spawn, root, request.branch)
  const invalidBase = new GitError(`基准分支无效：${request.base}`)
  if (request.base.startsWith('-')) throw invalidBase
  await fetchRemoteBranch(spawn, root, request.base)
  const verified = await runGit(spawn, root, ['rev-parse', '--verify', '--quiet', `${request.base}^{commit}`])
  if (verified.exitCode !== 0) throw invalidBase
  // Without --no-track a remote base becomes the upstream, and a plain push would aim at it.
  await worktreeAdd(spawn, root, ['--no-track', '-b', request.branch, '--', request.path, verified.stdout.trim()])
  return { path: request.path, branch: request.branch }
}

async function addExistingBranch(spawn: Spawn, root: string, request: { branch: string; path: string }) {
  const { branch, path } = request
  await validBranch(spawn, root, branch)
  if (await refExists(spawn, root, `refs/heads/${branch}`)) {
    await worktreeAdd(spawn, root, ['--', path, branch])
    return { path, branch }
  }
  const remote = await remoteBranch(spawn, root, branch)
  if (remote === undefined) throw new GitError(`找不到分支：${branch}`)
  await fetchRemoteBranch(spawn, root, branch)
  if (!(await refExists(spawn, root, `refs/remotes/${branch}`))) throw new GitError(`找不到分支：${branch}`)
  if (await refExists(spawn, root, `refs/heads/${remote.branch}`)) {
    await worktreeAdd(spawn, root, ['--', path, remote.branch])
  } else {
    await worktreeAdd(spawn, root, ['--track', '-b', remote.branch, '--', path, branch])
  }
  return { path, branch: remote.branch }
}

const normalizeUrl = (url: string): string =>
  url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')

async function remoteFor(spawn: Spawn, root: string, repo: string | undefined): Promise<string> {
  const known = await remotes(spawn, root)
  if (known.length === 0) throw new GitError('没有可以拉取 PR 的远程仓库')
  if (repo !== undefined) {
    const wanted = repo.toLowerCase()
    const urls = await Promise.all(
      known.map(async (remote) => ({ remote, url: (await runGit(spawn, root, ['remote', 'get-url', remote])).stdout })),
    )
    const match = urls.find(({ url }) => {
      const normalized = normalizeUrl(url)
      return normalized.endsWith(`/${wanted}`) || normalized.endsWith(`:${wanted}`)
    })
    if (match !== undefined) return match.remote
  }
  return PREFERRED_REMOTES.find((name) => known.includes(name)) ?? known[0] ?? 'origin'
}

async function addPullRequest(spawn: Spawn, root: string, request: { pr: PrRef; branch: string; path: string }) {
  const { pr, branch, path } = request
  await requireNewBranch(spawn, root, branch)
  const remote = await remoteFor(spawn, root, pr.repo)
  // GitHub publishes every pull request's head under refs/pull/, so no API client is needed.
  await mustGit(spawn, root, ['fetch', '--quiet', '--', remote, `refs/pull/${String(pr.number)}/head`], {
    failure: `拉取 PR #${String(pr.number)} 失败`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const head = await mustGit(spawn, root, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], '读取 PR 提交失败')
  await worktreeAdd(spawn, root, ['-b', branch, '--', path, head.stdout.trim()])
  return { path, branch }
}

/**
 * Create a worktree.
 * @param spawn - the subprocess service's spawn.
 * @param root - the top level of the checkout the user right-clicked.
 * @param request - what to check out, and where.
 * @returns where the worktree is and which branch it has checked out.
 */
export async function addWorktree(spawn: Spawn, root: string, request: WorktreeRequest): Promise<WorktreeCreated> {
  if (request.mode === 'new') return addNewBranch(spawn, root, request)
  if (request.mode === 'existing') return addExistingBranch(spawn, root, request)
  return addPullRequest(spawn, root, request)
}
