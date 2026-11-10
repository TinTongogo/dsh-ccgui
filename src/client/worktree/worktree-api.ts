/**
 * The 新建 Worktree dialog's two requests to the git routes: what to fill the form with, and
 * the creation itself. Both run in the right-clicked workspace's directory.
 * @module dsh-ccgui/client/worktree/worktree-api
 */

import { gitPost } from '../git-post.ts'
import type { Fetch } from '../git-post.ts'

/** The repository as the host reports it; see src/git/git-worktree.ts. */
export interface RepoInfo {
  readonly repo: true
  readonly root: string
  readonly name: string
  readonly parent: string
  readonly separator: string
  readonly current?: string | undefined
  readonly local: readonly string[]
  readonly remote: readonly string[]
}

/** A directory outside any repository. */
interface NotARepo {
  readonly repo: false
}

export type WorktreeMode = 'new' | 'existing' | 'pr'

export interface CreateRequest {
  readonly mode: WorktreeMode
  readonly branch: string
  readonly base?: string
  readonly pr?: string
  readonly path: string
}

interface Created {
  readonly path: string
  readonly branch: string
}

export interface WorktreeApi {
  info(): Promise<RepoInfo | NotARepo>
  create(request: CreateRequest): Promise<Created | NotARepo>
}

/**
 * @param fetchFn - the fetch to use.
 * @param cwd - the workspace's directory.
 * @returns the two requests; each rejects with a message ready to show.
 */
export function createWorktreeApi(fetchFn: Fetch, cwd: string): WorktreeApi {
  const post = gitPost(fetchFn, cwd)
  return {
    info: () => post('worktree-info'),
    create: (request) => post('worktree-add', request),
  }
}
