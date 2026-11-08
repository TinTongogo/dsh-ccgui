/// <reference lib="dom" />

/**
 * Keeps a session row's CLI mark visible while the row shows a status, after desktop-cc-gui's
 * sidebar: the mark stays in front and a small dot follows it, breathing blue while a turn
 * runs instead of the harness's spinner. The harness renders its leading slot only while a
 * row is idle, so the mark in that slot vanishes exactly when a status takes the cell. This
 * component sits in the trailing slot, which every non-blank row renders, and portals the
 * mark into the leading cell; the stylesheet shows it only beside a status dot.
 * @module dsh-ccgui/client/session-status-mark
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { ProviderMark } from './marks.tsx'
import { providerOfSession } from './provider-marks.ts'
import type { SessionRowValues } from './provider-marks.ts'
import type { Store } from './store.ts'

export type SessionList = Store<{ byId: Readonly<Record<string, SessionRowValues | undefined>> }>

/** Rendered by every row that has a first prompt, whatever its status. */
export const SESSION_STATUS_SLOT = 'sidebar.session.row.trailing'
export const SESSION_STATUS_MARK_CLASS = 'dsh-cli-status-mark'

const ROW = '[data-row-key^="session:"]'
// The leading cell's CSS module class carries a per-build hash; its name is the stable part.
const LEADING_CELL = ':scope > [class*="_slot"]'
const MARK_SIZE = 14
/** desktop-cc-gui's --color-status-streaming and its heartbeat, see its globals.css. */
const STREAMING_COLOR = '#2f80ed'
const DOT_SIZE = '6px'
const MARK_GAP = '6px'
const HEARTBEAT = 'dsh-cli-status-heartbeat'
const HEARTBEAT_PERIOD = '0.92s'

/**
 * Follow which provider a session row is on.
 * @param list - the harness's session list.
 * @param sessionId - the row's session.
 * @returns the provider route, or undefined while the row names none.
 */
export function useSessionProvider(list: SessionList, sessionId: string): string | undefined {
  // Stable, because every row would otherwise resubscribe on each render of the list.
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list])
  return useSyncExternalStore(subscribe, () => providerOfSession(list.getSnapshot().byId[sessionId]))
}

function leadingCellOf(anchor: Element | null): Element | null {
  return anchor?.closest(ROW)?.querySelector(LEADING_CELL) ?? null
}

/**
 * The trailing-slot entry: an invisible anchor that finds its row, plus the mark it portals
 * into that row's leading cell. Outside a session row it draws nothing.
 * @param props.sessionId - the row's session.
 * @param props.list - the harness's session list.
 * @returns the anchor and, once the cell is found, the portaled mark.
 */
export function SessionStatusMark({
  sessionId,
  list,
}: {
  readonly sessionId: string
  readonly list: SessionList
}): ReactElement {
  const provider = useSessionProvider(list, sessionId)
  const [cell, setCell] = useState<Element | null>(null)
  const anchor = useCallback((node: HTMLSpanElement | null) => {
    setCell(leadingCellOf(node))
  }, [])
  return (
    <>
      <span ref={anchor} hidden />
      {cell === null || provider === undefined
        ? null
        : createPortal(
            <span className={SESSION_STATUS_MARK_CLASS}>
              <ProviderMark provider={provider} size={MARK_SIZE} />
            </span>,
            cell,
          )}
    </>
  )
}

// The harness's StateDot carries `data-state`; the leading cell holds it only while a status
// shows, and holds the leading slot instead while idle, where the slot's own mark is drawn.
// Chained `:has()` rather than nested, which would be invalid and drop the rule.
const CELL = `${ROW} > :has(> .${SESSION_STATUS_MARK_CLASS})`
const STATUS_CELL = `${CELL}:has(> [data-state])`

export const SESSION_STATUS_STYLES = `
.${SESSION_STATUS_MARK_CLASS} { display: none; order: -1; color: var(--dsw-alias-label-secondary); }
${STATUS_CELL} { width: auto; gap: ${MARK_GAP}; }
${STATUS_CELL} > .${SESSION_STATUS_MARK_CLASS} { display: inline-flex; }
${STATUS_CELL} > [data-state] { width: ${DOT_SIZE} !important; height: ${DOT_SIZE} !important; }
${STATUS_CELL} > svg[data-state="ongoing"] {
  border-radius: 50%;
  background: ${STREAMING_COLOR};
  box-shadow: 0 0 0 4px color-mix(in srgb, ${STREAMING_COLOR} 18%, transparent);
  overflow: visible;
  animation: ${HEARTBEAT} ${HEARTBEAT_PERIOD} ease-in-out infinite;
}
${STATUS_CELL} > svg[data-state="ongoing"] > * { display: none; }
@keyframes ${HEARTBEAT} {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.65; }
}
@media (prefers-reduced-motion: reduce) {
  ${STATUS_CELL} > svg[data-state="ongoing"] { animation: none; }
}
`
