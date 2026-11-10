/// <reference lib="dom" />

/**
 * The 「Worktrees · N」 group at the foot of a repository's workspace section, after CC GUI's
 * repo tree: a header that opens the list and offers 新建 Worktree, a row per worktree that
 * opens its sessions and starts new ones, and the session rows themselves. Right-clicking a
 * worktree or a session brings up the harness's own menu for it, so rename, delete, pin and
 * archive work as they do on the harness's rows.
 * @module dsh-ccgui/client/worktree/worktree-group
 */

import type { KeyboardEvent, MouseEvent, ReactElement } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { isOpen } from './worktree-expansion.ts'
import type { Expansion, ExpansionKind } from './worktree-expansion.ts'
import { BranchIcon, ChevronIcon, NewSessionIcon, NewWorktreeIcon } from './worktree-icons.tsx'
import { relativeTime, sessionRows } from './worktree-layout.ts'
import type { SessionRow, SessionSummary, WorkspaceItem, WorktreeEntry } from './worktree-layout.ts'
import { WG } from './worktree-group-styles.ts'

/** A point on screen, where a context menu opens. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** What the rows do; the owner wires these to the harness. */
export interface GroupActions {
  readonly setOpen: (kind: ExpansionKind, id: string, open: boolean) => void
  readonly newWorktree: (parent: WorkspaceItem) => void
  readonly newSession: (workspaceId: string) => void
  readonly openSession: (sessionId: string) => void
  readonly worktreeMenu: (entry: WorktreeEntry, point: Point) => void
  readonly sessionMenu: (row: SessionRow, point: Point) => void
}

export interface GroupProps {
  readonly parent: WorkspaceItem
  readonly entries: readonly WorktreeEntry[]
  readonly sessions: Readonly<Record<string, SessionSummary | undefined>>
  readonly archived: ReadonlySet<string>
  readonly expansion: Expansion
  readonly actions: GroupActions
  readonly now: number
}

const GROUP_LABEL = 'Worktrees'
const NEW_WORKTREE = '新建 Worktree'
const NO_SESSIONS = '暂无会话'

function pointOf(event: MouseEvent): Point {
  event.preventDefault()
  event.stopPropagation()
  return { x: event.clientX, y: event.clientY }
}

/** Enter and Space act on a row the way a click does. */
function onActivate(run: () => void) {
  return (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    run()
  }
}

function SessionItem({ row, actions, now }: { row: SessionRow; actions: GroupActions; now: number }) {
  return (
    <div
      role="treeitem"
      aria-selected={row.current}
      aria-label={row.title}
      tabIndex={0}
      className={WG.session}
      title={row.title}
      onClick={() => {
        actions.openSession(row.id)
      }}
      onKeyDown={onActivate(() => {
        actions.openSession(row.id)
      })}
      onContextMenu={(event) => {
        actions.sessionMenu(row, pointOf(event))
      }}
    >
      <span className={WG.label}>{row.title}</span>
      {row.running ? <StateDot state="ongoing" /> : <span className={WG.time}>{relativeTime(row.updatedAt, now)}</span>}
    </div>
  )
}

function WorktreeRow(props: { readonly entry: WorktreeEntry; readonly open: boolean; readonly actions: GroupActions }) {
  const { entry, open, actions } = props
  const toggle = (): void => {
    actions.setOpen('worktrees', entry.workspaceId, !open)
  }
  const newSession = `在“${entry.branch}”中新建会话`
  return (
    <div
      role="treeitem"
      aria-expanded={open}
      aria-label={entry.branch}
      tabIndex={0}
      className={WG.worktree}
      title={entry.path}
      onClick={toggle}
      onKeyDown={onActivate(toggle)}
      onContextMenu={(event) => {
        actions.worktreeMenu(entry, pointOf(event))
      }}
    >
      <span className={WG.chevron}>
        <ChevronIcon />
      </span>
      <span className={WG.glyph}>
        <BranchIcon />
      </span>
      <span className={WG.label}>{entry.branch}</span>
      <button
        type="button"
        className={WG.iconButton}
        aria-label={newSession}
        title={newSession}
        onClick={(event) => {
          event.stopPropagation()
          actions.newSession(entry.workspaceId)
        }}
      >
        <NewSessionIcon />
      </button>
    </div>
  )
}

function WorktreeItem(props: Omit<GroupProps, 'parent' | 'entries'> & { readonly entry: WorktreeEntry }) {
  const { entry, actions, now } = props
  const rows = sessionRows(entry, props.sessions, props.archived)
  const open = isOpen(
    props.expansion,
    'worktrees',
    entry.workspaceId,
    rows.some((row) => row.current),
  )
  return (
    <>
      <WorktreeRow entry={entry} open={open} actions={actions} />
      {open ? (
        <div role="group">
          {rows.length === 0 ? <div className={WG.empty}>{NO_SESSIONS}</div> : null}
          {rows.map((row) => (
            <SessionItem key={row.id} row={row} actions={actions} now={now} />
          ))}
        </div>
      ) : null}
    </>
  )
}

/**
 * @param props - the repository's workspace, its worktrees, the session data and the actions.
 * @returns the group.
 */
export function WorktreeGroup(props: GroupProps): ReactElement {
  const { parent, entries, actions } = props
  const holdsCurrent = entries.some((entry) =>
    sessionRows(entry, props.sessions, props.archived).some((row) => row.current),
  )
  const open = isOpen(props.expansion, 'groups', parent.workspaceId, holdsCurrent)
  return (
    <div className={WG.group}>
      <div className={WG.header}>
        <button
          type="button"
          className={WG.toggle}
          aria-expanded={open}
          onClick={() => {
            actions.setOpen('groups', parent.workspaceId, !open)
          }}
        >
          <span className={WG.chevron}>
            <ChevronIcon />
          </span>
          {`${GROUP_LABEL} · ${String(entries.length)}`}
        </button>
        <button
          type="button"
          className={WG.iconButton}
          aria-label={NEW_WORKTREE}
          title={NEW_WORKTREE}
          onClick={() => {
            actions.newWorktree(parent)
          }}
        >
          <NewWorktreeIcon />
        </button>
      </div>
      {open ? (
        <div role="group" aria-label={GROUP_LABEL}>
          {entries.map((entry) => (
            <WorktreeItem key={entry.workspaceId} {...props} entry={entry} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
