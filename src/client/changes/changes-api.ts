/**
 * The browser's side of the git routes: one POST per operation, answered with
 * `{ success, data, error }`. The session's working directory goes with every request; the
 * Node half finds the repository from it.
 * @module dsh-ccgui/client/changes/changes-api
 */

import { GIT_ROUTE_PREFIX } from '../../constants.ts'
import type { BranchList, FileDiff, StatusAnswer } from './changes-model.ts'

/** `window.fetch`, or a stand-in in tests. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>

/** Which version of a file a diff compares. */
export type DiffSide = 'staged' | 'unstaged' | 'untracked'

export interface GitApi {
  status(): Promise<StatusAnswer>
  branches(): Promise<BranchList | { readonly repo: false }>
  diff(target: { path: string; side: DiffSide; origPath?: string | undefined }): Promise<FileDiff>
  stage(paths: readonly string[]): Promise<StatusAnswer>
  unstage(paths: readonly string[]): Promise<StatusAnswer>
  discard(target: { tracked: readonly string[]; untracked: readonly string[] }): Promise<StatusAnswer>
  commit(change: { message: string; paths: readonly string[] }): Promise<StatusAnswer>
  push(): Promise<StatusAnswer>
  pull(): Promise<StatusAnswer>
  checkout(branch: { branch: string; remote: boolean }): Promise<StatusAnswer>
  createBranch(branch: string): Promise<StatusAnswer>
}

const NETWORK_FAILED = '无法连接到 DSH 服务'

interface Answer {
  readonly success?: unknown
  readonly data?: unknown
  readonly error?: unknown
}

async function answerOf(response: Response): Promise<Answer> {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? body : {}
  } catch (_error: unknown) {
    // A proxy's HTML error page, say; the status code below still tells what happened.
    return {}
  }
}

/**
 * Bind the routes to one working directory.
 * @param fetchFn - the fetch to use.
 * @param cwd - the session's working directory.
 * @returns one method per operation; each rejects with a message ready to show.
 */
export function createGitApi(fetchFn: Fetch, cwd: string): GitApi {
  const post = async <T>(operation: string, body: object = {}): Promise<T> => {
    let response: Response
    try {
      response = await fetchFn(`${GIT_ROUTE_PREFIX}/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...body, cwd }),
      })
    } catch (error: unknown) {
      throw new Error(NETWORK_FAILED, { cause: error })
    }
    const answer = await answerOf(response)
    if (!response.ok || answer.success !== true) {
      throw new Error(typeof answer.error === 'string' ? answer.error : `请求失败（${String(response.status)}）`)
    }
    return answer.data as T
  }
  return {
    status: () => post('status'),
    branches: () => post('branches'),
    diff: (target) => post('diff', target),
    stage: (paths) => post('stage', { paths }),
    unstage: (paths) => post('unstage', { paths }),
    discard: (target) => post('discard', target),
    commit: (change) => post('commit', change),
    push: () => post('push'),
    pull: () => post('pull'),
    checkout: (branch) => post('checkout', branch),
    createBranch: (branch) => post('create-branch', { branch }),
  }
}
