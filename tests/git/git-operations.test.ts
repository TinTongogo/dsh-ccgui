import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GIT_OPERATIONS,
  GitRequestError,
  asBody,
  operationOf,
  runOperation,
  statusFor,
} from '../../src/git/git-requests.ts'
import type { GitOperation } from '../../src/git/git-requests.ts'
import { GitError } from '../../src/git/git-run.ts'
import type { RepoStatus } from '../../src/git/git-read.ts'
import { collectingSpawn } from '../fixtures/collecting-subprocess.ts'

let scratch = ''
let repo = ''

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' })
const write = (name: string, text: string): void => {
  writeFileSync(join(repo, name), text)
}
const run = (operation: GitOperation, body: Record<string, unknown> = {}): Promise<unknown> =>
  runOperation(collectingSpawn, operation, { cwd: repo, ...body })
const status = async (operation: GitOperation = 'status', body: Record<string, unknown> = {}): Promise<RepoStatus> =>
  (await run(operation, body)) as RepoStatus

function initRepo(dir: string): void {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'ccgui-git-'))
  repo = join(scratch, 'repo')
  execFileSync('mkdir', ['-p', repo])
  initRepo(repo)
  write('a.txt', 'one\ntwo\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('status', () => {
  it('answers repo: false outside a repository', async () => {
    // The system temp directory is not inside any repository.
    expect(await runOperation(collectingSpawn, 'status', { cwd: tmpdir() })).toEqual({ repo: false })
  })

  it('lists the three groups with line counts and the branch', async () => {
    write('a.txt', 'one\nTWO\nthree\n')
    write('b.txt', 'new\n')
    git(repo, 'add', 'b.txt')
    write('c.txt', 'x\ny\n')
    const result = await status()
    expect(result).toMatchObject({ repo: true, branch: 'main' })
    expect(result.root).toContain('repo')
    expect(result.staged).toEqual([{ path: 'b.txt', status: 'A', additions: 1, deletions: 0 }])
    expect(result.unstaged).toEqual([{ path: 'a.txt', status: 'M', additions: 2, deletions: 1 }])
    expect(result.untracked).toEqual([{ path: 'c.txt', status: '?', additions: 2, deletions: 0 }])
  })
})

describe('writes', () => {
  it('stages and unstages files, deletions included', async () => {
    rmSync(join(repo, 'a.txt'))
    write('n.txt', 'n\n')
    const staged = await status('stage', { paths: ['a.txt', 'n.txt'] })
    expect(staged.staged.map((entry) => `${entry.status} ${entry.path}`)).toEqual(['D a.txt', 'A n.txt'])
    const unstaged = await status('unstage', { paths: ['a.txt', 'n.txt'] })
    expect(unstaged.staged).toEqual([])
    expect(unstaged.untracked.map((entry) => entry.path)).toEqual(['n.txt'])
  })

  it('unstages before the first commit', async () => {
    const fresh = join(scratch, 'fresh')
    execFileSync('mkdir', ['-p', fresh])
    initRepo(fresh)
    writeFileSync(join(fresh, 'f.txt'), 'f\n')
    git(fresh, 'add', 'f.txt')
    const result = (await runOperation(collectingSpawn, 'unstage', { cwd: fresh, paths: ['f.txt'] })) as RepoStatus
    expect(result.staged).toEqual([])
    expect(result.untracked.map((entry) => entry.path)).toEqual(['f.txt'])
  })

  it('discards tracked changes and deletes untracked files', async () => {
    write('a.txt', 'changed\n')
    write('junk.txt', 'junk\n')
    const result = await status('discard', { tracked: ['a.txt'], untracked: ['junk.txt'] })
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('one\ntwo\n')
    expect(existsSync(join(repo, 'junk.txt'))).toBe(false)
    expect([...result.unstaged, ...result.untracked]).toEqual([])
  })

  it('commits only the selected files and leaves other staged files staged', async () => {
    write('a.txt', 'changed\n')
    write('new.txt', 'new\n')
    write('keep.txt', 'keep\n')
    git(repo, 'add', 'keep.txt')
    const result = await status('commit', { message: 'feat: pick two', paths: ['a.txt', 'new.txt'] })
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('feat: pick two\n')
    expect(git(repo, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n')).toEqual(['a.txt', 'new.txt'])
    expect(result.staged.map((entry) => entry.path)).toEqual(['keep.txt'])
  })

  it('refuses a commit without a message or files', async () => {
    await expect(run('commit', { message: '   ', paths: ['a.txt'] })).rejects.toThrow('请填写提交信息')
    await expect(run('commit', { message: 'x', paths: [] })).rejects.toThrow('请选择要提交的文件')
  })

  it('reports git refusals as GitError with git’s reason', async () => {
    const error: unknown = await run('stage', { paths: ['missing.txt'] }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GitError)
    expect(String(error)).toContain('暂存失败：')
    expect(statusFor(error)).toBe(409)
  })
})

describe('branches', () => {
  it('creates, lists and switches branches, refusing invalid names', async () => {
    await status('create-branch', { branch: 'feature/x' })
    expect(await run('branches')).toEqual({ current: 'feature/x', local: ['feature/x', 'main'], remote: [] })
    expect((await status('checkout', { branch: 'main' })).branch).toBe('main')
    await expect(run('create-branch', { branch: '-bad' })).rejects.toThrow('分支名称无效')
    await expect(run('create-branch', { branch: 'a..b' })).rejects.toThrow('分支名称无效')
  })
})

describe('remote', () => {
  let remote = ''
  let other = ''

  beforeEach(() => {
    remote = join(scratch, 'remote.git')
    git(scratch, 'init', '-q', '--bare', '-b', 'main', remote)
    git(repo, 'remote', 'add', 'origin', remote)
  })

  it('pushes a branch without upstream to origin and tracks it, then pushes and pulls', async () => {
    expect((await status('push')).ahead).toBe(0)
    write('a.txt', 'local\n')
    git(repo, 'commit', '-qam', 'local')
    expect((await status()).ahead).toBe(1)
    expect((await status('push')).ahead).toBe(0)

    other = join(scratch, 'other')
    git(scratch, 'clone', '-q', remote, other)
    git(other, 'config', 'user.name', 'Other')
    git(other, 'config', 'user.email', 'o@example.com')
    writeFileSync(join(other, 'a.txt'), 'remote\n')
    git(other, 'commit', '-qam', 'remote')
    git(other, 'push', '-q')
    await status('pull')
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('remote\n')
  })

  it('checks out a remote branch as a local tracking branch', async () => {
    await status('push')
    git(repo, 'push', '-q', 'origin', 'main:topic')
    git(repo, 'fetch', '-q')
    expect(((await run('branches')) as { remote: string[] }).remote).toEqual(['origin/main', 'origin/topic'])
    expect((await status('checkout', { branch: 'origin/topic', remote: true })).branch).toBe('topic')
    expect(git(repo, 'rev-parse', '--abbrev-ref', '@{upstream}').trim()).toBe('origin/topic')
  })

  it('refuses to push without an origin', async () => {
    git(repo, 'remote', 'remove', 'origin')
    await expect(run('push')).rejects.toThrow('没有名为 origin 的远程仓库')
  })
})

describe('diff', () => {
  it('reads the patch of each side', async () => {
    write('a.txt', 'one\nTWO\n')
    write('u.txt', 'u\n')
    const unstaged = (await run('diff', { path: 'a.txt', side: 'unstaged' })) as { patch: string }
    expect(unstaged.patch).toContain('+TWO')
    git(repo, 'add', 'a.txt')
    const staged = (await run('diff', { path: 'a.txt', side: 'staged' })) as { patch: string }
    expect(staged.patch).toContain('-two')
    const untracked = (await run('diff', { path: 'u.txt', side: 'untracked' })) as { patch: string; truncated: boolean }
    expect(untracked).toEqual({ patch: expect.stringContaining('+u') as string, truncated: false })
  })

  it('reads a staged rename against its old path', async () => {
    git(repo, 'mv', 'a.txt', 'b.txt')
    const result = (await run('diff', { path: 'b.txt', origPath: 'a.txt', side: 'staged' })) as { patch: string }
    expect(result.patch).toContain('rename from a.txt')
  })

  it('reports a failing diff', async () => {
    // Unreadable but listed, so it passes the untracked check and git itself fails on it.
    write('locked.txt', 'x\n')
    chmodSync(join(repo, 'locked.txt'), 0o000)
    await expect(run('diff', { path: 'locked.txt', side: 'untracked' })).rejects.toThrow('读取差异失败')
  })
})

describe('request validation', () => {
  it.each([
    ['a relative directory', { cwd: 'repo' }, '工作目录必须是绝对路径'],
    ['a missing directory', { cwd: undefined }, '缺少或无效的参数：cwd'],
    ['a path escaping the repo', { paths: ['../outside'] }, '文件路径无效'],
    ['an absolute path', { paths: ['/etc/passwd'] }, '文件路径无效'],
    ['a non-array paths', { paths: 'a.txt' }, '缺少或无效的参数：paths'],
  ])('rejects %s', async (_label, body, message) => {
    const error: unknown = await runOperation(collectingSpawn, 'stage', { cwd: repo, ...body }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(GitRequestError)
    expect(String(error)).toContain(message)
    expect(statusFor(error)).toBe(400)
  })

  it('rejects a bad diff side and a non-object body', async () => {
    await expect(run('diff', { path: 'a.txt', side: 'both' })).rejects.toThrow('缺少或无效的参数：side')
    expect(() => asBody([])).toThrow('请求格式无效')
    expect(() => asBody(null)).toThrow('请求格式无效')
  })

  it('knows its operations', () => {
    expect(GIT_OPERATIONS.every((operation) => operationOf(operation) === operation)).toBe(true)
    expect(operationOf('rm')).toBeUndefined()
    expect(statusFor(new Error('x'))).toBe(500)
  })
})
