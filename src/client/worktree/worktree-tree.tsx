/// <reference lib="dom" />

/**
 * Nests worktree workspaces under their repository in the left sidebar. It follows the
 * harness's workspace and session lists, asks the host which repository each workspace belongs
 * to, hides the nested ones from the top level and renders a 「Worktrees」 group into each
 * repository's section. It renders nothing where it is mounted; the groups are portals.
 * @module dsh-ccgui/client/worktree/worktree-tree
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store.ts'
import type { Store } from '../store.ts'
import { useGroupAnchors, useHiddenGroups } from './worktree-anchors.ts'
import type { CheckoutStore } from './worktree-checkouts.ts'
import type { ExpansionStore } from './worktree-expansion.ts'
import { WorktreeGroup } from './worktree-group.tsx'
import type { GroupActions } from './worktree-group.tsx'
import { layoutWorktrees } from './worktree-layout.ts'
import type { SessionSummary, WorkspaceItem } from './worktree-layout.ts'

/** The harness's workspace list, as far as the tree reads it. */
export interface WorkspacesSnapshot {
  readonly items?: readonly WorkspaceItem[] | undefined
  readonly archivedSessionIds?: readonly string[] | undefined
}

/** The harness's session list, as far as the tree reads it. */
export interface SessionsSnapshot {
  readonly byId: Readonly<Record<string, SessionSummary | undefined>>
}

export interface TreeProps {
  readonly doc: Document
  readonly workspaces: Store<WorkspacesSnapshot>
  readonly sessions: Store<SessionsSnapshot>
  readonly checkouts: CheckoutStore
  readonly expansion: ExpansionStore
  /** Everything but opening and closing rows, which the tree handles itself. */
  readonly actions: Omit<GroupActions, 'setOpen'>
}

const NO_ITEMS: readonly WorkspaceItem[] = []
/** Relative times only change by the minute. */
const CLOCK_MS = 60_000

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, CLOCK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return now
}

/**
 * @param props - the document, the harness's lists, the plugin's stores and the row actions.
 * @returns the groups, as portals into the sidebar.
 */
export function WorktreeTree(props: TreeProps): ReactElement {
  const { doc, checkouts, expansion } = props
  const workspaces = useStore(props.workspaces)
  const sessions = useStore(props.sessions)
  const known = useStore(checkouts)
  const choices = useStore(expansion)
  const now = useNow()
  const items = workspaces.items ?? NO_ITEMS
  useEffect(() => {
    checkouts.track(items.map((item) => item.path))
  }, [checkouts, items])
  const layout = useMemo(() => layoutWorktrees(items, known), [items, known])
  const archived = useMemo(() => new Set(workspaces.archivedSessionIds), [workspaces.archivedSessionIds])
  useHiddenGroups(doc, layout.childIds)
  const anchors = useGroupAnchors(doc, [...layout.byParent.keys()])
  const actions: GroupActions = {
    ...props.actions,
    setOpen: (kind, id, open) => {
      // Opening the list is when stale branch names would show, so look them up again then.
      if (kind === 'groups' && open) checkouts.refresh()
      expansion.set(kind, id, open)
    },
  }
  const groups = [...layout.byParent].flatMap(([parentId, entries]) => {
    const anchor = anchors.get(parentId)
    const parent = items.find((item) => item.workspaceId === parentId)
    if (anchor === undefined || parent === undefined) return []
    const group = (
      <WorktreeGroup
        parent={parent}
        entries={entries}
        sessions={sessions.byId}
        archived={archived}
        expansion={choices}
        actions={actions}
        now={now}
      />
    )
    return [<Fragment key={parentId}>{createPortal(group, anchor)}</Fragment>]
  })
  return <>{groups}</>
}
