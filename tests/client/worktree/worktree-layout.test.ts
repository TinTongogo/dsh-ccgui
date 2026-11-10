import { describe, expect, it } from 'vitest'
import {
  currentSessionId,
  layoutWorktrees,
  relativeTime,
  sessionRows,
} from '../../../src/client/worktree/worktree-layout.ts'
import type { Checkout, WorkspaceItem } from '../../../src/client/worktree/worktree-layout.ts'

const ws = (workspaceId: string, path: string, sessionIds: readonly string[] = []): WorkspaceItem => ({
  workspaceId,
  path,
  title: path.split('/').pop() ?? path,
  sessionIds,
})

const checkouts = (entries: Record<string, Checkout | null>): ReadonlyMap<string, Checkout | null> =>
  new Map(Object.entries(entries))

describe('layoutWorktrees', () => {
  const app = ws('app', '/code/app')
  const wtA = ws('a', '/code/app-worktrees/a', ['s1'])
  const wtB = ws('b', '/code/app-worktrees/b/')
  const other = ws('other', '/code/other')

  it('puts each worktree under the workspace of its main checkout, in workspace order', () => {
    const layout = layoutWorktrees(
      [wtB, app, other, wtA],
      checkouts({
        '/code/app': { top: '/code/app', main: '/code/app', branch: 'main' },
        '/code/app-worktrees/a': { top: '/code/app-worktrees/a', main: '/code/app', branch: 'feat/a' },
        '/code/app-worktrees/b/': { top: '/code/app-worktrees/b', main: '/code/app/', branch: 'feat/b' },
        '/code/other': null,
      }),
    )
    expect(layout.byParent.get('app')?.map((entry) => [entry.workspaceId, entry.branch])).toEqual([
      ['b', 'feat/b'],
      ['a', 'feat/a'],
    ])
    expect(layout.byParent.get('app')?.[1]).toMatchObject({ path: '/code/app-worktrees/a', sessionIds: ['s1'] })
    expect([...layout.childIds]).toEqual(['b', 'a'])
    expect(layout.byParent.has('other')).toBe(false)
  })

  it('leaves a worktree at the top level when its repository is not a workspace', () => {
    const layout = layoutWorktrees(
      [wtA],
      checkouts({ '/code/app-worktrees/a': { top: '/code/app-worktrees/a', main: '/code/app', branch: 'x' } }),
    )
    expect(layout.byParent.size).toBe(0)
    expect(layout.childIds.size).toBe(0)
  })

  it('treats Windows separators as the same path', () => {
    const layout = layoutWorktrees(
      [ws('app', 'C:\\code\\app'), ws('a', 'C:\\code\\app-worktrees\\a')],
      checkouts({
        'C:\\code\\app-worktrees\\a': { top: 'C:\\code\\app-worktrees\\a', main: 'C:/code/app', branch: 'x' },
      }),
    )
    expect(layout.byParent.get('app')).toHaveLength(1)
  })

  it('ignores workspaces it has not looked up yet', () => {
    expect(layoutWorktrees([app, wtA], checkouts({})).childIds.size).toBe(0)
  })
})

describe('sessionRows', () => {
  const entry = { workspaceId: 'a', path: '/p', title: 'a', branch: 'x', sessionIds: ['s1', 's2', 's3', 's4', 'gone'] }

  it('lists visible sessions in workspace order, marking the current and running ones', () => {
    const byId = {
      s1: { title: '  修复登录  ', updatedAt: '2026-11-09T10:00:00Z', running: true },
      s2: { blank: true },
      s3: { title: '', updatedAt: 1_000, retainedBy: { mainView: 1 } },
      s4: { title: '已归档' },
    }
    expect(sessionRows(entry, byId, new Set(['s4']))).toEqual([
      { id: 's1', title: '修复登录', updatedAt: Date.parse('2026-11-09T10:00:00Z'), running: true, current: false },
      { id: 's3', title: '新会话', updatedAt: 1_000, running: false, current: true },
    ])
  })

  it('keeps the blank session that is open, which is where a new session starts', () => {
    const rows = sessionRows(entry, { s2: { blank: true, retainedBy: { mainView: 1 } } }, new Set())
    expect(rows).toEqual([{ id: 's2', title: '新会话', updatedAt: undefined, running: false, current: true }])
  })
})

describe('currentSessionId', () => {
  it('finds the session shown in the main view', () => {
    expect(currentSessionId({ a: {}, b: { retainedBy: { mainView: 2 } }, c: undefined })).toBe('b')
    expect(currentSessionId({ a: { retainedBy: { mainView: 0 } } })).toBeUndefined()
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')

  it('says how long ago, in the coarsest whole unit', () => {
    expect(relativeTime(now - 20_000, now)).toBe('刚刚')
    expect(relativeTime(now - 33 * 60_000, now)).toBe('33分钟')
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe('5小时')
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3天')
  })

  it('says nothing without a time', () => {
    expect(relativeTime(undefined, now)).toBe('')
    expect(relativeTime(Number.NaN, now)).toBe('')
  })
})
