import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerFilesDefault, replaceSoleGuide } from '../../src/client/files-default.ts'
import type { FilesDefaultContext, SidebarFilesFace } from '../../src/client/files-default.ts'

interface Tab {
  readonly id: string
  readonly kind: string
}

interface State {
  session: string | undefined
  tabs: readonly Tab[]
  expanded: boolean
}

function observable<T>(read: () => T) {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: read,
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    emit: () => {
      for (const listener of listeners) listener()
    },
    size: () => listeners.size,
  }
}

function fakeSidebar(initial: Partial<State> = {}) {
  const state: State = { session: 's1', tabs: [], expanded: true, ...initial }
  const mounted = observable(() => state.session)
  const openTabs = observable(() => state.tabs)
  const sidebar = {
    mounted,
    openTabs,
    tabsIn: vi.fn((_sessionId: string) => state.tabs),
    isExpanded: vi.fn(() => state.expanded),
    // Opens the way the harness does: a replacement takes the guide's place, anything else is appended.
    openTab: vi.fn((kind: string, options?: { replaceTab?: string }) => {
      const tab = { id: `${kind}-tab`, kind }
      state.tabs =
        options?.replaceTab === undefined
          ? [...state.tabs, tab]
          : state.tabs.map((existing) => (existing.id === options.replaceTab ? tab : existing))
    }),
    focus: vi.fn<(tabId: string) => void>(),
  } satisfies SidebarFilesFace
  return { sidebar, state }
}

const GUIDE: Tab = { id: 'g1', kind: 'guide' }
const FILES: Tab = { id: 'f1', kind: 'files' }
const registry = (kinds: readonly string[]) => ({ get: (kind: string) => (kinds.includes(kind) ? {} : undefined) })

afterEach(() => {
  vi.useRealTimers()
})

describe('replaceSoleGuide', () => {
  it('replaces the guide with the files page when it is all the expanded column shows', () => {
    const { sidebar } = fakeSidebar({ tabs: [GUIDE] })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.tabsIn).toHaveBeenCalledWith('s1')
    expect(sidebar.openTab).toHaveBeenCalledWith('files', { replaceTab: 'g1' })
  })

  it('also opens 变更 after 工作区文件 and keeps 工作区文件 in front when 变更 is registered', () => {
    const { sidebar, state } = fakeSidebar({ tabs: [GUIDE] })
    replaceSoleGuide(sidebar, registry(['files', 'ccgui-changes']))
    expect(sidebar.openTab.mock.calls).toEqual([['files', { replaceTab: 'g1' }], ['ccgui-changes']])
    expect(state.tabs.map((tab) => tab.kind)).toEqual(['files', 'ccgui-changes'])
    expect(sidebar.focus).toHaveBeenCalledWith('files-tab')
  })

  it('opens only 工作区文件 when 变更 is not registered', () => {
    const { sidebar } = fakeSidebar({ tabs: [GUIDE] })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.openTab).toHaveBeenCalledTimes(1)
    expect(sidebar.focus).not.toHaveBeenCalled()
  })

  it('leaves a guide the user opened beside other tabs', () => {
    const { sidebar } = fakeSidebar({ tabs: [FILES, GUIDE] })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })

  it('does nothing while the column is collapsed', () => {
    const { sidebar } = fakeSidebar({ tabs: [GUIDE], expanded: false })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })

  it('does nothing without a session on screen', () => {
    const { sidebar } = fakeSidebar({ tabs: [GUIDE], session: undefined })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.tabsIn).not.toHaveBeenCalled()
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })

  it('keeps the guide when no files page is registered', () => {
    const { sidebar } = fakeSidebar({ tabs: [GUIDE] })
    replaceSoleGuide(sidebar, registry([]))
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })

  it('does nothing when the only tab is not a guide', () => {
    const { sidebar } = fakeSidebar({ tabs: [FILES] })
    replaceSoleGuide(sidebar, registry(['files']))
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })
})

function harness(sidebar: SidebarFilesFace, kinds: readonly string[] = ['files']) {
  const dependencies: (readonly string[])[] = []
  const cleanups: (() => void)[] = []
  const ctx: FilesDefaultContext = {
    inject: (deps, apply) => {
      dependencies.push(deps)
      apply({
        effect: (run) => {
          cleanups.push(run())
        },
        sidebarRight: sidebar,
        sidebarRightTabs: registry(kinds),
      })
    },
  }
  return { ctx, dependencies, cleanups }
}

describe('registerFilesDefault', () => {
  it('waits for the sidebar and its registry, then swaps a guide seeded by an expansion', async () => {
    const { sidebar, state } = fakeSidebar()
    const { ctx, dependencies } = harness(sidebar)
    registerFilesDefault(ctx)
    expect(dependencies).toEqual([['sidebarRight', 'sidebarRightTabs']])
    state.tabs = [GUIDE]
    sidebar.openTabs.emit()
    // Deferred so the swap is not dispatched from inside the store's own notification.
    expect(sidebar.openTab).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(sidebar.openTab).toHaveBeenCalledWith('files', { replaceTab: 'g1' })
  })

  it('also checks when another session comes on screen', async () => {
    const { sidebar, state } = fakeSidebar({ session: undefined, tabs: [GUIDE] })
    registerFilesDefault(harness(sidebar).ctx)
    state.session = 's2'
    sidebar.mounted.emit()
    await Promise.resolve()
    expect(sidebar.tabsIn).toHaveBeenCalledWith('s2')
    expect(sidebar.openTab).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes from both sources when the plugin unloads', () => {
    const { sidebar } = fakeSidebar()
    const { ctx, cleanups } = harness(sidebar)
    registerFilesDefault(ctx)
    expect(sidebar.openTabs.size()).toBe(1)
    expect(sidebar.mounted.size()).toBe(1)
    for (const cleanup of cleanups) cleanup()
    expect(sidebar.openTabs.size()).toBe(0)
    expect(sidebar.mounted.size()).toBe(0)
  })
})
