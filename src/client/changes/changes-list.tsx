/**
 * The 变更 panel's list: the summary row, then one collapsible group per non-empty status
 * group (已暂存, 未暂存, 未跟踪), each row with its commit checkbox, status letter, file-type
 * badge, path and line counts, and stage, unstage and discard controls on hover.
 * @module dsh-ccgui/client/changes/changes-list
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { ChevronIcon } from './changes-icons.tsx'
import { FileRow } from './changes-row.tsx'
import type { ListActions } from './changes-row.tsx'
import { GROUP_IDS, GROUP_TITLES, groupCheck, summarize } from './changes-model.ts'
import type { ChangeEntry, GroupId, RepoStatus } from './changes-model.ts'
import { CLS } from './changes-styles.ts'

interface ListProps {
  readonly status: RepoStatus
  readonly selection: ReadonlySet<string>
  readonly busy: boolean
  readonly actions: ListActions
}

/** The summary row: "27 个未提交变更 +365 −95 … 已选 27 项". */
export function SummaryRow({
  status,
  selected,
}: {
  readonly status: RepoStatus
  readonly selected: number
}): ReactElement {
  const { files, additions, deletions } = summarize(status)
  return (
    <div className={CLS.summary}>
      <span className={CLS.summaryTitle}>{files} 个未提交变更</span>
      {additions > 0 ? <span className={CLS.add}>+{additions}</span> : null}
      {deletions > 0 ? <span className={CLS.del}>−{deletions}</span> : null}
      <span className={CLS.summarySelected}>已选 {selected} 项</span>
    </div>
  )
}

function GroupCheckbox({
  entries,
  selection,
  onChange,
}: {
  readonly entries: readonly ChangeEntry[]
  readonly selection: ReadonlySet<string>
  readonly onChange: (selected: boolean) => void
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  const check = groupCheck(selection, entries)
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = check === 'some'
  }, [check])
  return (
    <input
      ref={ref}
      type="checkbox"
      className={CLS.checkbox}
      checked={check === 'all'}
      aria-label="全选本组"
      onChange={(event) => {
        onChange(event.target.checked)
      }}
    />
  )
}

function TextAction({
  label,
  danger = false,
  busy,
  onClick,
}: {
  readonly label: string
  readonly danger?: boolean
  readonly busy: boolean
  readonly onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className={danger ? `${CLS.groupAction} ${CLS.danger}` : CLS.groupAction}
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function GroupActions({
  group,
  entries,
  busy,
  actions,
}: {
  readonly group: GroupId
  readonly entries: readonly ChangeEntry[]
  readonly busy: boolean
  readonly actions: ListActions
}): ReactElement {
  const paths = entries.map((entry) => entry.path)
  if (group === 'staged')
    return (
      <TextAction
        label="全部取消暂存"
        busy={busy}
        onClick={() => {
          actions.unstage(paths)
        }}
      />
    )
  return (
    <>
      <TextAction
        label="全部撤销"
        danger
        busy={busy}
        onClick={() => {
          actions.discard(group, entries)
        }}
      />
      <TextAction
        label="全部暂存"
        busy={busy}
        onClick={() => {
          actions.stage(paths)
        }}
      />
    </>
  )
}

interface GroupProps {
  readonly group: GroupId
  readonly entries: readonly ChangeEntry[]
  readonly selection: ReadonlySet<string>
  readonly busy: boolean
  readonly actions: ListActions
}

function GroupHeader({
  open,
  onToggle,
  ...props
}: GroupProps & { readonly open: boolean; readonly onToggle: () => void }): ReactElement {
  const { group, entries, selection, actions } = props
  const title = GROUP_TITLES[group]
  return (
    <div
      className={CLS.groupHeader}
      onClick={(event) => {
        // The whole row toggles like a tree node, but its own controls (chevron, checkbox,
        // group actions) must keep their meaning, so their clicks never reach this handler.
        if (!(event.target instanceof Element)) return
        if (event.target.closest('button, input, label, a') !== null) return
        onToggle()
      }}
    >
      <button
        type="button"
        className={CLS.iconButton}
        aria-expanded={open}
        aria-label={`${open ? '折叠' : '展开'}${title}`}
        onClick={onToggle}
      >
        <ChevronIcon size={14} className={open ? undefined : CLS.collapsed} />
      </button>
      <GroupCheckbox
        entries={entries}
        selection={selection}
        onChange={(selected) => {
          actions.select(
            entries.map((entry) => entry.path),
            selected,
          )
        }}
      />
      <span className={CLS.groupTitle}>{title}</span>
      <span className={CLS.groupCount}>{entries.length}</span>
      <span className={CLS.groupActions}>
        <GroupActions {...props} />
      </span>
    </div>
  )
}

function Group(props: GroupProps): ReactElement {
  const [open, setOpen] = useState(true)
  const { group, entries, selection, busy, actions } = props
  return (
    <section className={CLS.group} aria-label={GROUP_TITLES[group]}>
      <GroupHeader
        {...props}
        open={open}
        onToggle={() => {
          setOpen((value) => !value)
        }}
      />
      {open
        ? entries.map((entry) => (
            <FileRow
              key={`${group}:${entry.path}`}
              group={group}
              entry={entry}
              selected={selection.has(entry.path)}
              busy={busy}
              actions={actions}
            />
          ))
        : null}
    </section>
  )
}

/** The groups, or the empty state when nothing changed. */
export function ChangesList({ status, selection, busy, actions }: ListProps): ReactElement {
  const groups = GROUP_IDS.filter((group) => status[group].length > 0)
  if (groups.length === 0) return <div className={CLS.empty}>没有变更</div>
  return (
    <div className={CLS.list}>
      {groups.map((group) => (
        <Group key={group} group={group} entries={status[group]} selection={selection} busy={busy} actions={actions} />
      ))}
    </div>
  )
}
