/**
 * What the host says about each workspace's checkout (which repository it belongs to, which
 * branch it is on), looked up once per path and kept for the session list's lifetime. The
 * 「Worktrees」 group reads it to know which workspaces to nest; a path the host could not
 * answer for is remembered as no repository, so a broken folder is not asked about again and
 * again on every list change.
 * @module dsh-ccgui/client/worktree/worktree-checkouts
 */

import { gitPost } from '../git-post.ts'
import type { Fetch } from '../git-post.ts'
import type { Store } from '../store.ts'
import type { Checkout } from './worktree-layout.ts'

type Answer = { readonly repo: false } | ({ readonly repo: true } & Checkout)

export interface CheckoutStore extends Store<ReadonlyMap<string, Checkout | null>> {
  /** Look up the paths not known or asked about yet. */
  readonly track: (paths: readonly string[]) => void
  /** Ask about every known path again, keeping the old answers until new ones arrive. */
  readonly refresh: () => void
}

/**
 * @param fetchFn - the fetch to post to the git routes with.
 * @returns the store, empty until paths are tracked.
 */
export function createCheckouts(fetchFn: Fetch): CheckoutStore {
  let known: ReadonlyMap<string, Checkout | null> = new Map()
  let asking: ReadonlySet<string> = new Set()
  let listeners: readonly (() => void)[] = []
  const settle = (path: string, checkout: Checkout | null): void => {
    asking = new Set([...asking].filter((candidate) => candidate !== path))
    known = new Map(known).set(path, checkout)
    for (const listener of listeners) listener()
  }
  const ask = (path: string): void => {
    asking = new Set(asking).add(path)
    gitPost(
      fetchFn,
      path,
    )<Answer>('worktree-of').then(
      (answer) => {
        settle(path, answer.repo ? { top: answer.top, main: answer.main, branch: answer.branch } : null)
      },
      (_error: unknown) => {
        // A folder the host cannot read is shown as a plain workspace; nothing to report.
        settle(path, null)
      },
    )
  }
  return {
    getSnapshot: () => known,
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    track: (paths) => {
      for (const path of paths) if (!known.has(path) && !asking.has(path)) ask(path)
    },
    refresh: () => {
      for (const path of known.keys()) if (!asking.has(path)) ask(path)
    },
  }
}
