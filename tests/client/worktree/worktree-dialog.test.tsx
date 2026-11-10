// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateRequest, RepoInfo, WorktreeApi } from '../../../src/client/worktree/worktree-api.ts'
import { matchingBranches } from '../../../src/client/worktree/branch-picker.tsx'
import { WorktreeDialog } from '../../../src/client/worktree/worktree-dialog.tsx'
import type { CreatedWorktree } from '../../../src/client/worktree/worktree-dialog.tsx'

const INFO: RepoInfo = {
  repo: true,
  root: '/code/app',
  name: 'app',
  parent: '/code/app-worktrees',
  separator: '/',
  current: 'main',
  local: ['dev', 'main'],
  remote: ['origin/main', 'origin/release/2.0'],
}

function setup(
  options: { info?: WorktreeApi['info']; create?: WorktreeApi['create']; onCreated?: () => Promise<void> } = {},
) {
  const api = {
    info: vi.fn(options.info ?? (() => Promise.resolve(INFO))),
    create: vi.fn(
      options.create ?? ((request: CreateRequest) => Promise.resolve({ path: request.path, branch: request.branch })),
    ),
  } satisfies WorktreeApi
  const onCreated = vi.fn<(created: CreatedWorktree) => Promise<void>>(options.onCreated ?? (() => Promise.resolve()))
  const onClose = vi.fn()
  render(<WorktreeDialog api={api} onCreated={onCreated} onClose={onClose} />)
  return { api, onCreated, onClose, user: userEvent.setup() }
}

const createButton = () => screen.getByRole('button', { name: /创建 Worktree|正在创建/ })
const field = (label: string) => screen.getByLabelText(label)

afterEach(cleanup)

describe('WorktreeDialog: reading the repository', () => {
  it('says it is reading, then shows the form for the repository', async () => {
    setup()
    expect(screen.getByRole('status').textContent).toBe('正在读取仓库信息…')
    expect(await screen.findByText('基于仓库 app')).toBeTruthy()
    expect((field('基于（base）') as HTMLInputElement).value).toBe('main')
  })

  it('explains a workspace outside any repository, with only a cancel button', async () => {
    const { onClose } = setup({ info: () => Promise.resolve({ repo: false }) })
    expect((await screen.findByRole('alert')).textContent).toContain('不在 Git 仓库里')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows why the repository could not be read', async () => {
    setup({ info: () => Promise.reject(new Error('无法连接到 DSH 服务')) })
    expect((await screen.findByRole('alert')).textContent).toBe('无法连接到 DSH 服务')
  })
})

describe('WorktreeDialog: new branch', () => {
  it('creates from the form, then hands over the worktree and closes', async () => {
    const { api, onCreated, onClose, user } = setup()
    await screen.findByText('基于仓库 app')
    expect(createButton()).toHaveProperty('disabled', true)
    expect(createButton().getAttribute('title')).toBe('请填写分支名')
    await user.type(field('分支名'), 'feature/parallel-review')
    expect(field('位置').getAttribute('placeholder')).toBe('/code/app-worktrees/feature-parallel-review')
    await user.click(createButton())
    expect(api.create).toHaveBeenCalledWith({
      mode: 'new',
      branch: 'feature/parallel-review',
      base: 'main',
      path: '/code/app-worktrees/feature-parallel-review',
    })
    expect(onCreated).toHaveBeenCalledWith({
      path: '/code/app-worktrees/feature-parallel-review',
      branch: 'feature/parallel-review',
      title: 'app / feature/parallel-review',
      openSession: true,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('creates on Enter in a field, and passes the session switch through', async () => {
    const { onCreated, user } = setup()
    await screen.findByText('基于仓库 app')
    await user.click(screen.getByRole('switch'))
    await user.type(field('分支名'), 'b{Enter}')
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ branch: 'b', openSession: false }))
  })

  it('ignores Enter while the form is incomplete', async () => {
    const { api, user } = setup()
    await screen.findByText('基于仓库 app')
    await user.type(field('分支名'), '{Enter}')
    expect(api.create).not.toHaveBeenCalled()
  })

  it('keeps the dialog open with the reason when creation fails, and allows another try', async () => {
    let finish: (reason: Error) => void = () => undefined
    const create = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          finish = reject
        }),
    )
    const { onClose, user } = setup({ create })
    await screen.findByText('基于仓库 app')
    await user.type(field('分支名'), 'b')
    await user.click(createButton())
    expect(createButton().textContent).toBe('正在创建…')
    expect(field('分支名')).toHaveProperty('disabled', true)
    finish(new Error('创建 worktree 失败：already exists'))
    expect((await screen.findByRole('alert')).textContent).toBe('创建 worktree 失败：already exists')
    expect(createButton()).toHaveProperty('disabled', false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reports a workspace that stopped being a repository', async () => {
    const { user } = setup({ create: () => Promise.resolve({ repo: false }) })
    await screen.findByText('基于仓库 app')
    await user.type(field('分支名'), 'b{Enter}')
    expect((await screen.findByRole('alert')).textContent).toContain('不在 Git 仓库里')
  })

  it('shows the failure to add the workspace', async () => {
    const { user } = setup({ onCreated: () => Promise.reject(new Error('没能加入侧边栏')) })
    await screen.findByText('基于仓库 app')
    await user.type(field('分支名'), 'b{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe('没能加入侧边栏')
  })

  it('uses a typed location instead of the default', async () => {
    const { api, user } = setup()
    await screen.findByText('基于仓库 app')
    await user.type(field('分支名'), 'b')
    await user.type(field('位置'), '/elsewhere/b{Enter}')
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ path: '/elsewhere/b' }))
  })
})

describe('WorktreeDialog: other sources', () => {
  it('checks out a picked remote branch, named after it locally', async () => {
    // The host answers with the local branch it created for the remote one.
    const { api, onCreated, user } = setup({
      create: (request) => Promise.resolve({ path: request.path, branch: 'release/2.0' }),
    })
    await screen.findByText('基于仓库 app')
    await user.click(screen.getByRole('tab', { name: '已有分支' }))
    expect(screen.getByRole('tab', { name: '已有分支' }).getAttribute('aria-selected')).toBe('true')
    await user.click(field('分支'))
    await user.type(field('分支'), 'rel')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'origin/release/2.0' }))
    expect(field('位置').getAttribute('placeholder')).toBe('/code/app-worktrees/release-2.0')
    await user.click(createButton())
    expect(api.create).toHaveBeenCalledWith({
      mode: 'existing',
      branch: 'origin/release/2.0',
      path: '/code/app-worktrees/release-2.0',
    })
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ title: 'app / release/2.0' }))
  })

  it('names the branch after the pull request', async () => {
    const { api, user } = setup()
    await screen.findByText('基于仓库 app')
    await user.click(screen.getByRole('tab', { name: '从 PR 创建' }))
    await user.type(field('PR'), 'https://github.com/acme/app/pull/2066')
    expect((field('分支名') as HTMLInputElement).value).toBe('pr-2066')
    await user.click(createButton())
    expect(api.create).toHaveBeenCalledWith({
      mode: 'pr',
      pr: 'https://github.com/acme/app/pull/2066',
      branch: 'pr-2066',
      path: '/code/app-worktrees/pr-2066',
    })
  })

  it('keeps a branch name the user typed for the pull request', async () => {
    const { user } = setup()
    await screen.findByText('基于仓库 app')
    await user.click(screen.getByRole('tab', { name: '从 PR 创建' }))
    await user.type(field('分支名'), 'review')
    await user.type(field('PR'), '#5')
    expect((field('分支名') as HTMLInputElement).value).toBe('review')
  })
})

describe('BranchPicker', () => {
  it('lists every branch while the field holds one exactly, otherwise the matches', () => {
    const all = ['dev', 'main', 'origin/main']
    expect(matchingBranches(all, 'main')).toEqual(all)
    expect(matchingBranches(all, '')).toEqual(all)
    expect(matchingBranches(all, 'MA')).toEqual(['main', 'origin/main'])
    expect(
      matchingBranches(
        Array.from({ length: 150 }, (_, index) => `b${String(index)}`),
        '',
      ),
    ).toHaveLength(100)
  })

  it('picks with the arrow keys and Enter, and closes on Escape without closing the dialog', async () => {
    const { onClose, user } = setup()
    await screen.findByText('基于仓库 app')
    const base = field('基于（base）')
    await user.click(base)
    expect(base.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect((base as HTMLInputElement).value).toBe('origin/main')
    expect(base.getAttribute('aria-expanded')).toBe('false')
    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option').at(-1)?.getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{Escape}')
    expect(base.getAttribute('aria-expanded')).toBe('false')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the field loses focus, and opens when typing', async () => {
    const { user } = setup()
    await screen.findByText('基于仓库 app')
    const base = field('基于（base）')
    await user.click(base)
    await user.click(field('分支名'))
    expect(base.getAttribute('aria-expanded')).toBe('false')
    await user.type(base, 'x')
    expect(base.getAttribute('aria-expanded')).toBe('false')
    await user.clear(base)
    expect(base.getAttribute('aria-expanded')).toBe('true')
  })
})
