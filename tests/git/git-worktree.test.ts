import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitRequestError, runOperation } from '../../src/git/git-requests.ts'
import { parsePrInput } from '../../src/git/git-worktree.ts'
import { GitError } from '../../src/git/git-run.ts'
import { collectingSpawn } from '../fixtures/collecting-subprocess.ts'

let scratch = ''
let repo = ''
let origin = ''

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function initRepo(dir: string): void {
  git(dir, 'init', '-q', '-b', 'main')
  identify(dir)
}

function identify(dir: string): void {
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

function commitFile(dir: string, name: string, text: string): string {
  writeFileSync(join(dir, name), text)
  git(dir, 'add', name)
  git(dir, 'commit', '-q', '-m', name)
  return git(dir, 'rev-parse', 'HEAD')
}

const info = (cwd = repo) => runOperation(collectingSpawn, 'worktree-info', { cwd })
const add = (body: Record<string, unknown>, cwd = repo) =>
  runOperation(collectingSpawn, 'worktree-add', { cwd, ...body }) as Promise<{ path: string; branch: string }>
const headOf = (dir: string): string => git(dir, 'rev-parse', 'HEAD')
const branchOf = (dir: string): string => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')

beforeEach(() => {
  // realpath: macOS hands out /var/... temp paths that git reports as /private/var/...
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'ccgui-wt-')))
  repo = join(scratch, 'app')
  origin = join(scratch, 'origin.git')
  mkdirSync(repo)
  initRepo(repo)
  commitFile(repo, 'a.txt', 'one\n')
  git(scratch, 'init', '-q', '--bare', '-b', 'main', origin)
  git(repo, 'remote', 'add', 'origin', origin)
  git(repo, 'push', '-q', 'origin', 'main')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('worktree-info', () => {
  it('names the repository, the default parent and the branches', async () => {
    git(repo, 'branch', 'dev')
    git(repo, 'fetch', '-q', 'origin')
    expect(await info()).toEqual({
      repo: true,
      root: repo,
      name: 'app',
      parent: join(scratch, 'app-worktrees'),
      separator: sep,
      current: 'main',
      local: ['dev', 'main'],
      remote: ['origin/main'],
    })
  })

  it('answers for the main checkout when asked from inside a worktree', async () => {
    const created = await add({ mode: 'new', branch: 'feat/x', base: 'main', path: join(scratch, 'wt') })
    expect(await info(created.path)).toMatchObject({ root: repo, name: 'app', current: 'feat/x' })
  })

  it('answers repo: false outside a repository', async () => {
    const plain = join(scratch, 'plain')
    mkdirSync(plain)
    expect(await info(plain)).toEqual({ repo: false })
  })
})

describe('worktree-of', () => {
  const of = (cwd: string) => runOperation(collectingSpawn, 'worktree-of', { cwd })

  it('names the main checkout and the branch of a worktree', async () => {
    const created = await add({ mode: 'new', branch: 'feat/x', base: 'main', path: join(scratch, 'wt') })
    expect(await of(created.path)).toEqual({ repo: true, top: created.path, main: repo, branch: 'feat/x' })
  })

  it('names the main checkout as its own main', async () => {
    expect(await of(repo)).toEqual({ repo: true, top: repo, main: repo, branch: 'main' })
  })

  it('answers from a subdirectory with the checkout it is in', async () => {
    const sub = join(repo, 'src')
    mkdirSync(sub)
    expect(await of(sub)).toMatchObject({ top: repo, main: repo })
  })

  it('names a detached HEAD by its short commit', async () => {
    const path = join(scratch, 'detached')
    git(repo, 'worktree', 'add', '-q', '--detach', path, 'HEAD')
    const answer = (await of(path)) as { branch: string }
    expect(answer.branch).toBe(git(repo, 'rev-parse', '--short', 'HEAD'))
  })

  it('answers repo: false outside a repository', async () => {
    const plain = join(scratch, 'plain')
    mkdirSync(plain)
    expect(await of(plain)).toEqual({ repo: false })
  })
})

describe('worktree-add: new branch', () => {
  it('creates the branch from the base without tracking it', async () => {
    const path = join(scratch, 'app-worktrees', 'feature-a')
    const result = await add({ mode: 'new', branch: 'feature/a', base: 'main', path })
    expect(result).toEqual({ path, branch: 'feature/a' })
    expect(branchOf(path)).toBe('feature/a')
    expect(headOf(path)).toBe(headOf(repo))
    // Tracking origin/main would make a later plain `git push` aim at main.
    expect(() => git(path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toThrow()
  })

  it('fetches a remote base first, so the worktree starts from its latest commit', async () => {
    const other = join(scratch, 'other')
    git(scratch, 'clone', '-q', origin, other)
    identify(other)
    git(other, 'checkout', '-q', '-b', 'release')
    const tip = commitFile(other, 'r.txt', 'r\n')
    git(other, 'push', '-q', 'origin', 'release')
    const path = join(scratch, 'wt-release')
    await add({ mode: 'new', branch: 'hotfix', base: 'origin/release', path })
    expect(headOf(path)).toBe(tip)
  })

  it('refuses a branch that already exists', async () => {
    git(repo, 'branch', 'taken')
    await expect(add({ mode: 'new', branch: 'taken', base: 'main', path: join(scratch, 'x') })).rejects.toThrow(
      '分支已存在：taken',
    )
  })

  it('refuses invalid branch names and bases', async () => {
    const path = join(scratch, 'x')
    await expect(add({ mode: 'new', branch: 'bad..name', base: 'main', path })).rejects.toThrow('分支名称无效')
    await expect(add({ mode: 'new', branch: '-x', base: 'main', path })).rejects.toThrow('分支名称无效')
    await expect(add({ mode: 'new', branch: 'ok', base: '--orphan', path })).rejects.toThrow('基准分支无效')
    await expect(add({ mode: 'new', branch: 'ok', base: 'nope', path })).rejects.toThrow('基准分支无效')
    expect(existsSync(path)).toBe(false)
  })

  it('reports git refusing a directory that is not empty', async () => {
    const path = join(scratch, 'busy')
    mkdirSync(path)
    writeFileSync(join(path, 'f'), 'x')
    await expect(add({ mode: 'new', branch: 'b', base: 'main', path })).rejects.toBeInstanceOf(GitError)
  })
})

describe('worktree-add: existing branch', () => {
  it('checks out a local branch', async () => {
    git(repo, 'branch', 'dev')
    const path = join(scratch, 'wt-dev')
    expect(await add({ mode: 'existing', branch: 'dev', path })).toEqual({ path, branch: 'dev' })
    expect(branchOf(path)).toBe('dev')
  })

  it('checks out a remote branch as a local branch that tracks it', async () => {
    git(repo, 'push', '-q', 'origin', 'main:topic')
    git(repo, 'fetch', '-q', 'origin')
    const path = join(scratch, 'wt-topic')
    expect(await add({ mode: 'existing', branch: 'origin/topic', path })).toEqual({ path, branch: 'topic' })
    expect(git(path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/topic')
  })

  it('reuses the local branch of a remote branch when there is one', async () => {
    git(repo, 'branch', 'topic')
    git(repo, 'push', '-q', 'origin', 'topic')
    git(repo, 'fetch', '-q', 'origin')
    const path = join(scratch, 'wt-topic')
    expect(await add({ mode: 'existing', branch: 'origin/topic', path })).toEqual({ path, branch: 'topic' })
  })

  it('refuses a branch that does not exist', async () => {
    await expect(add({ mode: 'existing', branch: 'ghost', path: join(scratch, 'g') })).rejects.toThrow(
      '找不到分支：ghost',
    )
  })
})

describe('worktree-add: pull request', () => {
  let prTip = ''

  beforeEach(() => {
    const contributor = join(scratch, 'contributor')
    git(scratch, 'clone', '-q', origin, contributor)
    identify(contributor)
    prTip = commitFile(contributor, 'pr.txt', 'pr\n')
    git(contributor, 'push', '-q', 'origin', 'HEAD:refs/pull/7/head')
  })

  it('fetches the pull request head into a new branch', async () => {
    const path = join(scratch, 'pr-7')
    expect(await add({ mode: 'pr', pr: '#7', branch: 'pr-7', path })).toEqual({ path, branch: 'pr-7' })
    expect(headOf(path)).toBe(prTip)
    expect(branchOf(path)).toBe('pr-7')
  })

  it('prefers the upstream remote, where a fork sends its pull requests', async () => {
    const fork = join(scratch, 'fork.git')
    git(scratch, 'clone', '-q', '--bare', origin, fork)
    git(repo, 'remote', 'set-url', 'origin', fork)
    git(repo, 'remote', 'add', 'upstream', origin)
    const path = join(scratch, 'pr-up')
    await add({ mode: 'pr', pr: '7', branch: 'pr-7', path })
    expect(headOf(path)).toBe(prTip)
  })

  it('picks the remote a pull request link points at', async () => {
    git(repo, 'remote', 'rename', 'origin', 'mine')
    git(repo, 'remote', 'add', 'origin', join(scratch, 'missing.git'))
    git(repo, 'remote', 'set-url', 'mine', origin)
    // The link names owner/repo; a local test remote has no host, so its path stands in.
    const link = `https://github.com${origin.replace(/\.git$/, '')}/pull/7`
    await add({ mode: 'pr', pr: link, branch: 'pr-7', path: join(scratch, 'pr-link') })
    expect(headOf(join(scratch, 'pr-link'))).toBe(prTip)
  })

  it('reports a pull request the remote does not have', async () => {
    await expect(add({ mode: 'pr', pr: '99', branch: 'pr-99', path: join(scratch, 'p') })).rejects.toThrow(
      '拉取 PR #99 失败',
    )
  })

  it('refuses input that names no pull request', async () => {
    await expect(add({ mode: 'pr', pr: 'abc', branch: 'b', path: join(scratch, 'p') })).rejects.toBeInstanceOf(
      GitRequestError,
    )
  })

  it('refuses when there is no remote at all', async () => {
    git(repo, 'remote', 'remove', 'origin')
    await expect(add({ mode: 'pr', pr: '7', branch: 'pr-7', path: join(scratch, 'p') })).rejects.toThrow(
      '没有可以拉取 PR 的远程仓库',
    )
  })
})

describe('worktree-add: request checks', () => {
  it('requires an absolute target path and a known mode', async () => {
    await expect(add({ mode: 'new', branch: 'b', base: 'main', path: 'relative/dir' })).rejects.toThrow(
      'Worktree 位置必须是绝对路径',
    )
    await expect(add({ mode: 'other', branch: 'b', path: join(scratch, 'x') })).rejects.toThrow(
      '缺少或无效的参数：mode',
    )
  })

  it('answers repo: false outside a repository', async () => {
    const plain = join(scratch, 'plain')
    mkdirSync(plain)
    expect(await add({ mode: 'new', branch: 'b', base: 'main', path: join(scratch, 'x') }, plain)).toEqual({
      repo: false,
    })
  })
})

describe('parsePrInput', () => {
  it('reads a number, #number or a pull request link', () => {
    expect(parsePrInput('12')).toEqual({ number: 12 })
    expect(parsePrInput(' #12 ')).toEqual({ number: 12 })
    expect(parsePrInput('https://github.com/acme/tool/pull/34/files')).toEqual({ number: 34, repo: 'acme/tool' })
    expect(parsePrInput('https://github.com/acme/tool.git/pull/5')).toEqual({ number: 5, repo: 'acme/tool' })
  })

  it('rejects anything else', () => {
    expect(parsePrInput('')).toBeUndefined()
    expect(parsePrInput('0')).toBeUndefined()
    expect(parsePrInput('#x')).toBeUndefined()
    expect(parsePrInput('https://github.com/acme/tool/issues/3')).toBeUndefined()
    expect(parsePrInput(String(Number.MAX_SAFE_INTEGER) + '0')).toBeUndefined()
  })
})
