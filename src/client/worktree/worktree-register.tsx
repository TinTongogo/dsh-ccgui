/// <reference lib="dom" />

/**
 * "新建 Worktree…" in a workspace's context menu in the left sidebar, after CC GUI's project
 * menu. The menu entry only records which workspace was clicked; the dialog itself sits in a
 * root slot of the sidebar (the one the menu was opened from), because a menu action has no
 * React tree of its own to render into. Once the worktree exists it is added as a workspace,
 * titled after its repository and branch (the composer's workspace chip shows that title on its
 * own), and a new session is opened in it when the user asked for one. The same slot hosts the
 * tree that nests worktrees under their repository (see worktree-tree.tsx).
 * @module dsh-ccgui/client/worktree/worktree-register
 */

import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type { Fetch } from '../git-post.ts'
import { useStore } from '../store.ts'
import type { Store } from '../store.ts'
import { createWorktreeApi } from './worktree-api.ts'
import { WorktreeDialog } from './worktree-dialog.tsx'
import { NewWorktreeIcon } from './worktree-icons.tsx'
import type { CreatedWorktree } from './worktree-dialog.tsx'
import { createCheckouts } from './worktree-checkouts.ts'
import { createExpansion } from './worktree-expansion.ts'
import type { ExpansionStorage } from './worktree-expansion.ts'
import type { Point } from './worktree-group.tsx'
import { WorktreeTree } from './worktree-tree.tsx'
import type { SessionsSnapshot, TreeProps, WorkspacesSnapshot } from './worktree-tree.tsx'

/** The workspace row the user right-clicked, as the harness's sidebar reports it. */
interface WorkspaceTarget {
  readonly workspaceId: string
  readonly path: string
  readonly displayTitle?: string
}

/** One menu entry, as far as this module fills it in. */
interface MenuAction {
  readonly id: string
  readonly label: string
  readonly icon: { readonly key: string }
  readonly run: () => void
}

/** The parts of the harness's services this module uses. */
export interface WorktreeServices {
  effect(run: () => () => void, label?: string): void
  slots: {
    inject(name: string, add: () => unknown): void
    register(
      options: { name: string; id: string; inject(): unknown } | { name: string; key: string },
      component: unknown,
    ): unknown
  }
  contextMenus: {
    register(contribution: {
      id: string
      target: 'workspace'
      order: number
      resolve(target: WorkspaceTarget): readonly MenuAction[]
    }): () => void
    notify?(text: string, success: boolean): void
    open(target: MenuTarget, point: Point): void
  }
  workspaces: {
    list: Store<WorkspacesSnapshot>
    create(input: { path: string }): Promise<{ readonly workspaceId: string }>
    rename(workspaceId: string, title: string): Promise<unknown>
  }
  sessions: { list: Store<SessionsSnapshot> }
  uiWorkspace: { startSession(workspaceId: string): void; openSession(sessionId: string): void }
}

/** What a right-click on the group's rows opens the harness's menu for. */
type MenuTarget =
  | { readonly kind: 'workspace'; readonly value: WorkspaceTarget }
  | { readonly kind: 'session'; readonly value: { readonly sessionId: string; readonly displayTitle: string } }

/** The parts of the harness's client context this module uses. */
export interface WorktreeContext {
  inject(deps: readonly string[], apply: (child: WorktreeServices) => void): unknown
}

/** Which workspace the dialog is open for, if any. */
interface DialogRequests extends Store<WorkspaceTarget | undefined> {
  readonly open: (target: WorkspaceTarget) => void
  readonly close: () => void
}

interface HostProps {
  readonly requests: DialogRequests
  readonly fetchFn: Fetch
  readonly finish: (created: CreatedWorktree) => Promise<void>
}

const DEPENDENCIES = ['contextMenus', 'workspaces', 'sessions', 'uiWorkspace', 'slots'] as const
const MENU_ID = 'dsh-ccgui.worktree'
const ICON_KEY = 'dsh-ccgui.worktree'
const ICON_SLOT = 'contextMenu.icon'
/** A root list slot of the left sidebar, which is on screen whenever its menu is. */
const HOST_SLOT = 'sidebar.footer.action'
const HOST_ID = 'dsh-ccgui.worktree-dialog'
const TREE_ID = 'dsh-ccgui.worktree-tree'
/** First in the menu, ahead of the harness's 重命名 (100), as in CC GUI. */
const MENU_ORDER = 10
const LABEL = '新建 Worktree…'
const CREATED = '已创建 Worktree：'

function dialogRequests(): DialogRequests {
  let target: WorkspaceTarget | undefined
  let listeners: readonly (() => void)[] = []
  const set = (next: WorkspaceTarget | undefined): void => {
    target = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => target,
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    open: (next) => {
      set({ ...next })
    },
    close: () => {
      set(undefined)
    },
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function finisher(services: WorktreeServices): (created: CreatedWorktree) => Promise<void> {
  return async (created) => {
    let workspaceId: string
    try {
      workspaceId = (await services.workspaces.create({ path: created.path })).workspaceId
    } catch (error: unknown) {
      throw new Error(`Worktree 已创建在 ${created.path}，但没能加入侧边栏：${messageOf(error)}`, { cause: error })
    }
    try {
      await services.workspaces.rename(workspaceId, created.title)
    } catch (_error: unknown) {
      // The workspace keeps its folder name, which still names the branch; nothing to undo.
    }
    if (created.openSession) services.uiWorkspace.startSession(workspaceId)
    services.contextMenus.notify?.(`${CREATED}${created.branch}`, true)
  }
}

function WorktreeHost({ requests, fetchFn, finish }: HostProps): ReactElement | null {
  const target = useStore(requests)
  const api = useMemo(
    () => (target === undefined ? undefined : createWorktreeApi(fetchFn, target.path)),
    [fetchFn, target],
  )
  if (target === undefined || api === undefined) return null
  return <WorktreeDialog key={target.workspaceId} api={api} onCreated={finish} onClose={requests.close} />
}

function treeProps(services: WorktreeServices, requests: DialogRequests, fetchFn: Fetch, storage: ExpansionStorage) {
  const props: TreeProps = {
    doc: document,
    workspaces: services.workspaces.list,
    sessions: services.sessions.list,
    checkouts: createCheckouts(fetchFn),
    expansion: createExpansion(storage),
    actions: {
      newWorktree: (parent) => {
        requests.open({ workspaceId: parent.workspaceId, path: parent.path, displayTitle: parent.title })
      },
      newSession: (workspaceId) => {
        services.uiWorkspace.startSession(workspaceId)
      },
      openSession: (sessionId) => {
        services.uiWorkspace.openSession(sessionId)
      },
      worktreeMenu: (entry, point) => {
        const value = { workspaceId: entry.workspaceId, path: entry.path, displayTitle: entry.title }
        services.contextMenus.open({ kind: 'workspace', value }, point)
      },
      sessionMenu: (row, point) => {
        services.contextMenus.open({ kind: 'session', value: { sessionId: row.id, displayTitle: row.title } }, point)
      },
    },
  }
  return props
}

/**
 * Add the menu entry, its icon, the dialog and the nested worktree groups once the services
 * are up. They are a separate dependency so that a harness without them still gets the rest
 * of the plugin.
 * @param ctx - the plugin's client context, gated by the feature switch.
 * @param fetchFn - the fetch the dialog and the groups post to the git routes with.
 * @param storage - where the groups remember which rows are open.
 */
export function registerWorktree(ctx: WorktreeContext, fetchFn: Fetch, storage: ExpansionStorage): void {
  ctx.inject(DEPENDENCIES, (child) => {
    const requests = dialogRequests()
    const finish = finisher(child)
    const tree = treeProps(child, requests, fetchFn, storage)
    child.slots.inject(HOST_SLOT, () =>
      child.slots.register(
        { name: HOST_SLOT, id: HOST_ID, inject: (): HostProps => ({ requests, fetchFn, finish }) },
        WorktreeHost,
      ),
    )
    child.slots.inject(HOST_SLOT, () =>
      child.slots.register({ name: HOST_SLOT, id: TREE_ID, inject: () => tree }, WorktreeTree),
    )
    child.slots.inject(ICON_SLOT, () => child.slots.register({ name: ICON_SLOT, key: ICON_KEY }, NewWorktreeIcon))
    child.effect(
      () =>
        child.contextMenus.register({
          id: MENU_ID,
          target: 'workspace',
          order: MENU_ORDER,
          resolve: (target) => [
            {
              id: 'new-worktree',
              label: LABEL,
              icon: { key: ICON_KEY },
              run: () => {
                requests.open(target)
              },
            },
          ],
        }),
      'ccgui: new worktree menu',
    )
    child.effect(() => requests.close, 'ccgui: close worktree dialog')
  })
}
