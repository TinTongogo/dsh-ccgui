// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesPanel } from '../../../src/client/changes/changes-panel.tsx'
import type { CwdList } from '../../../src/client/changes/changes-panel.tsx'
import type { Fetch } from '../../../src/client/changes/changes-api.ts'
import type { RepoStatus } from '../../../src/client/changes/changes-model.ts'

type Handler = (body: Record<string, unknown>) => unknown

const STATUS: RepoStatus = {
  repo: true,
  root: '/work',
  branch: 'main',
  ahead: 1,
  behind: 0,
  staged: [{ path: 'src/app/page.tsx', status: 'M', additions: 3, deletions: 10 }],
  unstaged: [{ path: 'src/lib/courses.ts', status: 'M', additions: 11, deletions: 22 }],
  untracked: [{ path: 'notes.md', status: '?', additions: 4 }],
}

/** A fake of the git routes: each operation answers from `handlers`, everything else with STATUS. */
function server(handlers: Record<string, Handler> = {}) {
  const calls: { operation: string; body: Record<string, unknown> }[] = []
  const fetchFn = vi.fn<Fetch>((url, init) => {
    const operation = url.split('/').pop() ?? ''
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as Record<string, unknown>
    calls.push({ operation, body })
    try {
      const data = (handlers[operation] ?? (() => STATUS))(body)
      return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200 }))
    } catch (error: unknown) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, error: (error as Error).message }), { status: 409 }),
      )
    }
  })
  return { fetchFn, calls, ops: () => calls.map((call) => call.operation) }
}

function list(cwd: string): CwdList {
  return { subscribe: () => () => undefined, getSnapshot: () => ({ byId: { s1: { cwd } } }) }
}

function renderPanel(fetchFn: Fetch, cwd = '/work') {
  return render(<ChangesPanel sessionId="s1" list={list(cwd)} fetch={fetchFn} />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ChangesPanel', () => {
  it('shows the header, summary and groups like CC GUI, with staged files selected', async () => {
    const { fetchFn } = server()
    renderPanel(fetchFn)
    expect(await screen.findByText('3 个未提交变更')).toBeTruthy()
    expect(screen.getByText('↑1 ↓0')).toBeTruthy()
    expect(screen.getByText('+18')).toBeTruthy()
    expect(screen.getByText('−32')).toBeTruthy()
    expect(screen.getByText('已选 1 项')).toBeTruthy()
    expect(screen.getByLabelText('分支').textContent).toContain('main')
    for (const title of ['已暂存', '未暂存', '未跟踪']) expect(screen.getByRole('region', { name: title })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('选择 src/app/page.tsx').checked).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('选择 notes.md').checked).toBe(false)
    expect(screen.getByRole('button', { name: '提交 (1)' })).toHaveProperty('disabled', true)
  })

  it('commits the selected files with the message and clears the message', async () => {
    const { fetchFn, calls } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByLabelText('选择 notes.md'))
    await user.type(screen.getByLabelText('提交信息'), 'feat: add notes')
    await user.click(screen.getByRole('button', { name: '提交 (2)' }))
    await waitFor(() => {
      expect(calls.find((call) => call.operation === 'commit')?.body).toEqual({
        message: 'feat: add notes',
        paths: ['src/app/page.tsx', 'notes.md'],
        cwd: '/work',
      })
    })
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLTextAreaElement>('提交信息').value).toBe('')
    })
  })

  it('commits with Cmd+Enter', async () => {
    const { fetchFn, ops } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.type(await screen.findByLabelText('提交信息'), 'fix: x{Meta>}{Enter}{/Meta}')
    await waitFor(() => {
      expect(ops()).toContain('commit')
    })
  })

  it('keeps the AI commit-message button visible but says it is not available yet', async () => {
    const { fetchFn } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    const ai = await screen.findByRole('button', { name: 'AI 生成提交信息' })
    expect(screen.queryByText('暂未开放，敬请期待')).toBeNull()
    await user.click(ai)
    expect(await screen.findByText('暂未开放，敬请期待')).toBeTruthy()
  })

  it('selects a whole group from its checkbox and marks a partial group', async () => {
    const { fetchFn } = server({
      status: () => ({
        ...STATUS,
        untracked: [
          { path: 'a.md', status: '?' },
          { path: 'b.md', status: '?' },
        ],
      }),
    })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    const group = await screen.findByRole('region', { name: '未跟踪' })
    await user.click(within(group).getByLabelText('选择 a.md'))
    expect(within(group).getByLabelText<HTMLInputElement>('全选本组').indeterminate).toBe(true)
    await user.click(within(group).getByLabelText('全选本组'))
    expect(screen.getByText('已选 3 项')).toBeTruthy()
  })

  it('toggles a group from its header row without its controls toggling it', async () => {
    const { fetchFn } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    const staged = await screen.findByRole('region', { name: '已暂存' })
    const rowName = /page\.tsx/

    await user.click(within(staged).getByText('已暂存'))
    expect(within(staged).queryByRole('button', { name: rowName })).toBeNull()
    expect(within(staged).getByRole('button', { name: '展开已暂存' })).toBeTruthy()

    await user.click(within(staged).getByText('已暂存'))
    expect(within(staged).getByRole('button', { name: rowName })).toBeTruthy()
    expect(within(staged).getByRole('button', { name: '折叠已暂存' })).toBeTruthy()

    await user.click(within(staged).getByLabelText('全选本组'))
    await user.click(within(staged).getByRole('button', { name: '全部取消暂存' }))
    expect(within(staged).getByRole('button', { name: rowName })).toBeTruthy()
  })

  it('stages, unstages and stages a group from the row and group controls', async () => {
    const { fetchFn, calls } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    const unstaged = await screen.findByRole('region', { name: '未暂存' })
    await user.click(within(unstaged).getByRole('button', { name: '暂存' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'stage', body: { paths: ['src/lib/courses.ts'] } })
    })
    await user.click(screen.getByRole('button', { name: '全部取消暂存' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'unstage', body: { paths: ['src/app/page.tsx'] } })
    })
    const untracked = screen.getByRole('region', { name: '未跟踪' })
    await user.click(within(untracked).getByRole('button', { name: '全部暂存' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'stage', body: { paths: ['notes.md'] } })
    })
  })

  it('asks before discarding, and deletes untracked files as untracked', async () => {
    const { fetchFn, calls, ops } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    const untracked = await screen.findByRole('region', { name: '未跟踪' })
    await user.click(within(untracked).getByRole('button', { name: '撤销更改' }))
    const dialog = screen.getByRole('dialog', { name: '撤销更改' })
    expect(dialog.textContent).toContain('确定要撤销对“notes.md”的更改吗？')
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(ops()).not.toContain('discard')

    const unstaged = screen.getByRole('region', { name: '未暂存' })
    await user.click(within(unstaged).getByRole('button', { name: '全部撤销' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确定' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({
        operation: 'discard',
        body: { tracked: ['src/lib/courses.ts'], untracked: [] },
      })
    })
    await user.click(within(screen.getByRole('region', { name: '未跟踪' })).getByRole('button', { name: '撤销更改' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确定' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'discard', body: { tracked: [], untracked: ['notes.md'] } })
    })
  })

  it('opens a file’s diff in place and goes back to the list', async () => {
    const { fetchFn, calls } = server({
      diff: () => ({ patch: '@@ -1 +1 @@\n-old\n+new\n', truncated: false }),
    })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByRole('button', { name: /courses\.ts/ }))
    expect(await screen.findByText('+new')).toBeTruthy()
    expect(screen.getByText('-old')).toBeTruthy()
    expect(screen.getByText('未暂存')).toBeTruthy()
    expect(calls.at(-1)).toMatchObject({ operation: 'diff', body: { path: 'src/lib/courses.ts', side: 'unstaged' } })
    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(await screen.findByText('3 个未提交变更')).toBeTruthy()
  })

  it('says when a diff is too large, empty, or failed', async () => {
    let answer: () => unknown = () => ({ patch: '', truncated: true })
    const { fetchFn } = server({ diff: () => answer() })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByRole('button', { name: /page\.tsx/ }))
    expect(await screen.findByText('Diff 过大，已截断')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '返回' }))
    answer = () => ({ patch: '', truncated: false })
    await user.click(await screen.findByRole('button', { name: /page\.tsx/ }))
    expect(await screen.findByText('没有可显示的差异')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '返回' }))
    answer = () => {
      throw new Error('读取差异失败：boom')
    }
    await user.click(await screen.findByRole('button', { name: /notes\.md/ }))
    expect(await screen.findByText('读取差异失败：boom')).toBeTruthy()
  })

  it('pulls, pushes and refreshes from the header', async () => {
    const { fetchFn, ops } = server()
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await screen.findByText('3 个未提交变更')
    await user.click(screen.getByRole('button', { name: '拉取' }))
    await waitFor(() => {
      expect(ops()).toContain('pull')
    })
    await user.click(screen.getByRole('button', { name: '推送' }))
    await waitFor(() => {
      expect(ops()).toContain('push')
    })
    const before = ops().filter((op) => op === 'status').length
    await user.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(ops().filter((op) => op === 'status').length).toBe(before + 1)
    })
  })

  it('shows a refused operation in a dismissible banner', async () => {
    const { fetchFn } = server({
      push: () => {
        throw new Error('推送失败：没有名为 origin 的远程仓库')
      },
    })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByRole('button', { name: '推送' }))
    expect((await screen.findByRole('alert')).textContent).toContain('没有名为 origin 的远程仓库')
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('switches to local and remote branches and creates a branch', async () => {
    const { fetchFn, calls } = server({
      branches: () => ({ current: 'main', local: ['main', 'dev'], remote: ['origin/feat'] }),
    })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByLabelText('分支'))
    await user.click(await screen.findByRole('menuitemradio', { name: 'dev' }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'checkout', body: { branch: 'dev', remote: false } })
    })
    await user.click(screen.getByLabelText('分支'))
    await user.click(await screen.findByRole('menuitemradio', { name: /origin\/feat/ }))
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'checkout', body: { branch: 'origin/feat', remote: true } })
    })
    await user.click(screen.getByLabelText('分支'))
    await user.click(await screen.findByRole('menuitemradio', { name: '新建分支…' }))
    await user.type(screen.getByLabelText('分支名称'), 'topic{Enter}')
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({ operation: 'create-branch', body: { branch: 'topic' } })
    })
  })

  it('leaves the new-branch form with 返回 or Escape', async () => {
    const { fetchFn, ops } = server({ branches: () => ({ repo: false }) })
    const user = userEvent.setup()
    renderPanel(fetchFn)
    await user.click(await screen.findByLabelText('分支'))
    await user.click(await screen.findByRole('menuitemradio', { name: '新建分支…' }))
    await user.click(screen.getByRole('button', { name: '返回' }))
    await user.click(screen.getByLabelText('分支'))
    await user.click(await screen.findByRole('menuitemradio', { name: '新建分支…' }))
    await user.type(screen.getByLabelText('分支名称'), 'x{Escape}')
    expect(screen.getByLabelText('分支')).toBeTruthy()
    expect(ops()).not.toContain('create-branch')
  })

  it('shows empty, not-a-repo, no-directory and load-failure states', async () => {
    const clean = server({ status: () => ({ ...STATUS, staged: [], unstaged: [], untracked: [] }) })
    renderPanel(clean.fetchFn)
    expect(await screen.findByText('没有变更')).toBeTruthy()
    cleanup()
    renderPanel(server({ status: () => ({ repo: false }) }).fetchFn)
    expect(await screen.findByText('当前工作区不是 Git 仓库')).toBeTruthy()
    cleanup()
    renderPanel(server().fetchFn, '')
    expect(screen.getByText('这个会话还没有工作目录')).toBeTruthy()
    cleanup()
    const failing = server({
      status: () => {
        throw new Error('读取 Git 状态失败：boom')
      },
    })
    renderPanel(failing.fetchFn)
    expect(await screen.findByText('读取 Git 状态失败：boom')).toBeTruthy()
  })

  it('refreshes on window focus and on a timer, and stops when unmounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchFn, ops } = server()
    const view = renderPanel(fetchFn)
    await screen.findByText('3 个未提交变更')
    const count = () => ops().filter((op) => op === 'status').length
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => {
      expect(count()).toBe(2)
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => {
      expect(count()).toBe(3)
    })
    view.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(count()).toBe(3)
  })

  it('skips the timer while the page is hidden and refreshes once it is visible again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const visibility = { state: 'visible' as DocumentVisibilityState }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility.state })
    try {
      const { fetchFn, ops } = server()
      renderPanel(fetchFn)
      await screen.findByText('3 个未提交变更')
      const count = () => ops().filter((op) => op === 'status').length
      visibility.state = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(45_000)
      expect(count()).toBe(1)
      visibility.state = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => {
        expect(count()).toBe(2)
      })
    } finally {
      // Drops the own property, so the prototype's getter answers again.
      Reflect.deleteProperty(document, 'visibilityState')
    }
  })
})
