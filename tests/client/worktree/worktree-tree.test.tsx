// @vitest-environment jsdom
/// <reference lib="dom" />

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANCHOR_ATTRIBUTE, hiddenGroupRules } from '../../../src/client/worktree/worktree-anchors.ts'
import { createCheckouts } from '../../../src/client/worktree/worktree-checkouts.ts'
import { createExpansion, EXPANSION_STORAGE_KEY } from '../../../src/client/worktree/worktree-expansion.ts'
import { WorktreeTree } from '../../../src/client/worktree/worktree-tree.tsx'
import type { SessionsSnapshot, TreeProps, WorkspacesSnapshot } from '../../../src/client/worktree/worktree-tree.tsx'

const MAIN = '/code/app'
const CHECKOUTS: Record<string, unknown> = {
  '/code/app': { repo: true, top: MAIN, main: MAIN, branch: 'main' },
  '/code/app-worktrees/a': { repo: true, top: '/code/app-worktrees/a', main: MAIN, branch: 'feat/a' },
  '/code/other': { repo: false },
}

function store<T>(initial: T) {
  let value = initial
  let listeners: (() => void)[] = []
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    set: (next: T) => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

function fakeFetch() {
  return vi.fn((_input: string, init: RequestInit) => {
    const { cwd } = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { cwd: string }
    const data = CHECKOUTS[cwd]
    if (data === undefined) return Promise.reject(new Error('offline'))
    return Promise.resolve(new Response(JSON.stringify({ success: true, data })))
  })
}

/** The harness's sidebar markup, as far as the tree relies on it. */
function sidebar(): HTMLElement {
  document.body.innerHTML = `
    <div role="tree">
      <div data-testid="app"><span><div data-row-key="workspace:app" aria-expanded="true">app</div></span>
        <span><div data-row-key="session:s0">s0</div></span></div>
      <div data-testid="a"><span><div data-row-key="workspace:a" aria-expanded="true">a</div></span></div>
      <div data-testid="other"><span><div data-row-key="workspace:other" aria-expanded="true">other</div></span></div>
    </div>`
  const host = document.createElement('div')
  document.body.append(host)
  return host
}

const ITEMS = [
  { workspaceId: 'app', path: MAIN, title: 'app', sessionIds: ['s0'] },
  { workspaceId: 'a', path: '/code/app-worktrees/a', title: 'app / feat/a', sessionIds: ['s1', 's2'] },
  { workspaceId: 'other', path: '/code/other', title: 'other', sessionIds: [] },
]

function setup(options: { sessions?: SessionsSnapshot['byId']; stored?: string } = {}) {
  const host = sidebar()
  const fetchFn = fakeFetch()
  const storage = { getItem: () => options.stored ?? null, setItem: vi.fn() }
  const workspaces = store<WorkspacesSnapshot>({ items: ITEMS, archivedSessionIds: ['s2'] })
  const sessions = store<SessionsSnapshot>({
    byId: options.sessions ?? { s1: { title: '修复登录', updatedAt: Date.now() - 5 * 60_000 }, s2: { title: '旧的' } },
  })
  const actions = {
    newWorktree: vi.fn(),
    newSession: vi.fn(),
    openSession: vi.fn(),
    worktreeMenu: vi.fn(),
    sessionMenu: vi.fn(),
  } satisfies TreeProps['actions']
  const props: TreeProps = {
    doc: document,
    workspaces,
    sessions,
    checkouts: createCheckouts(fetchFn),
    expansion: createExpansion(storage),
    actions,
  }
  const view = render(<WorktreeTree {...props} />, { container: host })
  return { ...view, fetchFn, storage, workspaces, sessions, actions }
}

const section = (id: string) => screen.getByTestId(id)
const group = () => within(section('app'))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('WorktreeTree: placement', () => {
  it('nests a worktree under its repository and takes it out of the top level', async () => {
    const { fetchFn } = setup()
    expect(await group().findByRole('button', { name: 'Worktrees · 1' })).toBeTruthy()
    expect(section('app').lastElementChild?.getAttribute(ANCHOR_ATTRIBUTE)).toBe('app')
    expect(section('other').querySelector(`[${ANCHOR_ATTRIBUTE}]`)).toBeNull()
    expect(document.head.textContent).toBe(hiddenGroupRules(new Set(['a'])))
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('stays the last child when the sidebar appends rows after it', async () => {
    setup()
    await group().findByRole('button', { name: 'Worktrees · 1' })
    const row = document.createElement('span')
    section('app').append(row)
    await waitFor(() => {
      expect(section('app').lastElementChild?.getAttribute(ANCHOR_ATTRIBUTE)).toBe('app')
    })
  })

  it('follows the section when the sidebar replaces it, and cleans up when unmounted', async () => {
    const { unmount } = setup()
    await group().findByRole('button', { name: 'Worktrees · 1' })
    const replacement = section('app').cloneNode(false) as HTMLElement
    replacement.innerHTML = '<span><div data-row-key="workspace:app" aria-expanded="true">app</div></span>'
    section('app').replaceWith(replacement)
    await waitFor(() => {
      expect(replacement.lastElementChild?.getAttribute(ANCHOR_ATTRIBUTE)).toBe('app')
    })
    expect(within(replacement).getByRole('button', { name: 'Worktrees · 1' })).toBeTruthy()
    replacement.remove()
    await waitFor(() => {
      expect(document.querySelector(`[${ANCHOR_ATTRIBUTE}]`)).toBeNull()
    })
    unmount()
    expect(document.querySelector(`[${ANCHOR_ATTRIBUTE}]`)).toBeNull()
    expect(document.head.textContent).toBe('')
  })

  it('escapes quotes in ids it puts into selectors', () => {
    expect(hiddenGroupRules(new Set(['x"y']))).toContain('workspace:x\\"y')
  })
})

describe('WorktreeTree: rows', () => {
  it('opens the group and a worktree to list its visible sessions, and remembers it', async () => {
    const { storage, fetchFn } = setup()
    fireEvent.click(await group().findByRole('button', { name: 'Worktrees · 1' }))
    expect(fetchFn.mock.calls.length).toBeGreaterThan(3)
    const worktree = group().getByRole('treeitem', { name: /feat\/a/ })
    expect(worktree.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(worktree)
    expect(group().getByRole('treeitem', { name: /修复登录/ }).textContent).toContain('5分钟')
    expect(group().queryByText('旧的')).toBeNull()
    expect(storage.setItem).toHaveBeenLastCalledWith(
      EXPANSION_STORAGE_KEY,
      JSON.stringify({ groups: { app: true }, worktrees: { a: true } }),
    )
  })

  it('hands clicks, keys and right-clicks to the harness', async () => {
    const { actions } = setup({ stored: JSON.stringify({ groups: { app: true }, worktrees: { a: true } }) })
    const session = await group().findByRole('treeitem', { name: /修复登录/ })
    fireEvent.click(session)
    fireEvent.keyDown(session, { key: 'Enter' })
    expect(actions.openSession).toHaveBeenCalledTimes(2)
    fireEvent.contextMenu(session, { clientX: 5, clientY: 6 })
    expect(actions.sessionMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), { x: 5, y: 6 })
    const worktree = group().getByRole('treeitem', { name: /feat\/a/ })
    fireEvent.contextMenu(worktree, { clientX: 7, clientY: 8 })
    expect(actions.worktreeMenu).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'a' }), { x: 7, y: 8 })
    fireEvent.click(group().getByRole('button', { name: '在“feat/a”中新建会话' }))
    expect(actions.newSession).toHaveBeenCalledWith('a')
    expect(worktree.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(group().getByRole('button', { name: '新建 Worktree' }))
    expect(actions.newWorktree).toHaveBeenCalledWith(ITEMS[0])
    fireEvent.keyDown(worktree, { key: ' ' })
    expect(worktree.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(worktree, { key: 'a' })
    expect(worktree.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens itself onto the session on screen, until the user closes it', async () => {
    setup({ sessions: { s1: { title: '进行中', running: true, retainedBy: { mainView: 1 } } } })
    const session = await group().findByRole('treeitem', { name: /进行中/ })
    expect(session.getAttribute('aria-selected')).toBe('true')
    expect(session.querySelector('[data-state-dot]')).not.toBeNull()
    fireEvent.click(group().getByRole('button', { name: 'Worktrees · 1' }))
    expect(group().queryByRole('treeitem')).toBeNull()
  })

  it('says when a worktree has no sessions', async () => {
    setup({ sessions: {}, stored: JSON.stringify({ groups: { app: true }, worktrees: { a: true } }) })
    expect(await group().findByText('暂无会话')).toBeTruthy()
  })

  it('updates relative times by the minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    setup({ stored: JSON.stringify({ groups: { app: true }, worktrees: { a: true } }) })
    const session = await group().findByRole('treeitem', { name: /修复登录/ })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(session.textContent).toContain('6分钟')
  })
})

describe('WorktreeTree: lookups', () => {
  it('asks about new workspaces only, and treats an unreadable one as no repository', async () => {
    const { fetchFn, workspaces } = setup()
    await group().findByRole('button', { name: 'Worktrees · 1' })
    act(() => {
      workspaces.set({ items: [...ITEMS, { workspaceId: 'gone', path: '/code/gone', title: 'gone', sessionIds: [] }] })
    })
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(4)
    })
    act(() => {
      workspaces.set({ items: [...ITEMS] })
    })
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('renders nothing before the workspace list is ready', () => {
    const host = sidebar()
    const props: TreeProps = {
      doc: document,
      workspaces: store<WorkspacesSnapshot>({}),
      sessions: store<SessionsSnapshot>({ byId: {} }),
      checkouts: createCheckouts(fakeFetch()),
      expansion: createExpansion({ getItem: () => null, setItem: vi.fn() }),
      actions: {
        newWorktree: vi.fn(),
        newSession: vi.fn(),
        openSession: vi.fn(),
        worktreeMenu: vi.fn(),
        sessionMenu: vi.fn(),
      },
    }
    render(<WorktreeTree {...props} />, { container: host })
    expect(document.querySelector(`[${ANCHOR_ATTRIBUTE}]`)).toBeNull()
  })
})
