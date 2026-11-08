/**
 * The 变更 panel's state: the latest status, the commit selection and message, which
 * operation is running, the last error, and the file whose diff is open. Status is read on
 * mount, when the window regains focus, on a slow timer while the panel is up, and after
 * every operation (each write answers with the fresh status).
 * @module dsh-ccgui/client/changes/use-changes
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiffSide, GitApi } from './changes-api.ts'
import { commitPaths, reconcileSelection, toggleSelection } from './changes-model.ts'
import type { ChangeEntry, StatusAnswer } from './changes-model.ts'

/** Agents change files while the panel is open; this catches what focus events miss. */
const REFRESH_INTERVAL_MS = 15_000

/** The operations the panel can be busy with; one at a time. */
type Busy = 'stage' | 'unstage' | 'discard' | 'commit' | 'push' | 'pull' | 'checkout'

/** A file whose diff the panel shows instead of the list. */
export interface OpenDiff {
  readonly entry: ChangeEntry
  readonly side: DiffSide
}

export interface ChangesState {
  readonly answer: StatusAnswer | undefined
  readonly selection: ReadonlySet<string>
  readonly message: string
  readonly busy: Busy | undefined
  /** A background status read is in flight; it never blocks the buttons. */
  readonly refreshing: boolean
  readonly error: string | undefined
  readonly diff: OpenDiff | undefined
}

export interface ChangesActions {
  readonly refresh: () => void
  readonly setMessage: (message: string) => void
  readonly select: (paths: readonly string[], selected: boolean) => void
  readonly stage: (paths: readonly string[]) => void
  readonly unstage: (paths: readonly string[]) => void
  readonly discard: (target: { tracked: readonly string[]; untracked: readonly string[] }) => void
  readonly commit: () => void
  readonly push: () => void
  readonly pull: () => void
  readonly checkout: (branch: string, remote: boolean) => void
  readonly createBranch: (branch: string) => void
  readonly openDiff: (diff: OpenDiff | undefined) => void
  readonly dismissError: () => void
}

const INITIAL: ChangesState = {
  answer: undefined,
  selection: new Set(),
  message: '',
  busy: undefined,
  refreshing: false,
  error: undefined,
  diff: undefined,
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function applyAnswer(state: ChangesState, answer: StatusAnswer): ChangesState {
  if (!answer.repo) return { ...state, answer, selection: new Set() }
  const before = state.answer?.repo === true ? state.answer : undefined
  return { ...state, answer, selection: reconcileSelection(state.selection, before, answer) }
}

type SetState = (update: (previous: ChangesState) => ChangesState) => void
type Run = (
  busy: Busy,
  operation: (api: GitApi) => Promise<StatusAnswer>,
  after?: (next: ChangesState) => ChangesState,
) => void

/** The panel's live state and a write counter, read inside callbacks without re-creating them. */
interface Refs {
  readonly current: { current: ChangesState }
  /** Counts writes, so a status read that started before one cannot land after it. */
  readonly generation: () => number
  readonly bump: () => void
}

function createRun(api: GitApi, setState: SetState, refs: Refs): Run {
  return (busy, operation, after) => {
    if (refs.current.current.busy !== undefined) return
    refs.bump()
    setState((previous) => ({ ...previous, busy, error: undefined }))
    operation(api).then(
      (answer) => {
        setState((previous) => {
          const next = { ...applyAnswer(previous, answer), busy: undefined }
          return after === undefined ? next : after(next)
        })
      },
      (error: unknown) => {
        setState((previous) => ({ ...previous, busy: undefined, error: messageOf(error) }))
      },
    )
  }
}

function createRefresh(api: GitApi, setState: SetState, refs: Refs): () => void {
  return () => {
    const { busy, refreshing } = refs.current.current
    if (busy !== undefined || refreshing) return
    const started = refs.generation()
    setState((previous) => ({ ...previous, refreshing: true }))
    api.status().then(
      (answer) => {
        setState((previous) =>
          refs.generation() === started
            ? { ...applyAnswer(previous, answer), refreshing: false }
            : { ...previous, refreshing: false },
        )
      },
      (error: unknown) => {
        setState((previous) => ({ ...previous, refreshing: false, error: messageOf(error) }))
      },
    )
  }
}

type WriteActions = Pick<
  ChangesActions,
  'stage' | 'unstage' | 'discard' | 'commit' | 'push' | 'pull' | 'checkout' | 'createBranch'
>

function writeActions(run: Run, current: { current: ChangesState }): WriteActions {
  return {
    stage: (paths) => {
      run(
        'stage',
        (api) => api.stage(paths),
        (next) => ({ ...next, selection: toggleSelection(next.selection, paths, true) }),
      )
    },
    unstage: (paths) => {
      run(
        'unstage',
        (api) => api.unstage(paths),
        (next) => ({ ...next, selection: toggleSelection(next.selection, paths, false) }),
      )
    },
    discard: (target) => {
      run(
        'discard',
        (api) => api.discard(target),
        (next) => ({ ...next, diff: undefined }),
      )
    },
    commit: () => {
      const { answer, selection, message } = current.current
      if (answer?.repo !== true) return
      const paths = commitPaths(selection, answer)
      run(
        'commit',
        (api) => api.commit({ message, paths }),
        (next) => ({ ...next, message: '' }),
      )
    },
    push: () => {
      run('push', (api) => api.push())
    },
    pull: () => {
      run('pull', (api) => api.pull())
    },
    checkout: (branch, remote) => {
      run('checkout', (api) => api.checkout({ branch, remote }))
    },
    createBranch: (branch) => {
      run('checkout', (api) => api.createBranch(branch))
    },
  }
}

type LocalActions = Pick<ChangesActions, 'setMessage' | 'select' | 'openDiff' | 'dismissError'>

function localActions(setState: SetState): LocalActions {
  return {
    setMessage: (message) => {
      setState((previous) => ({ ...previous, message }))
    },
    select: (paths, selected) => {
      setState((previous) => ({ ...previous, selection: toggleSelection(previous.selection, paths, selected) }))
    },
    openDiff: (diff) => {
      setState((previous) => ({ ...previous, diff }))
    },
    dismissError: () => {
      setState((previous) => ({ ...previous, error: undefined }))
    },
  }
}

/**
 * Hold the panel's state for one working directory.
 * @param api - the git routes bound to the directory.
 * @returns the state and the actions on it.
 */
export function useChanges(api: GitApi): { state: ChangesState; actions: ChangesActions } {
  const [state, setState] = useState<ChangesState>(INITIAL)
  const current = useRef(state)
  const generation = useRef(0)
  // Synced after each render, so callbacks made once still read the latest state.
  useEffect(() => {
    current.current = state
  }, [state])
  const { run, refresh } = useMemo(() => {
    const refs: Refs = {
      current,
      generation: () => generation.current,
      bump: () => {
        generation.current += 1
      },
    }
    return { run: createRun(api, setState, refs), refresh: createRefresh(api, setState, refs) }
  }, [api])
  useAutoRefresh(refresh)
  const actions = useMemo(() => ({ refresh, ...localActions(setState), ...writeActions(run, current) }), [refresh, run])
  return { state, actions }
}

/**
 * Read status now, on window focus, and on a timer, for as long as the panel is mounted. A
 * hidden page skips the timer, since every read starts git processes on the host, and reads
 * once when it shows again to catch up.
 */
function useAutoRefresh(refresh: () => void): void {
  useEffect(() => {
    const whenVisible = (): void => {
      if (document.visibilityState !== 'hidden') refresh()
    }
    refresh()
    const timer = window.setInterval(whenVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', whenVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', whenVisible)
    }
  }, [refresh])
}

/**
 * Whether the commit button can be pressed.
 * @param state - the panel's state.
 * @returns true with a message, at least one selected file, and nothing running.
 */
export function canCommit(state: ChangesState): boolean {
  if (state.answer?.repo !== true || state.busy !== undefined || state.message.trim() === '') return false
  return commitPaths(state.selection, state.answer).length > 0
}

/**
 * How many selected files a commit would take.
 * @param state - the panel's state.
 * @returns the count shown on the button.
 */
export function selectedCount(state: ChangesState): number {
  return state.answer?.repo === true ? commitPaths(state.selection, state.answer).length : 0
}
