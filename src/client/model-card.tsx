/// <reference lib="dom" />

/**
 * The open menu of a CLI's models: the search field, the rows and the card around them.
 * @module dsh-ccgui/client/model-card
 */

import type { CSSProperties, ReactElement, RefObject } from 'react'
import { IconCheckOutlineRegular, Input, MenuSurface, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CliModels, DirectoryModel, DirectorySelection } from './choices.ts'
import {
  HINT_CLASS,
  MENU_CLASS,
  ROW_ACTIVE_CLASS,
  ROW_CHECK_CLASS,
  ROW_CLASS,
  ROW_NAME_CLASS,
  ROWS_CLASS,
  SEARCH_CLASS,
  SEARCH_INPUT_CLASS,
} from './model-menu-styles.ts'

/** The harness's seat offers search from the same size, so the two menus agree. */
export const SEARCH_ABOVE = 4
const MENU_LABEL = '模型'
const SEARCH_LABEL = '搜索模型…'
const NO_MATCH_LABEL = '没有匹配的模型。'

interface ModelRowProps {
  readonly domId: string
  readonly model: DirectoryModel
  readonly selected: boolean
  readonly settling: boolean
  readonly active: boolean
  readonly busy: boolean
  readonly onHover: () => void
  readonly onChoose: () => void
}

function ModelRow({ domId, model, selected, settling, active, busy, onHover, onChoose }: ModelRowProps): ReactElement {
  const check = selected ? <IconCheckOutlineRegular /> : null
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      id={domId}
      tabIndex={-1}
      title={model.name}
      className={active ? `${ROW_CLASS} ${ROW_ACTIVE_CLASS}` : ROW_CLASS}
      disabled={busy}
      onMouseMove={active || busy ? undefined : onHover}
      onClick={onChoose}
    >
      <span className={ROW_NAME_CLASS}>{model.name}</span>
      <span className={ROW_CHECK_CLASS}>{settling ? <StateDot state="ongoing" /> : check}</span>
    </button>
  )
}

export interface ModelCardProps {
  readonly id: string
  readonly models: CliModels
  readonly visible: readonly DirectoryModel[]
  readonly active: number
  readonly pending: DirectorySelection | null
  readonly query: string
  readonly anchorStyle: CSSProperties
  readonly cardRef: RefObject<HTMLDivElement>
  readonly searchRef: RefObject<HTMLInputElement>
  readonly onQuery: (query: string) => void
  readonly onHighlight: (index: number) => void
  readonly onChoose: (modelId: string) => void
}

interface ModelSearchProps {
  readonly id: string
  readonly active: number
  readonly query: string
  readonly busy: boolean
  readonly searchRef: RefObject<HTMLInputElement>
  readonly onQuery: (query: string) => void
}

function ModelSearch({ id, active, query, busy, searchRef, onQuery }: ModelSearchProps): ReactElement {
  return (
    <div className={SEARCH_CLASS}>
      <Input
        ref={searchRef}
        className={SEARCH_INPUT_CLASS}
        type="text"
        role="searchbox"
        aria-label={SEARCH_LABEL}
        aria-controls={`${id}-rows`}
        aria-activedescendant={active < 0 ? undefined : `${id}-model-${active}`}
        placeholder={SEARCH_LABEL}
        value={query}
        readOnly={busy}
        onChange={(event) => {
          onQuery(event.target.value)
        }}
      />
    </div>
  )
}

type ModelRowsProps = Pick<
  ModelCardProps,
  'id' | 'models' | 'visible' | 'active' | 'pending' | 'onHighlight' | 'onChoose'
>

function ModelRows({ id, models, visible, active, pending, onHighlight, onChoose }: ModelRowsProps): ReactElement {
  return (
    <div id={`${id}-rows`} className={`${ROWS_CLASS} scrollable`} role="menu" aria-label={MENU_LABEL}>
      {visible.map((model, index) => (
        <ModelRow
          key={model.id}
          domId={`${id}-model-${index}`}
          model={model}
          selected={model.id === models.currentId}
          settling={pending?.provider === models.provider && pending.model === model.id}
          active={index === active}
          busy={pending !== null}
          onHover={() => {
            onHighlight(index)
          }}
          onChoose={() => {
            onChoose(model.id)
          }}
        />
      ))}
    </div>
  )
}

/**
 * Render the open menu.
 * @param props - the rows to show and what to do with them.
 * @returns the menu surface.
 */
export function ModelCard(props: ModelCardProps): ReactElement {
  const {
    id,
    models,
    visible,
    active,
    pending,
    query,
    anchorStyle,
    cardRef,
    searchRef,
    onQuery,
    onHighlight,
    onChoose,
  } = props
  const busy = pending !== null
  return (
    <MenuSurface
      ref={cardRef}
      id={`${id}-menu`}
      className={MENU_CLASS}
      style={anchorStyle}
      role="group"
      aria-label={models.name}
    >
      {models.rows.length > SEARCH_ABOVE && (
        <ModelSearch id={id} active={active} query={query} busy={busy} searchRef={searchRef} onQuery={onQuery} />
      )}
      <ModelRows {...{ id, models, visible, active, pending, onHighlight, onChoose }} />
      {visible.length === 0 && (
        <div className={HINT_CLASS} role="status">
          {NO_MATCH_LABEL}
        </div>
      )}
      {!models.listed && <div className={HINT_CLASS} role="status">{`还没有读到 ${models.name} 的模型列表`}</div>}
    </MenuSurface>
  )
}
