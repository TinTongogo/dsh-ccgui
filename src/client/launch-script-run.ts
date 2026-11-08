/**
 * Runs a startup script in the harness's own terminal. Each script gets a terminal tab of
 * its own in the right sidebar, so a dev server and a watcher can run side by side. Running
 * a script again closes its previous tab first, which ends whatever the last run left
 * running (closing a terminal tab kills its shell), and starts it fresh, as CC GUI does.
 * @module dsh-ccgui/client/launch-script-run
 */

import type { Store } from './store.ts'
import { scriptLabel, shellInput } from './launch-scripts.ts'
import type { LaunchScript } from './launch-scripts.ts'

/** A sidebar tab, as far as the runner needs to find and reopen terminals. */
export interface LaunchTab {
  readonly id: string
  readonly kind: string
  readonly contentId: string
}

/** The parts of the harness's `ctx.sidebarRight` the runner uses. */
export interface LaunchSidebar {
  tabsIn(sessionId: string): readonly LaunchTab[]
  openTabIn(sessionId: string, kind: string): void
  closeIn(sessionId: string, tabId: string): void
}

/** What the runner reads of a terminal's state. */
export interface LaunchTerminalState {
  readonly phase: string
  readonly writable: boolean
  readonly error?: string | undefined
}

/** The parts of a harness terminal view the runner uses. */
export interface LaunchTerminalView {
  readonly state: Store<LaunchTerminalState>
  write(data: string): void
  rename(title: string): Promise<void>
}

/** The parts of the harness's `ctx.webTerminals` the runner uses. */
export interface LaunchTerminals {
  view(sessionId: string, key: string, contentId: string): LaunchTerminalView
}

/** Runs scripts; one per plugin instance, since it remembers which tab each script owns. */
export interface LaunchRunner {
  run(sessionId: string, script: LaunchScript): Promise<void>
}

const TERMINAL_KIND = 'terminal'
/** A shell normally attaches well within a second; a cold remote host can take a while. */
const ATTACH_TIMEOUT_MS = 15_000
const DEAD_PHASES: ReadonlySet<string> = new Set(['failed', 'closed', 'closing'])
const OPEN_FAILED = '没能打开终端标签'
const ATTACH_FAILED = '终端没有准备好，命令没有发送'
const ATTACH_TIMED_OUT = '等待终端超时，命令没有发送'

/**
 * Wait until a terminal accepts input.
 * @param view - the terminal.
 * @param timeoutMs - how long to wait.
 * @returns once input can be written.
 */
export function whenWritable(view: LaunchTerminalView, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined
    const finish = (error?: Error): void => {
      clearTimeout(timer)
      unsubscribe()
      if (error === undefined) resolve()
      else reject(error)
    }
    const check = (): void => {
      const state = view.state.getSnapshot()
      if (state.writable) finish()
      else if (DEAD_PHASES.has(state.phase)) finish(new Error(state.error ?? ATTACH_FAILED))
    }
    const timer = setTimeout(() => {
      finish(new Error(ATTACH_TIMED_OUT))
    }, timeoutMs)
    unsubscribe = view.state.subscribe(check)
    check()
  })
}

function openFreshTerminal(sidebar: LaunchSidebar, sessionId: string): LaunchTab {
  const before = new Set(sidebar.tabsIn(sessionId).map((tab) => tab.id))
  // Opening a docked tab focuses it and expands the column, which is what mounts the
  // terminal; a terminal that is not on screen never attaches and cannot take input.
  sidebar.openTabIn(sessionId, TERMINAL_KIND)
  const opened = sidebar.tabsIn(sessionId).find((tab) => tab.kind === TERMINAL_KIND && !before.has(tab.id))
  if (opened === undefined) throw new Error(OPEN_FAILED)
  return opened
}

/**
 * @param sidebar - the harness's right sidebar.
 * @param terminals - the harness's terminal views.
 * @param timeoutMs - how long to wait for a terminal to attach.
 * @returns a runner.
 */
export function createLaunchRunner(
  sidebar: LaunchSidebar,
  terminals: LaunchTerminals,
  timeoutMs: number = ATTACH_TIMEOUT_MS,
): LaunchRunner {
  let owned: ReadonlyMap<string, string> = new Map()
  return {
    async run(sessionId, script) {
      const key = `${sessionId}\n${script.id}`
      const previous = owned.get(key)
      if (previous !== undefined && sidebar.tabsIn(sessionId).some((tab) => tab.id === previous)) {
        sidebar.closeIn(sessionId, previous)
      }
      const tab = openFreshTerminal(sidebar, sessionId)
      owned = new Map(owned).set(key, tab.id)
      const view = terminals.view(sessionId, tab.id, tab.contentId)
      await whenWritable(view, timeoutMs)
      view.write(shellInput(script.command))
      view.rename(scriptLabel(script)).catch(() => {
        /* the tab keeps the shell's own title; the command already ran */
      })
    },
  }
}
