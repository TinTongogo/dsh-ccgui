import { describe, expect, it } from 'vitest'
import type { RepoInfo } from '../../../src/client/worktree/worktree-api.ts'
import {
  branchOf,
  defaultPath,
  formProblem,
  initialForm,
  prNumber,
  requestOf,
  withPr,
  workspaceTitle,
} from '../../../src/client/worktree/worktree-form.ts'
import type { WorktreeForm } from '../../../src/client/worktree/worktree-form.ts'

const INFO: RepoInfo = {
  repo: true,
  root: '/code/app',
  name: 'app',
  parent: '/code/app-worktrees',
  separator: '/',
  current: 'dev',
  local: ['dev', 'main'],
  remote: ['origin/main', 'origin/feature/x'],
}

const form = (patch: Partial<WorktreeForm> = {}): WorktreeForm => ({ ...initialForm(INFO), ...patch })

describe('initialForm', () => {
  it('starts on a new branch from the current branch, opening a session afterwards', () => {
    expect(initialForm(INFO)).toEqual({
      mode: 'new',
      branch: '',
      base: 'dev',
      existing: '',
      pr: '',
      prBranch: '',
      prBranchEdited: false,
      path: '',
      openSession: true,
    })
  })

  it('falls back to the first local branch on a detached HEAD', () => {
    expect(initialForm({ ...INFO, current: undefined }).base).toBe('dev')
    expect(initialForm({ ...INFO, current: undefined, local: [] }).base).toBe('')
  })
})

describe('branchOf', () => {
  it('names the branch the worktree will have checked out', () => {
    expect(branchOf(form({ branch: ' feature/a ' }), INFO)).toBe('feature/a')
    expect(branchOf(form({ mode: 'existing', existing: 'main' }), INFO)).toBe('main')
    expect(branchOf(form({ mode: 'existing', existing: 'origin/feature/x' }), INFO)).toBe('feature/x')
    expect(branchOf(form({ mode: 'pr', prBranch: 'pr-3' }), INFO)).toBe('pr-3')
  })
})

describe('defaultPath', () => {
  it('puts the worktree in <repo>-worktrees, one folder per branch', () => {
    expect(defaultPath(INFO, 'feature/parallel-review')).toBe('/code/app-worktrees/feature-parallel-review')
    expect(defaultPath({ ...INFO, parent: 'C:\\code\\app-worktrees', separator: '\\' }, 'a/b')).toBe(
      'C:\\code\\app-worktrees\\a-b',
    )
  })

  it('keeps folder names to characters every file system takes', () => {
    expect(defaultPath(INFO, 'fix: a "b"?')).toBe('/code/app-worktrees/fix-a-b')
    expect(defaultPath(INFO, '')).toBe('')
    expect(defaultPath(INFO, '///')).toBe('')
  })
})

describe('prNumber and withPr', () => {
  it('reads a number, #number or a pull request link', () => {
    expect(prNumber('42')).toBe(42)
    expect(prNumber('#42')).toBe(42)
    expect(prNumber('https://github.com/a/b/pull/42/files')).toBe(42)
    expect(prNumber('abc')).toBeUndefined()
    expect(prNumber('0')).toBeUndefined()
  })

  it('names the branch after the pull request until the user edits it', () => {
    const typed = withPr(form({ mode: 'pr' }), '#12')
    expect(typed).toMatchObject({ pr: '#12', prBranch: 'pr-12' })
    expect(withPr(typed, '').prBranch).toBe('')
    const edited = { ...typed, prBranch: 'review', prBranchEdited: true }
    expect(withPr(edited, '#13').prBranch).toBe('review')
  })
})

describe('formProblem', () => {
  it('names the first missing field', () => {
    expect(formProblem(form(), INFO)).toBe('请填写分支名')
    expect(formProblem(form({ branch: 'a', base: ' ' }), INFO)).toBe('请选择基准分支')
    expect(formProblem(form({ mode: 'existing' }), INFO)).toBe('请选择分支')
    expect(formProblem(form({ mode: 'pr' }), INFO)).toBe('请填写 PR 编号或链接')
    expect(formProblem(form({ mode: 'pr', pr: '1' }), INFO)).toBe('请填写分支名')
    expect(formProblem(form({ branch: '///' }), INFO)).toBe('请填写位置')
  })

  it('accepts a complete form', () => {
    expect(formProblem(form({ branch: 'a' }), INFO)).toBeUndefined()
    expect(formProblem(form({ mode: 'existing', existing: 'main' }), INFO)).toBeUndefined()
    expect(formProblem(withPr(form({ mode: 'pr' }), '9'), INFO)).toBeUndefined()
  })
})

describe('requestOf', () => {
  it('sends only what the mode needs, with the default location when none is typed', () => {
    expect(requestOf(form({ branch: 'feat/a' }), INFO)).toEqual({
      mode: 'new',
      branch: 'feat/a',
      base: 'dev',
      path: '/code/app-worktrees/feat-a',
    })
    expect(requestOf(form({ mode: 'existing', existing: 'origin/feature/x', path: ' /tmp/x ' }), INFO)).toEqual({
      mode: 'existing',
      branch: 'origin/feature/x',
      path: '/tmp/x',
    })
    expect(requestOf(withPr(form({ mode: 'pr' }), ' #7 '), INFO)).toEqual({
      mode: 'pr',
      pr: '#7',
      branch: 'pr-7',
      path: '/code/app-worktrees/pr-7',
    })
  })
})

describe('workspaceTitle', () => {
  it('names the repository and the branch, so the worktree reads as part of its repository', () => {
    expect(workspaceTitle(INFO, 'feature/a')).toBe('app / feature/a')
  })
})
