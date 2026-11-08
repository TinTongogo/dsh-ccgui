/**
 * One file in the 变更 list: commit checkbox, status letter, file-type badge, the path (its
 * directory dimmed and cut from the left, its name in the status color), line counts, and the
 * stage, unstage and discard controls that appear on hover.
 * @module dsh-ccgui/client/changes/changes-row
 */

import type { ReactElement } from 'react'
import type { DiffSide } from './changes-api.ts'
import { MinusIcon, PlusIcon, UndoIcon } from './changes-icons.tsx'
import { STATUS_LABELS, splitPath } from './changes-model.ts'
import type { ChangeEntry, GroupId } from './changes-model.ts'
import { CLS } from './changes-styles.ts'

/** What the list asks the panel to do. */
export interface ListActions {
  readonly select: (paths: readonly string[], selected: boolean) => void
  readonly stage: (paths: readonly string[]) => void
  readonly unstage: (paths: readonly string[]) => void
  /** Asks for confirmation first; the panel owns the dialog. */
  readonly discard: (group: GroupId, entries: readonly ChangeEntry[]) => void
  readonly open: (entry: ChangeEntry, side: DiffSide) => void
}

/** File-type badges by extension; anything else gets the plain document badge. */
const BADGES: Readonly<Record<string, { readonly text: string; readonly tone: string }>> = {
  ts: { text: 'TS', tone: 'blue' },
  tsx: { text: 'TSX', tone: 'blue' },
  js: { text: 'JS', tone: 'yellow' },
  jsx: { text: 'JSX', tone: 'yellow' },
  mjs: { text: 'JS', tone: 'yellow' },
  json: { text: '{}', tone: 'yellow' },
  md: { text: 'M↓', tone: 'dark' },
  html: { text: '<>', tone: 'orange' },
  css: { text: '#', tone: 'blue' },
  py: { text: 'PY', tone: 'blue' },
  rs: { text: 'RS', tone: 'orange' },
  go: { text: 'GO', tone: 'blue' },
}
const DEFAULT_BADGE = { text: '·', tone: 'plain' }

const SIDE_OF: Readonly<Record<GroupId, DiffSide>> = { staged: 'staged', unstaged: 'unstaged', untracked: 'untracked' }

function badgeOf(path: string): { readonly text: string; readonly tone: string } {
  const name = splitPath(path).name
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? DEFAULT_BADGE : (BADGES[name.slice(dot + 1).toLowerCase()] ?? DEFAULT_BADGE)
}

interface RowProps {
  readonly group: GroupId
  readonly entry: ChangeEntry
  readonly busy: boolean
  readonly actions: ListActions
}

function RowActions({ group, entry, busy, actions }: RowProps): ReactElement {
  const staged = group === 'staged'
  return (
    <span className={CLS.rowActions}>
      {staged ? null : (
        <button
          type="button"
          className={CLS.iconButton}
          title="撤销更改"
          aria-label="撤销更改"
          disabled={busy}
          onClick={() => {
            actions.discard(group, [entry])
          }}
        >
          <UndoIcon size={14} />
        </button>
      )}
      <button
        type="button"
        className={CLS.iconButton}
        title={staged ? '取消暂存' : '暂存'}
        aria-label={staged ? '取消暂存' : '暂存'}
        disabled={busy}
        onClick={() => {
          if (staged) actions.unstage([entry.path])
          else actions.stage([entry.path])
        }}
      >
        {staged ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
      </button>
    </span>
  )
}

function PathButton({ group, entry, actions }: Omit<RowProps, 'busy'>): ReactElement {
  const { dir, name } = splitPath(entry.path)
  return (
    <button
      type="button"
      className={CLS.path}
      title={entry.origPath === undefined ? entry.path : `${entry.origPath} → ${entry.path}`}
      onClick={() => {
        actions.open(entry, SIDE_OF[group])
      }}
    >
      {dir === '' ? null : (
        <span className={CLS.dir} dir="rtl">
          <bdo dir="ltr">{dir}</bdo>
        </span>
      )}
      <span className={CLS.name}>{name}</span>
    </button>
  )
}

function LineStats({ entry }: { readonly entry: ChangeEntry }): ReactElement {
  // CC GUI hides a zero on either side.
  return (
    <span className={CLS.stats}>
      {entry.additions === undefined || entry.additions === 0 ? null : (
        <span className={CLS.add}>+{entry.additions}</span>
      )}
      {entry.deletions === undefined || entry.deletions === 0 ? null : (
        <span className={CLS.del}>−{entry.deletions}</span>
      )}
    </span>
  )
}

/** One row of a group. */
export function FileRow(props: RowProps & { readonly selected: boolean }): ReactElement {
  const { entry, selected, actions } = props
  const badge = badgeOf(entry.path)
  return (
    <div className={CLS.row} data-status={entry.status === '?' ? 'untracked' : entry.status}>
      <input
        type="checkbox"
        className={CLS.checkbox}
        checked={selected}
        aria-label={`选择 ${entry.path}`}
        onChange={(event) => {
          actions.select([entry.path], event.target.checked)
        }}
      />
      <span className={CLS.letter} title={STATUS_LABELS[entry.status]}>
        {entry.status}
      </span>
      <span className={CLS.badge} data-tone={badge.tone}>
        {badge.text}
      </span>
      <PathButton {...props} />
      <LineStats entry={entry} />
      <RowActions {...props} />
    </div>
  )
}
