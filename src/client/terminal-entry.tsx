/// <reference lib="dom" />

/**
 * A terminal button in the session header. The harness's terminal lives in the right
 * sidebar, which takes two clicks to reach (expand, then pick it from the guide). This
 * button toggles it in one, the way CC GUI's header terminal button does.
 * @module dsh-ccgui/client/terminal-entry
 */

import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

/** A sidebar tab, as far as this button needs to tell terminals apart. */
export interface TerminalTab {
  readonly id: string
  readonly kind: string
}

/** The parts of the harness's `ctx.sidebarRight` this button uses; all but `tabsIn` act on the on-screen session. */
export interface SidebarTerminalFace {
  tabsIn(sessionId: string): readonly TerminalTab[]
  active(): TerminalTab | undefined
  isExpanded(): boolean
  toggleExpanded(): void
  focus(tabId: string): void
  openTab(kind: string): void
}

interface Slots {
  inject(name: string, add: () => unknown): void
  register(
    options: { name: string; id: string; order?: number; inject(sessionId: string): unknown },
    component: unknown,
  ): unknown
}

/** The parts of the harness's client context this module uses. */
export interface TerminalEntryContext {
  slots: Slots
  inject(
    deps: readonly string[],
    apply: (child: TerminalEntryContext & { sidebarRight: SidebarTerminalFace }) => void,
  ): unknown
}

/** The tab kind the harness's sidebar terminal registers. */
const TERMINAL_KIND = 'terminal'
const SLOT = 'conversation.session.header.utilities'
/** Just left of the header's overflow menu (order 0), right of the schedule chip (-5). */
const ENTRY_ORDER = -1
const ENTRY_CLASS = 'dsh-cli-terminal-entry'
const TOOLTIP_LABEL = '终端'
const ARIA_LABEL = '切换终端'
/** Matches the delay of the neighboring header buttons' tooltips. */
const TOOLTIP_DELAY_MS = 500

// Metrics follow the sidebar's own expand button in the same header row.
export const TERMINAL_ENTRY_STYLES = `
.${ENTRY_CLASS} { flex: none; width: 28px; padding: 0; color: var(--dsw-alias-label-secondary); }
.${ENTRY_CLASS} svg { width: 15px; height: 15px; }
`

/**
 * Show or hide the session's terminal. Hiding collapses the column rather than closing
 * the tab, because closing a terminal tab kills its shell.
 * @param sidebar - the harness's right sidebar.
 * @param sessionId - the session whose header was clicked; it is the one on screen.
 */
export function toggleTerminal(sidebar: SidebarTerminalFace, sessionId: string): void {
  const expanded = sidebar.isExpanded()
  if (expanded && sidebar.active()?.kind === TERMINAL_KIND) {
    sidebar.toggleExpanded()
    return
  }
  const existing = sidebar.tabsIn(sessionId).find((tab) => tab.kind === TERMINAL_KIND)
  if (existing === undefined) {
    // Opening a docked tab expands the column on its own.
    sidebar.openTab(TERMINAL_KIND)
    return
  }
  sidebar.focus(existing.id)
  if (!expanded) sidebar.toggleExpanded()
}

function TerminalGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4L7 8L3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TerminalEntry({ sessionId, sidebar }: { readonly sessionId: string; readonly sidebar: SidebarTerminalFace }) {
  return (
    <Tooltip label={TOOLTIP_LABEL} side="bottom" delayMs={TOOLTIP_DELAY_MS}>
      <Button
        size="sm"
        className={ENTRY_CLASS}
        aria-label={ARIA_LABEL}
        onClick={() => {
          toggleTerminal(sidebar, sessionId)
        }}
      >
        <TerminalGlyph />
      </Button>
    </Tooltip>
  )
}

/**
 * Register the button once the right sidebar is up. It is a separate dependency so that a
 * harness without the sidebar still gets the switcher and the model menu.
 * @param ctx - the plugin's client context.
 */
export function registerTerminalEntry(ctx: TerminalEntryContext): void {
  ctx.inject(['sidebarRight'], (child) => {
    child.slots.inject(SLOT, () =>
      child.slots.register(
        {
          name: SLOT,
          id: 'dsh-ccgui.terminal-entry',
          order: ENTRY_ORDER,
          inject: () => ({ sidebar: child.sidebarRight }),
        },
        TerminalEntry,
      ),
    )
  })
}
