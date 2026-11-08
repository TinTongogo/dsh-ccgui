/**
 * Turn a unified patch into the rows the diff view draws: hunk headers, and added, deleted
 * and context lines with their old and new line numbers. File headers are dropped, since
 * the view names the file itself.
 * @module dsh-ccgui/client/changes/diff-rows
 */

export type DiffRow =
  | { readonly kind: 'hunk'; readonly text: string }
  | { readonly kind: 'add'; readonly newLine: number; readonly text: string }
  | { readonly kind: 'del'; readonly oldLine: number; readonly text: string }
  | { readonly kind: 'context'; readonly oldLine: number; readonly newLine: number; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }

export interface DiffRows {
  readonly rows: readonly DiffRow[]
  /** True when the patch had more lines than the view draws. */
  readonly truncated: boolean
}

/** CC GUI draws at most this many lines of a patch. */
const MAX_DIFF_ROWS = 2_000

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

interface Cursor {
  readonly oldLine: number
  readonly newLine: number
  readonly inHunk: boolean
}

function rowOf(line: string, cursor: Cursor): { row: DiffRow | undefined; next: Cursor } {
  const hunk = HUNK.exec(line)
  if (hunk !== null) {
    return {
      row: { kind: 'hunk', text: line },
      next: { oldLine: Number(hunk[1]), newLine: Number(hunk[2]), inHunk: true },
    }
  }
  if (!cursor.inHunk) {
    // Binary files have no hunks, only this line to say so.
    const row: DiffRow | undefined = line.startsWith('Binary files')
      ? { kind: 'note', text: '二进制文件，无法显示差异' }
      : undefined
    return { row, next: cursor }
  }
  const text = line.slice(1)
  if (line.startsWith('+')) {
    return { row: { kind: 'add', newLine: cursor.newLine, text }, next: { ...cursor, newLine: cursor.newLine + 1 } }
  }
  if (line.startsWith('-')) {
    return { row: { kind: 'del', oldLine: cursor.oldLine, text }, next: { ...cursor, oldLine: cursor.oldLine + 1 } }
  }
  if (line.startsWith('\\')) return { row: { kind: 'note', text: line.slice(2) }, next: cursor }
  // A new file header ends the hunk; anything else inside one is context.
  if (line.startsWith('diff --git')) return { row: undefined, next: { ...cursor, inHunk: false } }
  return {
    row: { kind: 'context', oldLine: cursor.oldLine, newLine: cursor.newLine, text },
    next: { ...cursor, oldLine: cursor.oldLine + 1, newLine: cursor.newLine + 1 },
  }
}

/**
 * Parse a unified patch.
 * @param patch - output of `git diff` for one file.
 * @param maxRows - how many rows to keep.
 * @returns the rows, and whether some were cut.
 */
export function diffRows(patch: string, maxRows: number = MAX_DIFF_ROWS): DiffRows {
  const lines = patch.endsWith('\n') ? patch.slice(0, -1).split('\n') : patch.split('\n')
  const rows: DiffRow[] = []
  let cursor: Cursor = { oldLine: 0, newLine: 0, inHunk: false }
  for (const line of lines) {
    if (line === '' && !cursor.inHunk) continue
    const { row, next } = rowOf(line, cursor)
    cursor = next
    if (row === undefined) continue
    if (rows.length >= maxRows) return { rows, truncated: true }
    rows.push(row)
  }
  return { rows, truncated: false }
}
