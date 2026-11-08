/**
 * Open the right sidebar on 工作区文件 instead of the harness's 开始 guide, with 变更 (see
 * changes/) beside it, as CC GUI's panel opens with both tabs and 文件 in front. The harness seeds
 * the guide whenever the column expands empty, and it offers no setting for a different
 * default, so this watches the open tabs and swaps a guide that stands alone in the expanded
 * column for the files page. A guide beside other tabs (from a split or the add control) was
 * asked for and stays, so the other tools remain one step away.
 * @module dsh-ccgui/client/files-default
 */

import { CHANGES_KIND } from './changes/changes-kind.ts'

/** The parts of an observable the sidebar face exposes that this module reads. */
interface Observable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** A sidebar tab, as far as this module needs to tell the guide apart. */
interface SidebarTab {
  readonly id: string
  readonly kind: string
}

/** The parts of the harness's `ctx.sidebarRight` this module uses. */
export interface SidebarFilesFace {
  readonly mounted: Observable<string | undefined>
  readonly openTabs: Observable<unknown>
  tabsIn(sessionId: string): readonly SidebarTab[]
  isExpanded(): boolean
  openTab(kind: string, options?: { replaceTab?: string }): void
  focus(tabId: string): void
}

/** The parts of the harness's `ctx.sidebarRightTabs` this module uses. */
export interface SidebarTabKinds {
  get(kind: string): unknown
}

interface FilesDefaultChild {
  effect(run: () => () => void, label?: string): void
  sidebarRight: SidebarFilesFace
  sidebarRightTabs: SidebarTabKinds
}

/** The parts of the harness's client context this module uses. */
export interface FilesDefaultContext {
  inject(deps: readonly string[], apply: (child: FilesDefaultChild) => void): unknown
}

/** The tab kind the harness seeds into an empty column. */
const GUIDE_KIND = 'guide'
/** The tab kind of the harness's 工作区文件 page. */
const FILES_KIND = 'files'

/**
 * Swap the on-screen session's guide for the files page when the guide is the only tab in an
 * expanded column. Every other layout is left as the user arranged it.
 * @param sidebar - the harness's right sidebar.
 * @param kinds - the harness's tab registry; without a files page the guide stays.
 */
export function replaceSoleGuide(sidebar: SidebarFilesFace, kinds: SidebarTabKinds): void {
  const sessionId = sidebar.mounted.getSnapshot()
  if (sessionId === undefined || !sidebar.isExpanded()) return
  const [only, ...others] = sidebar.tabsIn(sessionId)
  if (only?.kind !== GUIDE_KIND || others.length > 0) return
  // openTab throws for a kind nothing registered, e.g. with the files plugin turned off.
  if (kinds.get(FILES_KIND) === undefined) return
  sidebar.openTab(FILES_KIND, { replaceTab: only.id })
  // 变更 is off when its feature switch is; then the files page stands alone as before.
  if (kinds.get(CHANGES_KIND) === undefined) return
  // Opening a page focuses it, so 文件 is brought back to the front afterwards.
  sidebar.openTab(CHANGES_KIND)
  const files = sidebar.tabsIn(sessionId).find((tab) => tab.kind === FILES_KIND)
  if (files !== undefined) sidebar.focus(files.id)
}

/**
 * Watch the right sidebar once it is up. Both the tab inventory (an expansion seeding the
 * guide) and the on-screen session (switching to a session whose column shows the guide) can
 * bring a sole guide into view.
 * @param ctx - the plugin's client context.
 */
export function registerFilesDefault(ctx: FilesDefaultContext): void {
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], (child) => {
    // The inventory notifies from inside the sidebar store's commit; opening a tab right
    // there would dispatch into that store mid-notification, so the check waits a microtask
    // and reads the state afresh.
    const check = (): void => {
      queueMicrotask(() => {
        replaceSoleGuide(child.sidebarRight, child.sidebarRightTabs)
      })
    }
    child.effect(() => child.sidebarRight.openTabs.subscribe(check), 'ccgui: files by default (tabs)')
    child.effect(() => child.sidebarRight.mounted.subscribe(check), 'ccgui: files by default (session)')
  })
}
