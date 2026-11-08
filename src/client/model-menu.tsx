/// <reference lib="dom" />

/**
 * The composer's model control while a session is on a CLI: one flat list of that CLI's
 * models. The harness's seat is a two-level menu of every provider, and a CLI cannot follow
 * a conversation to another provider, so that seat steps aside for this control. It comes
 * back whenever the session is on anything else, where its effort levels still apply.
 * @module dsh-ccgui/client/model-menu
 */

import { useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDownOutlineRegular,
  IconDataOutlineRegular,
  IconWarningOutlineRegular,
  StateDot,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { cliModels } from './choices.ts'
import type { CliModels, DirectorySelection, DirectoryState } from './choices.ts'
import { ModelCard } from './model-card.tsx'
import { CHEVRON_CLASS, ICON_CLASS, LABEL_CLASS, ROOT_CLASS, TRIGGER_CLASS } from './model-menu-styles.ts'
import { useModelSeat } from './model-seat.ts'
import type { ModelSeatProps, SelectModel } from './model-seat.ts'
import { useStore } from './store.ts'
import type { Store } from './store.ts'

const NO_MODEL_LABEL = '请选择模型'

/** What the slot hands this control for one session. */
export interface ModelMenuInjected {
  /** False for an addressed subagent, which cannot select a model. */
  available: boolean
  directory: Store<DirectoryState>
  load: () => void
  select: SelectModel
  session: Store<{ removed?: boolean }> | undefined
}

/**
 * Only the search field may take focus. Losing it to anything else in the menu would close
 * the menu, and WebKit would blur a focused row before its click.
 */
function keepFocus(event: ReactMouseEvent<HTMLDivElement>): void {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
}

type Seat = ReturnType<typeof useModelSeat>

interface ModelTriggerProps {
  readonly seat: Seat
  readonly models: CliModels
  readonly pending: DirectorySelection | null
  readonly locked: boolean
  readonly label: string
  readonly anchorStyle: CSSProperties
}

function ModelTrigger({ seat, models, pending, locked, label, anchorStyle }: ModelTriggerProps): ReactElement {
  const { id, showing } = seat
  return (
    <button
      ref={seat.triggerRef}
      type="button"
      className={TRIGGER_CLASS}
      style={anchorStyle}
      aria-label={models.currentName === undefined ? NO_MODEL_LABEL : `选择模型，当前 ${label}`}
      aria-haspopup="menu"
      aria-expanded={showing}
      aria-controls={showing ? `${id}-menu` : undefined}
      aria-busy={pending !== null}
      title={label}
      data-selection-focus={seat.settled ? '' : undefined}
      disabled={locked}
      onBlur={() => {
        seat.setSettled(false)
      }}
      onClick={seat.toggle}
    >
      <IconDataOutlineRegular className={ICON_CLASS} size={16} />
      <span className={LABEL_CLASS}>{label}</span>
      {pending === null ? (
        <IconChevronDownOutlineRegular className={CHEVRON_CLASS} size={14} />
      ) : (
        <StateDot state="ongoing" />
      )}
    </button>
  )
}

function ModelSeat(props: ModelSeatProps): ReactElement {
  const { models, pending, locked } = props
  const seat = useModelSeat(props)
  const { id, showing, rootRef } = seat
  const anchorStyle = { '--dsh-cli-model-anchor': `--dsh-cli-model-${id.replaceAll(':', '')}` } as CSSProperties
  const label = models.currentName ?? NO_MODEL_LABEL
  return (
    <div ref={rootRef} className={ROOT_CLASS} onKeyDown={seat.onKeyDown} onBlur={seat.onBlur} onMouseDown={keepFocus}>
      <ModelTrigger
        seat={seat}
        models={models}
        pending={pending}
        locked={locked}
        label={label}
        anchorStyle={anchorStyle}
      />
      {showing &&
        createPortal(
          <ModelCard
            id={id}
            models={models}
            visible={seat.visible}
            active={seat.active}
            pending={pending}
            query={seat.query}
            anchorStyle={anchorStyle}
            cardRef={seat.cardRef}
            searchRef={seat.searchRef}
            onQuery={(next) => {
              seat.setQuery(next)
              seat.setHighlight(0)
            }}
            onHighlight={seat.setHighlight}
            onChoose={seat.choose}
          />,
          document.body,
        )}
      {seat.failure !== undefined && (
        <Toast
          key={seat.failure.seq}
          text={`切换模型失败：${seat.failure.text}`}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={seat.clearFailure}
        />
      )}
    </div>
  )
}

function useRemoved(session: ModelMenuInjected['session']): boolean {
  return useSyncExternalStore(
    (listener) =>
      session?.subscribe(listener) ??
      (() => {
        /* no session, nothing to unsubscribe */
      }),
    () => session?.getSnapshot().removed === true,
  )
}

/**
 * Render the control, or nothing when the session is not on a CLI.
 * @param props - what the slot injected.
 * @returns the trigger and, while open, the list.
 */
export function CliModelMenu({ available, directory, load, select, session }: ModelMenuInjected): ReactElement | null {
  const state = useStore(directory)
  const locked = useRemoved(session)
  const models = available ? cliModels(state) : undefined
  if (models === undefined) return null
  return <ModelSeat models={models} pending={state.pending ?? null} locked={locked} load={load} select={select} />
}
