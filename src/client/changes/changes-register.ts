/**
 * Register the 变更 page as a right-sidebar tab type: the type in the harness's tab registry
 * (with an entry on the guide page), its body in the keyed tab seat, and its chip title.
 * @module dsh-ccgui/client/changes/changes-register
 */

import type { Fetch } from './changes-api.ts'
import { CHANGES_KIND } from './changes-kind.ts'
import { ChangesPanel } from './changes-panel.tsx'
import type { ChangesPanelProps, CwdList } from './changes-panel.tsx'
import { CHANGES_TITLE, ChangesTitle } from './changes-title.tsx'

/** This implementation's identity, which is also its key in the tab seat. */
const CHANGES_ID = 'dsh-ccgui.changes'
const TAB_SLOT = 'sidebar.right.pane.tab'
const TITLE_SLOT = 'sidebar.right.pane.tab.title'
const TITLE = CHANGES_TITLE
const DESCRIPTION = '查看、暂存并提交工作区的 Git 变更'
/** After the harness's own entries on the guide page. */
const GUIDE_ORDER = 70

interface TabDefinition {
  readonly id: string
  readonly kind: string
  readonly title: (address: string) => string
  readonly guide?: readonly { id: string; order: number; title: () => string; description: () => string }[]
}

interface ChangesChild {
  effect(run: () => () => void, label?: string): void
  sidebarRightTabs: { register(definition: TabDefinition): () => void }
  slots: {
    inject(name: string, add: () => unknown): void
    register(
      options: { name: string; key: string; inject?(sessionId: string): ChangesPanelProps },
      component: unknown,
    ): unknown
  }
}

/** The parts of the harness's client context this module uses. */
export interface ChangesContext {
  inject(deps: readonly string[], apply: (child: ChangesChild) => void): unknown
}

/**
 * Add the 变更 tab type.
 * @param ctx - the plugin's client context, gated by the feature switch.
 * @param list - the session list, for each session's working directory.
 * @param fetchFn - the fetch the panel posts to the git routes with.
 */
export function registerChanges(ctx: ChangesContext, list: CwdList, fetchFn: Fetch): void {
  ctx.inject(['sidebarRightTabs', 'slots'], (child) => {
    child.effect(
      () =>
        child.sidebarRightTabs.register({
          id: CHANGES_ID,
          kind: CHANGES_KIND,
          title: () => TITLE,
          guide: [{ id: 'open', order: GUIDE_ORDER, title: () => TITLE, description: () => DESCRIPTION }],
        }),
      'ccgui: changes tab type',
    )
    child.slots.inject(TAB_SLOT, () =>
      child.slots.register(
        { name: TAB_SLOT, key: CHANGES_ID, inject: (sessionId) => ({ sessionId, list, fetch: fetchFn }) },
        ChangesPanel,
      ),
    )
    child.slots.inject(TITLE_SLOT, () => child.slots.register({ name: TITLE_SLOT, key: CHANGES_ID }, ChangesTitle))
  })
}
