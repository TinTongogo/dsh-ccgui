// @vitest-environment jsdom
/// <reference lib="dom" />

import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerWorktree } from '../../../src/client/worktree/worktree-register.tsx'
import type { WorktreeServices } from '../../../src/client/worktree/worktree-register.tsx'
import type { TreeProps } from '../../../src/client/worktree/worktree-tree.tsx'
import { GIT_ROUTE_PREFIX } from '../../../src/constants.ts'

type Contribution = Parameters<WorktreeServices['contextMenus']['register']>[0]

interface Registration {
  readonly options: Readonly<Record<string, unknown>>
  readonly component: unknown
}

const TARGET = { workspaceId: 'w1', path: '/code/app', displayTitle: 'app' }
const INFO = {
  repo: true,
  root: '/code/app',
  name: 'app',
  parent: '/code/app-worktrees',
  separator: '/',
  current: 'main',
  local: ['main'],
  remote: [],
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: data }), {
    status,
  })
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
}

function fakeFetch() {
  return vi.fn((input: string, init: RequestInit) => {
    const body = bodyOf(init)
    if (input.endsWith('/worktree-info')) return Promise.resolve(json(INFO))
    return Promise.resolve(json({ path: body.path, branch: body.branch }))
  })
}

function fixedStore<T>(value: T) {
  return { subscribe: () => () => undefined, getSnapshot: () => value }
}

function harness(options: { create?: () => Promise<{ workspaceId: string }>; rename?: () => Promise<unknown> } = {}) {
  const registrations: Registration[] = []
  const contributions: Contribution[] = []
  const disposers: (() => void)[] = []
  const dependencies: (readonly string[])[] = []
  const services = {
    effect: (run: () => () => void) => {
      disposers.push(run())
    },
    slots: {
      inject: (_name: string, add: () => unknown) => add(),
      register: (opts: Readonly<Record<string, unknown>>, component: unknown) => {
        registrations.push({ options: opts, component })
        return undefined
      },
    },
    contextMenus: {
      register: (contribution: Contribution) => {
        contributions.push(contribution)
        return vi.fn()
      },
      notify: vi.fn(),
      open: vi.fn(),
    },
    workspaces: {
      list: fixedStore({ items: [] }),
      create: vi.fn(options.create ?? (() => Promise.resolve({ workspaceId: 'w2' }))),
      rename: vi.fn(options.rename ?? (() => Promise.resolve({}))),
    },
    sessions: { list: fixedStore({ byId: {} }) },
    uiWorkspace: { startSession: vi.fn(), openSession: vi.fn() },
  } satisfies WorktreeServices
  const fetchFn = fakeFetch()
  registerWorktree(
    {
      inject: (deps, apply) => {
        dependencies.push(deps)
        apply(services)
        return undefined
      },
    },
    fetchFn,
    { getItem: () => null, setItem: vi.fn() },
  )
  return { registrations, contributions, disposers, dependencies, services, fetchFn }
}

type Harness = ReturnType<typeof harness>

function mountHost(h: Harness) {
  const host = h.registrations.find(({ options }) => options.id === 'dsh-ccgui.worktree-dialog')
  if (host === undefined) throw new Error('no dialog host')
  const Component = host.component as ComponentType<Record<string, unknown>>
  const inject = host.options.inject as () => Record<string, unknown>
  return render(<Component {...inject()} wide />)
}

function openFromMenu(h: Harness): void {
  const [action] = h.contributions[0]?.resolve(TARGET) ?? []
  if (action === undefined) throw new Error('no menu action')
  act(() => {
    action.run()
  })
}

async function createBranch(name: string): Promise<void> {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('分支名'), name)
  await user.click(screen.getByRole('button', { name: '创建 Worktree' }))
}

afterEach(cleanup)

describe('registerWorktree', () => {
  it('adds a first entry to the workspace menu, with its icon and a dialog host', () => {
    const h = harness()
    expect(h.dependencies).toEqual([['contextMenus', 'workspaces', 'sessions', 'uiWorkspace', 'slots']])
    expect(h.contributions).toHaveLength(1)
    expect(h.contributions[0]).toMatchObject({ id: 'dsh-ccgui.worktree', target: 'workspace', order: 10 })
    expect(h.contributions[0]?.resolve(TARGET)).toEqual([
      expect.objectContaining({ id: 'new-worktree', label: '新建 Worktree…', icon: { key: 'dsh-ccgui.worktree' } }),
    ])
    expect(h.registrations.map(({ options }) => options.id ?? options.key)).toEqual([
      'dsh-ccgui.worktree-dialog',
      'dsh-ccgui.worktree-tree',
      'dsh-ccgui.worktree',
    ])
    const Icon = h.registrations[2]?.component as ComponentType
    expect(render(<Icon />).container.querySelector('svg')).not.toBeNull()
  })

  it('renders nothing until the menu entry is chosen, then reads the clicked workspace', async () => {
    const h = harness()
    const { container } = mountHost(h)
    expect(container.innerHTML).toBe('')
    openFromMenu(h)
    expect(await screen.findByText('基于仓库 app')).toBeTruthy()
    const [url, init] = h.fetchFn.mock.calls[0] ?? []
    expect(url).toBe(`${GIT_ROUTE_PREFIX}/worktree-info`)
    expect(bodyOf(init)).toEqual({ cwd: '/code/app' })
  })

  it('adds the worktree as a workspace titled after repository and branch, then opens a session in it', async () => {
    const h = harness()
    mountHost(h)
    openFromMenu(h)
    await createBranch('feat/a')
    await vi.waitFor(() => {
      expect(h.services.uiWorkspace.startSession).toHaveBeenCalledWith('w2')
    })
    expect(h.services.workspaces.create).toHaveBeenCalledWith({ path: '/code/app-worktrees/feat-a' })
    expect(h.services.workspaces.rename).toHaveBeenCalledWith('w2', 'app / feat/a')
    expect(h.services.contextMenus.notify).toHaveBeenCalledWith('已创建 Worktree：feat/a', true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('skips the session when switched off, and shrugs off a failed rename', async () => {
    const h = harness({ rename: () => Promise.reject(new Error('denied')) })
    mountHost(h)
    openFromMenu(h)
    await userEvent.click(await screen.findByRole('switch'))
    await createBranch('b')
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(h.services.workspaces.rename).toHaveBeenCalled()
    expect(h.services.uiWorkspace.startSession).not.toHaveBeenCalled()
  })

  it('says where the worktree is when it could not be added to the sidebar', async () => {
    const h = harness({ create: () => Promise.reject(new Error('busy')) })
    mountHost(h)
    openFromMenu(h)
    await createBranch('b')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Worktree 已创建在 /code/app-worktrees/b，但没能加入侧边栏：busy',
    )
    expect(h.services.uiWorkspace.startSession).not.toHaveBeenCalled()
  })

  it('closes the dialog on cancel and when the feature goes away', async () => {
    const h = harness()
    mountHost(h)
    openFromMenu(h)
    // Wait for the form, so the click does not land on the loading dialog it replaces.
    await screen.findByText('基于仓库 app')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    openFromMenu(h)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    act(() => {
      for (const dispose of h.disposers) dispose()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('wires the worktree groups to the harness: menus, sessions and the dialog', async () => {
    const h = harness()
    const tree = h.registrations.find(({ options }) => options.id === 'dsh-ccgui.worktree-tree')
    const props = (tree?.options.inject as () => TreeProps)()
    expect(props.workspaces).toBe(h.services.workspaces.list)
    expect(props.sessions).toBe(h.services.sessions.list)
    const entry = { workspaceId: 'w9', path: '/code/app-worktrees/x', title: 'app / x', branch: 'x', sessionIds: [] }
    props.actions.worktreeMenu(entry, { x: 1, y: 2 })
    expect(h.services.contextMenus.open).toHaveBeenCalledWith(
      { kind: 'workspace', value: { workspaceId: 'w9', path: '/code/app-worktrees/x', displayTitle: 'app / x' } },
      { x: 1, y: 2 },
    )
    props.actions.sessionMenu(
      { id: 's1', title: '修复', updatedAt: undefined, running: false, current: false },
      { x: 3, y: 4 },
    )
    expect(h.services.contextMenus.open).toHaveBeenLastCalledWith(
      { kind: 'session', value: { sessionId: 's1', displayTitle: '修复' } },
      { x: 3, y: 4 },
    )
    props.actions.openSession('s1')
    expect(h.services.uiWorkspace.openSession).toHaveBeenCalledWith('s1')
    props.actions.newSession('w9')
    expect(h.services.uiWorkspace.startSession).toHaveBeenCalledWith('w9')
    mountHost(h)
    act(() => {
      props.actions.newWorktree({ workspaceId: 'w1', path: '/code/app', title: 'app', sessionIds: [] })
    })
    expect(await screen.findByText('基于仓库 app')).toBeTruthy()
  })
})
