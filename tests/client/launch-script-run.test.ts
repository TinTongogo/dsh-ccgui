import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLaunchRunner, whenWritable } from '../../src/client/launch-script-run.ts'
import type {
  LaunchSidebar,
  LaunchTab,
  LaunchTerminalState,
  LaunchTerminalView,
  LaunchTerminals,
} from '../../src/client/launch-script-run.ts'
import type { LaunchScript } from '../../src/client/launch-scripts.ts'

const DEV: LaunchScript = { id: 'dev', name: '开发服务器', command: 'npm run dev' }

function fakeView(initial: LaunchTerminalState = { phase: 'connecting', writable: false }) {
  let state = initial
  let listeners: readonly (() => void)[] = []
  const view = {
    state: {
      getSnapshot: () => state,
      subscribe: (listener: () => void) => {
        listeners = [...listeners, listener]
        return () => {
          listeners = listeners.filter((other) => other !== listener)
        }
      },
    },
    write: vi.fn<(data: string) => void>(),
    rename: vi.fn<(title: string) => Promise<void>>(() => Promise.resolve()),
  } satisfies LaunchTerminalView
  const set = (next: LaunchTerminalState): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return { view, set, listenerCount: () => listeners.length }
}

/** A sidebar whose `openTabIn` adds a terminal tab, as the harness's does. */
function fakeSidebar(options: { opens?: boolean } = {}) {
  let tabs: readonly LaunchTab[] = [{ id: 'guide', kind: 'guide', contentId: 'guide:' }]
  let counter = 0
  const sidebar = {
    tabsIn: vi.fn((_sessionId: string) => tabs),
    openTabIn: vi.fn((_sessionId: string, kind: string) => {
      if (options.opens === false) return
      counter += 1
      tabs = [...tabs, { id: `t${counter}`, kind, contentId: `terminal:${counter}` }]
    }),
    closeIn: vi.fn((_sessionId: string, tabId: string) => {
      tabs = tabs.filter((tab) => tab.id !== tabId)
    }),
  } satisfies LaunchSidebar
  const drop = (tabId: string): void => {
    tabs = tabs.filter((tab) => tab.id !== tabId)
  }
  return { sidebar, drop }
}

function terminalsFor(...views: LaunchTerminalView[]) {
  let queue = views
  return {
    view: vi.fn((_sessionId: string, _key: string, _contentId: string) => {
      const [next, ...rest] = queue
      if (next === undefined) throw new Error('no more views')
      queue = rest
      return next
    }),
  } satisfies LaunchTerminals
}

afterEach(() => {
  vi.useRealTimers()
})

describe('whenWritable', () => {
  it('resolves at once when the terminal already takes input', async () => {
    const { view } = fakeView({ phase: 'connected', writable: true })
    await expect(whenWritable(view, 1000)).resolves.toBeUndefined()
  })

  it('waits for the terminal to attach and then stops listening', async () => {
    const { view, set, listenerCount } = fakeView()
    const ready = whenWritable(view, 1000)
    set({ phase: 'connected', writable: true })
    await ready
    expect(listenerCount()).toBe(0)
  })

  it('fails with the terminal error when it dies first', async () => {
    const { view, set } = fakeView()
    const ready = whenWritable(view, 1000)
    set({ phase: 'failed', writable: false, error: 'spawn failed' })
    await expect(ready).rejects.toThrow('spawn failed')
  })

  it('fails with its own message when a dead terminal gives no reason', async () => {
    const { view } = fakeView({ phase: 'closed', writable: false })
    await expect(whenWritable(view, 1000)).rejects.toThrow('终端没有准备好')
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    const { view, listenerCount } = fakeView()
    const ready = whenWritable(view, 500)
    vi.advanceTimersByTime(500)
    await expect(ready).rejects.toThrow('等待终端超时')
    expect(listenerCount()).toBe(0)
  })
})

describe('createLaunchRunner', () => {
  it('opens a terminal of its own, types the command and names the tab after the script', async () => {
    const { sidebar } = fakeSidebar()
    const { view, set } = fakeView()
    const terminals = terminalsFor(view)
    const running = createLaunchRunner(sidebar, terminals).run('s1', DEV)
    set({ phase: 'connected', writable: true })
    await running
    expect(sidebar.openTabIn).toHaveBeenCalledWith('s1', 'terminal')
    expect(terminals.view).toHaveBeenCalledWith('s1', 't1', 'terminal:1')
    expect(view.write).toHaveBeenCalledWith('npm run dev\r')
    expect(view.rename).toHaveBeenCalledWith('开发服务器')
  })

  it('restarts a script by closing the tab its last run left', async () => {
    const { sidebar } = fakeSidebar()
    const first = fakeView({ phase: 'connected', writable: true })
    const second = fakeView({ phase: 'connected', writable: true })
    const runner = createLaunchRunner(sidebar, terminalsFor(first.view, second.view))
    await runner.run('s1', DEV)
    await runner.run('s1', DEV)
    expect(sidebar.closeIn).toHaveBeenCalledExactlyOnceWith('s1', 't1')
    expect(second.view.write).toHaveBeenCalledWith('npm run dev\r')
  })

  it('leaves other scripts and other sessions alone, and skips a tab the user closed', async () => {
    const { sidebar, drop } = fakeSidebar()
    const views = [1, 2, 3, 4].map(() => fakeView({ phase: 'connected', writable: true }).view)
    const runner = createLaunchRunner(sidebar, terminalsFor(...views))
    await runner.run('s1', DEV)
    await runner.run('s1', { ...DEV, id: 'other' })
    await runner.run('s2', DEV)
    expect(sidebar.closeIn).not.toHaveBeenCalled()
    drop('t1')
    await runner.run('s1', DEV)
    expect(sidebar.closeIn).not.toHaveBeenCalled()
  })

  it('reports a terminal tab that did not open', async () => {
    const { sidebar } = fakeSidebar({ opens: false })
    await expect(createLaunchRunner(sidebar, terminalsFor()).run('s1', DEV)).rejects.toThrow('没能打开终端标签')
  })

  it('does not type into a terminal that never attached', async () => {
    const { sidebar } = fakeSidebar()
    const { view, set } = fakeView()
    const running = createLaunchRunner(sidebar, terminalsFor(view)).run('s1', DEV)
    set({ phase: 'failed', writable: false, error: 'boom' })
    await expect(running).rejects.toThrow('boom')
    expect(view.write).not.toHaveBeenCalled()
  })

  it('still counts the run when naming the tab fails', async () => {
    const { sidebar } = fakeSidebar()
    const { view } = fakeView({ phase: 'connected', writable: true })
    view.rename.mockRejectedValueOnce(new Error('rename refused'))
    await expect(createLaunchRunner(sidebar, terminalsFor(view)).run('s1', DEV)).resolves.toBeUndefined()
    expect(view.write).toHaveBeenCalled()
  })
})
