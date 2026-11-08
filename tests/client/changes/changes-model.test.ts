import { describe, expect, it } from 'vitest'
import {
  changedPaths,
  commitPaths,
  groupCheck,
  reconcileSelection,
  splitPath,
  summarize,
  toggleSelection,
} from '../../../src/client/changes/changes-model.ts'
import type { RepoStatus } from '../../../src/client/changes/changes-model.ts'
import { diffRows } from '../../../src/client/changes/diff-rows.ts'

const status = (fields: Partial<RepoStatus> = {}): RepoStatus => ({
  repo: true,
  root: '/r',
  branch: 'main',
  ahead: undefined,
  behind: undefined,
  staged: [],
  unstaged: [],
  untracked: [],
  ...fields,
})

const PARTLY = status({
  staged: [{ path: 'a.ts', status: 'M', additions: 2, deletions: 1 }],
  unstaged: [
    { path: 'a.ts', status: 'M', additions: 1, deletions: 0 },
    { path: 'b.ts', status: 'D', deletions: 4 },
  ],
  untracked: [{ path: 'c.md', status: '?', additions: 3 }],
})

describe('summary and paths', () => {
  it('counts a partly staged file once and adds up every line count', () => {
    expect([...changedPaths(PARTLY)]).toEqual(['a.ts', 'b.ts', 'c.md'])
    expect(summarize(PARTLY)).toEqual({ files: 3, additions: 6, deletions: 5 })
  })

  it('splits a path into its directory and name', () => {
    expect(splitPath('src/lib/qa-types.ts')).toEqual({ dir: 'src/lib/', name: 'qa-types.ts' })
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
    expect(splitPath('a\\b.txt')).toEqual({ dir: 'a\\', name: 'b.txt' })
  })
})

describe('selection', () => {
  it('starts with everything staged', () => {
    expect([...reconcileSelection(new Set(), undefined, PARTLY)]).toEqual(['a.ts'])
  })

  it('drops paths without changes, keeps choices and adds newly staged files', () => {
    const before = status({ staged: [{ path: 'x', status: 'M' }], unstaged: [{ path: 'y', status: 'M' }] })
    const after = status({
      staged: [
        { path: 'x', status: 'M' },
        { path: 'z', status: 'A' },
      ],
      unstaged: [{ path: 'y', status: 'M' }],
    })
    // x was unticked by the user and stays unticked; gone left the repo; z became staged.
    const next = reconcileSelection(new Set(['y', 'gone']), before, after)
    expect([...next]).toEqual(['y', 'z'])
  })

  it('toggles paths without touching the original set', () => {
    const selection = new Set(['a'])
    expect([...toggleSelection(selection, ['b', 'c'], true)]).toEqual(['a', 'b', 'c'])
    expect([...toggleSelection(selection, ['a'], false)]).toEqual([])
    expect([...selection]).toEqual(['a'])
  })

  it('commits only selected paths that still have changes', () => {
    expect(commitPaths(new Set(['b.ts', 'stale']), PARTLY)).toEqual(['b.ts'])
  })

  it('tells whether a group is fully, partly or not selected', () => {
    const entries = PARTLY.unstaged
    expect(groupCheck(new Set(['a.ts', 'b.ts']), entries)).toBe('all')
    expect(groupCheck(new Set(['a.ts']), entries)).toBe('some')
    expect(groupCheck(new Set(), entries)).toBe('none')
  })
})

describe('diffRows', () => {
  const PATCH = [
    'diff --git a/a.txt b/a.txt',
    'index 1..2 100644',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,3 +1,3 @@ heading',
    ' one',
    '-two',
    '+TWO',
    ' three',
    '\\ No newline at end of file',
    '',
  ].join('\n')

  it('numbers context, added and deleted lines and drops file headers', () => {
    expect(diffRows(PATCH)).toEqual({
      truncated: false,
      rows: [
        { kind: 'hunk', text: '@@ -1,3 +1,3 @@ heading' },
        { kind: 'context', oldLine: 1, newLine: 1, text: 'one' },
        { kind: 'del', oldLine: 2, text: 'two' },
        { kind: 'add', newLine: 2, text: 'TWO' },
        { kind: 'context', oldLine: 3, newLine: 3, text: 'three' },
        { kind: 'note', text: 'No newline at end of file' },
      ],
    })
  })

  it('cuts at the row limit', () => {
    const result = diffRows(PATCH, 3)
    expect(result.rows).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it('says a binary file cannot be shown, and ends a hunk at the next file header', () => {
    expect(diffRows('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n').rows).toEqual([
      { kind: 'note', text: '二进制文件，无法显示差异' },
    ])
    const two = diffRows('@@ -1 +1 @@\n-a\n+b\ndiff --git a/x b/x\n--- a/x\n')
    expect(two.rows.map((row) => row.kind)).toEqual(['hunk', 'del', 'add'])
  })

  it('returns nothing for an empty patch', () => {
    expect(diffRows('')).toEqual({ rows: [], truncated: false })
  })
})
