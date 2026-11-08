import { describe, expect, it } from 'vitest'
import { parseNumstat, parseStatus, withCounts } from '../../src/git/git-status.ts'

const z = (...records: string[]): string => `${records.join('\0')}\0`

describe('parseStatus', () => {
  it('reads the branch and its distance from upstream', () => {
    const status = parseStatus(
      z('# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1'),
    )
    expect(status).toMatchObject({ branch: 'main', ahead: 2, behind: 1, staged: [], unstaged: [], untracked: [] })
  })

  it('leaves the branch and distance unset on a detached HEAD without upstream', () => {
    const status = parseStatus(z('# branch.oid abc', '# branch.head (detached)'))
    expect(status.branch).toBeUndefined()
    expect(status.ahead).toBeUndefined()
  })

  it('files an entry under each side it changed on, keeping spaces in paths', () => {
    const status = parseStatus(
      z(
        '1 MM N... 100644 100644 100644 aaa bbb src/a file.ts',
        '1 A. N... 000000 100644 100644 000 ccc new.ts',
        '1 .D N... 100644 100644 000000 ddd ddd gone.ts',
        '? notes/todo.md',
      ),
    )
    expect(status.staged).toEqual([
      { path: 'src/a file.ts', status: 'M' },
      { path: 'new.ts', status: 'A' },
    ])
    expect(status.unstaged).toEqual([
      { path: 'src/a file.ts', status: 'M' },
      { path: 'gone.ts', status: 'D' },
    ])
    expect(status.untracked).toEqual([{ path: 'notes/todo.md', status: '?' }])
  })

  it('reads a rename with the path it had before', () => {
    const status = parseStatus(z('2 R. N... 100644 100644 100644 aaa aaa R100 lib/new.ts', 'lib/old.ts', '? x'))
    expect(status.staged).toEqual([{ path: 'lib/new.ts', origPath: 'lib/old.ts', status: 'R' }])
    expect(status.untracked).toEqual([{ path: 'x', status: '?' }])
  })

  it('lists a conflict as unstaged and skips ignored entries', () => {
    const status = parseStatus(z('u UU N... 100644 100644 100644 100644 a b c both.ts', '! build/out.js'))
    expect(status.unstaged).toEqual([{ path: 'both.ts', status: 'U' }])
    expect(status.staged).toEqual([])
  })
})

describe('parseNumstat', () => {
  it('reads counts, files renames under the new path, and skips binary files', () => {
    const counts = parseNumstat(z('3\t1\tsrc/a.ts', '-\t-\timg.png', '0\t0\t', 'old.ts', 'new.ts'))
    expect([...counts]).toEqual([
      ['src/a.ts', { additions: 3, deletions: 1 }],
      ['new.ts', { additions: 0, deletions: 0 }],
    ])
  })

  it('returns nothing for empty output', () => {
    expect(parseNumstat('').size).toBe(0)
  })
})

describe('withCounts', () => {
  it('adds counts where there are some and keeps the rest as they were', () => {
    const entries = [
      { path: 'a', status: 'M' as const },
      { path: 'b', status: 'M' as const },
    ]
    const counted = withCounts(entries, new Map([['a', { additions: 1, deletions: 2 }]]))
    expect(counted).toEqual([{ path: 'a', status: 'M', additions: 1, deletions: 2 }, entries[1]])
    expect(entries[0]).toEqual({ path: 'a', status: 'M' })
  })
})
