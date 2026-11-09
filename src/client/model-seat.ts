/// <reference lib="dom" />

/**
 * The state and behavior behind the model control: opening and closing, the highlight,
 * the keyboard, focus, and choosing a model.
 * @module dsh-ccgui/client/model-seat
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MutableRefObject, RefObject } from 'react'
import { isMobileDevice, observeComposition, rankByName } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectorySelection } from './choices.ts'
import { isRow, rowCount } from './menu-models.ts'
import type { MenuModels, MenuRow, MenuSection } from './menu-models.ts'
import { SEARCH_ABOVE } from './model-card.tsx'

const UNKNOWN_ERROR_LABEL = '未知错误'

/** Asks the host to move the session to another model. */
export type SelectModel = (selection: DirectorySelection) => Promise<{ error?: { message?: string } }>

type KeyAction = 'close' | 'choose' | 1 | -1

/** The keys mean what they mean in the composer: Tab settles and Shift+Tab leaves. */
function keyAction({ key, shiftKey }: KeyboardEvent): KeyAction | undefined {
  if (key === 'Escape' || (key === 'Tab' && shiftKey)) return 'close'
  if (key === 'Enter' || key === 'Tab') return 'choose'
  if (key === 'ArrowDown') return 1
  return key === 'ArrowUp' ? -1 : undefined
}

function useCloseOnOutsidePress(open: boolean, inside: readonly RefObject<HTMLElement>[], close: () => void): void {
  useEffect(() => {
    if (!open) return undefined
    const onPress = (event: MouseEvent): void => {
      if (!inside.some((ref) => ref.current?.contains(event.target as Node) === true)) close()
    }
    document.addEventListener('mousedown', onPress)
    return () => {
      document.removeEventListener('mousedown', onPress)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close and inside are new every render; listing them would rebind the listener each time
  }, [open])
}

/** Search ranks within each provider, as the harness's menu does, and drops emptied sections. */
function useMatchingRows(models: MenuModels, query: string, highlight: number | null) {
  const searchable = rowCount(models.sections) > SEARCH_ABOVE
  const sections: readonly MenuSection[] = useMemo(
    () =>
      models.sections
        .map((section) => ({ ...section, rows: rankByName(section.rows, searchable ? query.trim() : '') }))
        .filter((section) => section.rows.length > 0),
    [models.sections, searchable, query],
  )
  const visible = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const currentIndex = visible.findIndex((row) => isRow(row, models.current))
  const active = Math.min(highlight ?? Math.max(0, currentIndex), visible.length - 1)
  return { searchable, sections, visible, active }
}

/** The search field keeps the keyboard while the arrows move the highlight through the rows. */
function useMenuFocus(
  open: boolean,
  searchable: boolean,
  activeRowId: string,
  searchRef: RefObject<HTMLInputElement>,
): void {
  useEffect(() => {
    if (open && searchable && !isMobileDevice()) searchRef.current?.focus()
  }, [open, searchable, searchRef])
  useLayoutEffect(() => {
    if (open) document.getElementById(activeRowId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeRowId])
}

/** Safari sends the Enter that commits pinyin after composition ends, not flagged as composing. */
function useCompositionGuard(): (event: globalThis.KeyboardEvent) => boolean {
  const composition = useRef<ReturnType<typeof observeComposition>>()
  useEffect(() => {
    const observed = observeComposition(document)
    composition.current = observed
    return () => {
      observed.dispose()
    }
  }, [])
  return (event) => composition.current?.guards(event) ?? false
}

interface ModelFailure {
  /** Gives each failure a toast of its own, with its own time on screen. */
  readonly seq: number
  readonly text: string
}

interface ChooseOptions {
  readonly models: MenuModels
  readonly select: SelectModel
  readonly triggerRef: RefObject<HTMLButtonElement>
  readonly searchRef: RefObject<HTMLInputElement>
  /** Counts closings, so a late answer can tell the menu it was asked from has gone. */
  readonly closings: MutableRefObject<number>
  readonly close: (restoreFocus: boolean) => void
}

function useChooseModel({ models, select, triggerRef, searchRef, closings, close }: ChooseOptions) {
  const [failure, setFailure] = useState<ModelFailure | undefined>()
  // A selection hands focus back to the trigger, which should not light up its ring for it.
  const [settled, setSettled] = useState(false)
  const fail = (text: string): void => {
    setFailure((previous) => ({ seq: (previous?.seq ?? 0) + 1, text }))
    if (!isMobileDevice()) searchRef.current?.focus()
  }
  const choose = (row: MenuRow): void => {
    setSettled(true)
    if (isRow(row, models.current)) {
      close(true)
      return
    }
    const asked = closings.current
    // The rows disable while this settles, and a disabled row cannot keep the keyboard.
    triggerRef.current?.focus()
    select({ provider: row.provider, model: row.model }).then(
      (result) => {
        if (result.error !== undefined) fail(result.error.message ?? UNKNOWN_ERROR_LABEL)
        // Someone who moved on while this was out keeps their focus, and any menu reopened since.
        else if (closings.current === asked) close(true)
      },
      (reason: unknown) => {
        fail(String(reason))
      },
    )
  }
  return {
    failure,
    clearFailure: () => {
      setFailure(undefined)
    },
    settled,
    setSettled,
    choose,
  }
}

/** Focus moving anywhere outside these elements closes the menu. */
function closeOnBlurOutside(
  inside: readonly RefObject<HTMLElement>[],
  close: () => void,
): (event: { relatedTarget: EventTarget | null }) => void {
  return ({ relatedTarget }) => {
    const staysInside =
      relatedTarget instanceof Node && inside.some((ref) => ref.current?.contains(relatedTarget) === true)
    if (!staysInside) close()
  }
}

/** What the model control is drawn from. */
export interface ModelSeatProps {
  readonly models: MenuModels
  readonly pending: DirectorySelection | null
  readonly locked: boolean
  readonly load: () => void
  readonly select: SelectModel
}

/** Open state, search text and highlight, which a close resets together. */
function useMenuState(triggerRef: RefObject<HTMLButtonElement>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<number | null>(null)
  const closings = useRef(0)
  const close = (restoreFocus = false): void => {
    closings.current += 1
    setOpen(false)
    setQuery('')
    setHighlight(null)
    if (restoreFocus)
      queueMicrotask(() => {
        triggerRef.current?.focus()
      })
  }
  return { open, setOpen, query, setQuery, highlight, setHighlight, closings, close }
}

function useSeatRefs() {
  return {
    rootRef: useRef<HTMLDivElement>(null),
    triggerRef: useRef<HTMLButtonElement>(null),
    cardRef: useRef<HTMLDivElement>(null),
    searchRef: useRef<HTMLInputElement>(null),
  }
}

/**
 * Everything the control's markup binds to.
 * @param props - the models, the pending selection and the host's actions.
 * @returns refs, state and handlers for the trigger and the card.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- the shape is whatever the markup binds to; spelling it out would duplicate every field
export function useModelSeat({ models, pending, locked, load, select }: ModelSeatProps) {
  const refs = useSeatRefs()
  const { rootRef, triggerRef, cardRef, searchRef } = refs
  const { open, setOpen, query, setQuery, highlight, setHighlight, closings, close } = useMenuState(triggerRef)
  const id = useId()
  const showing = open && !locked
  const { searchable, sections, visible, active } = useMatchingRows(models, query, highlight)
  const composing = useCompositionGuard()

  const choosing = useChooseModel({ models, select, triggerRef, searchRef, closings, close })
  useCloseOnOutsidePress(showing, [rootRef, cardRef], close)
  useMenuFocus(showing, searchable, `${id}-model-${active}`, searchRef)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!showing || composing(event.nativeEvent)) return
    const action = keyAction(event)
    if (action === undefined) return
    event.preventDefault()
    const row = visible[active]
    if (action === 'close') close(true)
    else if (pending !== null || row === undefined) return
    else if (action === 'choose') choosing.choose(row)
    else setHighlight((active + action + visible.length) % visible.length)
  }

  const onBlur = closeOnBlurOutside([rootRef, cardRef], () => {
    close()
  })

  const toggle = (): void => {
    if (open) {
      close(true)
      return
    }
    choosing.setSettled(false)
    triggerRef.current?.focus()
    setOpen(true)
    load()
  }

  return {
    id,
    showing,
    query,
    setQuery,
    setHighlight,
    sections,
    active,
    ...refs,
    onKeyDown,
    onBlur,
    toggle,
    ...choosing,
  }
}
