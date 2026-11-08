import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitRequestError, runOperation } from '../../src/git/git-requests.ts'
import type { GitOperation } from '../../src/git/git-requests.ts'
import type { FileDiff, RepoStatus } from '../../src/git/git-read.ts'
import type { Spawn } from '../../src/git/git-run.ts'
import { collectingSpawn } from '../fixtures/collecting-subprocess.ts'

let scratch = ''
let repo = ''
let marker = ''

const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
const write = (name: string, text: string): void => {
  writeFileSync(join(repo, name), text)
}
const run = (operation: GitOperation, body: Record<string, unknown> = {}, spawn: Spawn = collectingSpawn) =>
  runOperation(spawn, operation, { cwd: repo, ...body })

/** A script outside the repository that leaves a file behind when anything runs it. */
function trap(): string {
  const script = join(scratch, 'trap.sh')
  writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`)
  chmodSync(script, 0o755)
  return script
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'ccgui-git-safety-'))
  repo = join(scratch, 'repo')
  marker = join(scratch, 'ran')
  mkdirSync(join(repo, 'src'), { recursive: true })
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  git('config', 'commit.gpgsign', 'false')
  write('src/[id].tsx', 'one\n')
  write('src/d.tsx', 'one\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('paths are literal, never pathspec patterns', () => {
  it('discards only the named file when its name looks like a glob', async () => {
    write('src/[id].tsx', 'two\n')
    write('src/d.tsx', 'two\n')
    const result = (await run('discard', { tracked: ['src/[id].tsx'] })) as RepoStatus
    expect(result.unstaged.map((entry) => entry.path)).toEqual(['src/d.tsx'])
  })

  it('stages only the named file when its name looks like a glob', async () => {
    write('src/[id].tsx', 'two\n')
    write('src/d.tsx', 'two\n')
    const result = (await run('stage', { paths: ['src/[id].tsx'] })) as RepoStatus
    expect(result.staged.map((entry) => entry.path)).toEqual(['src/[id].tsx'])
  })

  it('does not read a leading colon as pathspec magic', async () => {
    write('memo.txt', 'one\n')
    write(':memo.txt', 'one\n')
    git('add', '.')
    git('commit', '-q', '-m', 'memo')
    write('memo.txt', 'two\n')
    write(':memo.txt', 'two\n')
    const result = (await run('discard', { tracked: [':memo.txt'] })) as RepoStatus
    expect(result.unstaged.map((entry) => entry.path)).toEqual(['memo.txt'])
  })
})

describe('repository config cannot run commands through background reads', () => {
  it('ignores core.fsmonitor', async () => {
    git('config', 'core.fsmonitor', trap())
    await run('status')
    expect(existsSync(marker)).toBe(false)
  })

  it('ignores diff.external', async () => {
    git('config', 'diff.external', trap())
    write('src/d.tsx', 'two\n')
    await run('status')
    const diff = (await run('diff', { path: 'src/d.tsx', side: 'unstaged' })) as FileDiff
    expect(existsSync(marker)).toBe(false)
    expect(diff.patch).toContain('+two')
  })

  it('ignores textconv drivers', async () => {
    write('.gitattributes', '*.tsx diff=evil\n*.md diff=evil\n')
    git('config', 'diff.evil.textconv', trap())
    write('src/d.tsx', 'two\n')
    write('notes.md', 'new\n')
    await run('status')
    await run('diff', { path: 'src/d.tsx', side: 'unstaged' })
    await run('diff', { path: 'notes.md', side: 'untracked' })
    expect(existsSync(marker)).toBe(false)
  })
})

describe('untracked diffs stay inside the repository', () => {
  it('refuses a path that reaches outside through a symlinked directory', async () => {
    mkdirSync(join(scratch, 'secret'))
    writeFileSync(join(scratch, 'secret', 'key.txt'), 'TOPSECRET\n')
    symlinkSync(join(scratch, 'secret'), join(repo, 'link'))
    await expect(run('diff', { path: 'link/key.txt', side: 'untracked' })).rejects.toThrow(GitRequestError)
  })

  it('refuses a path that is not an untracked file', async () => {
    await expect(run('diff', { path: 'src/d.tsx', side: 'untracked' })).rejects.toThrow(GitRequestError)
  })

  it('still reads an untracked file whose name looks like a glob', async () => {
    write('src/[x].ts', 'new\n')
    const diff = (await run('diff', { path: 'src/[x].ts', side: 'untracked' })) as FileDiff
    expect(diff.patch).toContain('+new')
  })
})

describe('status reads', () => {
  it('counts many untracked files without starting a git process for each at once', async () => {
    const files = Array.from({ length: 40 }, (_, index) => `n${String(index)}.txt`)
    for (const file of files) write(file, 'a\nb\n')
    const live = { now: 0, peak: 0 }
    const counting: Spawn = (spec: SubprocessSpawnSpec) => {
      const handle = collectingSpawn(spec)
      live.now += 1
      live.peak = Math.max(live.peak, live.now)
      void handle.done.finally(() => {
        live.now -= 1
      })
      return handle
    }
    const result = (await run('status', {}, counting)) as RepoStatus
    expect(result.untracked).toHaveLength(40)
    expect(result.untracked.every((entry) => entry.additions === 2)).toBe(true)
    expect(live.peak).toBeLessThanOrEqual(8)
  })
})
