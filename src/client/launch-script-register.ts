/**
 * Puts the startup script control into the session header once the harness's right
 * sidebar and terminals are up. They are separate dependencies so that a harness without
 * a terminal still gets the rest of the plugin.
 * @module dsh-ccgui/client/launch-script-register
 */

import { createScriptBook } from './launch-scripts.ts'
import type { ScriptStorage } from './launch-scripts.ts'
import { createLaunchRunner } from './launch-script-run.ts'
import type { LaunchSidebar, LaunchTerminals } from './launch-script-run.ts'
import { LaunchScriptEntry } from './launch-script-entry.tsx'
import type { CwdList, LaunchEntryProps } from './launch-script-entry.tsx'

interface Slots {
  inject(name: string, add: () => unknown): void
  register(
    options: { name: string; id: string; order?: number; inject(sessionId: string): unknown },
    component: unknown,
  ): unknown
}

/** The parts of the harness's client context this module uses. */
export interface LaunchScriptContext {
  slots: Slots
  inject(
    deps: readonly string[],
    apply: (child: LaunchScriptContext & { sidebarRight: LaunchSidebar; webTerminals: LaunchTerminals }) => void,
  ): unknown
}

const SLOT = 'conversation.session.header.utilities'
/** Left of the terminal button (-1), so the two terminal-related controls sit together. */
const ENTRY_ORDER = -2

/**
 * @param ctx - the plugin's client context.
 * @param list - the harness's session list, which knows each session's working directory.
 * @param storage - where scripts are kept; the browser's localStorage in the harness.
 * @param newId - makes ids for new scripts.
 */
export function registerLaunchScripts(
  ctx: LaunchScriptContext,
  list: CwdList,
  storage: ScriptStorage,
  newId: () => string,
): void {
  ctx.inject(['sidebarRight', 'webTerminals'], (child) => {
    const book = createScriptBook(storage)
    const runner = createLaunchRunner(child.sidebarRight, child.webTerminals)
    child.slots.inject(SLOT, () =>
      child.slots.register(
        {
          name: SLOT,
          id: 'dsh-ccgui.launch-scripts',
          order: ENTRY_ORDER,
          inject: (): Omit<LaunchEntryProps, 'sessionId'> => ({ list, book, runner, newId }),
        },
        LaunchScriptEntry,
      ),
    )
  })
}
