/**
 * One file's diff, shown in place of the list with a way back: an inline unified view with
 * old and new line numbers, as CC GUI draws it.
 * @module dsh-ccgui/client/changes/changes-diff
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { GitApi } from './changes-api.ts'
import { BackIcon } from './changes-icons.tsx'
import { diffRows } from './diff-rows.ts'
import type { DiffRow, DiffRows } from './diff-rows.ts'
import { CLS } from './changes-styles.ts'
import type { OpenDiff } from './use-changes.ts'

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | ({ readonly kind: 'rows' } & DiffRows)

const SIDE_LABELS = { staged: '已暂存', unstaged: '未暂存', untracked: '未跟踪' } as const
const TRUNCATED = 'Diff 过大，已截断'
const NO_CHANGES = '没有可显示的差异'

function Line({ row }: { readonly row: DiffRow }): ReactElement {
  if (row.kind === 'hunk' || row.kind === 'note') {
    return <div className={row.kind === 'hunk' ? CLS.diffHunk : CLS.diffNote}>{row.text}</div>
  }
  const oldLine = row.kind === 'add' ? '' : String(row.oldLine)
  const newLine = row.kind === 'del' ? '' : String(row.newLine)
  const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
  return (
    <div className={CLS.diffLine} data-kind={row.kind}>
      <span className={CLS.diffNumber}>{oldLine}</span>
      <span className={CLS.diffNumber}>{newLine}</span>
      <span className={CLS.diffText}>
        {sign}
        {row.text}
      </span>
    </div>
  )
}

function useDiff(api: GitApi, diff: OpenDiff): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const { entry, side } = diff
  useEffect(() => {
    let live = true
    setLoaded({ kind: 'loading' })
    api.diff({ path: entry.path, side, origPath: entry.origPath }).then(
      (file) => {
        if (!live) return
        setLoaded(
          file.truncated ? { kind: 'rows', rows: [], truncated: true } : { kind: 'rows', ...diffRows(file.patch) },
        )
      },
      (error: unknown) => {
        if (live) setLoaded({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      live = false
    }
  }, [api, entry.path, entry.origPath, side])
  return loaded
}

function Body({ loaded }: { readonly loaded: Loaded }): ReactElement {
  if (loaded.kind === 'loading') return <div className={CLS.empty}>加载中…</div>
  if (loaded.kind === 'error') return <div className={CLS.error}>{loaded.message}</div>
  return (
    <div className={CLS.diffBody}>
      {loaded.rows.length === 0 && !loaded.truncated ? <div className={CLS.empty}>{NO_CHANGES}</div> : null}
      {loaded.rows.map((row, index) => (
        // Rows have no identity of their own, and one patch's rows never reorder.
        <Line key={index} row={row} />
      ))}
      {loaded.truncated ? <div className={CLS.diffNote}>{TRUNCATED}</div> : null}
    </div>
  )
}

/** The diff of one file, with its header and a back button. */
export function ChangesDiff({
  api,
  diff,
  onBack,
}: {
  readonly api: GitApi
  readonly diff: OpenDiff
  readonly onBack: () => void
}): ReactElement {
  const loaded = useDiff(api, diff)
  return (
    <div className={CLS.diff}>
      <div className={CLS.diffHeader}>
        <button type="button" className={CLS.headerButton} title="返回" aria-label="返回" onClick={onBack}>
          <BackIcon size={16} />
        </button>
        <span className={CLS.diffPath} title={diff.entry.path}>
          {diff.entry.path}
        </span>
        <span className={CLS.diffSide}>{SIDE_LABELS[diff.side]}</span>
      </div>
      <Body loaded={loaded} />
    </div>
  )
}
