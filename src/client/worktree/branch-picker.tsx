/// <reference lib="dom" />

/**
 * A text field with a searchable list of branches under it. Typing filters the list and is
 * also accepted as is, so a tag or a commit works as a base too; arrow keys and Enter pick
 * from the list without leaving the keyboard.
 * @module dsh-ccgui/client/worktree/branch-picker
 */

import { useId, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { Input, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { WT } from './worktree-styles.ts'

export interface BranchPickerProps {
  readonly id: string
  readonly value: string
  readonly options: readonly string[]
  readonly placeholder: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

/** Enough to scroll through; a narrower query finds the rest. */
const MAX_OPTIONS = 100

/**
 * @param options - every branch.
 * @param query - what is in the field.
 * @returns the branches to list: all of them while the field holds a branch exactly, as it
 * does right after a pick, otherwise those containing the query.
 */
export function matchingBranches(options: readonly string[], query: string): readonly string[] {
  const needle = query.trim().toLowerCase()
  const listed =
    needle === '' || options.includes(query.trim())
      ? options
      : options.filter((name) => name.toLowerCase().includes(needle))
  return listed.slice(0, MAX_OPTIONS)
}

function usePickerKeys(matches: readonly string[], choose: (name: string) => void) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(open ? (active + step + matches.length) % Math.max(matches.length, 1) : 0)
      setOpen(true)
    } else if (event.key === 'Enter' && open && matches[active] !== undefined) {
      event.preventDefault()
      choose(matches[active])
      setOpen(false)
    } else if (event.key === 'Escape' && open) {
      // Close the list, not the dialog around it.
      event.stopPropagation()
      setOpen(false)
    }
  }
  return { open, setOpen, active, setActive, onKeyDown }
}

function BranchOptions(props: {
  readonly id: string
  readonly matches: readonly string[]
  readonly active: number
  readonly onPick: (name: string) => void
}) {
  return (
    <MenuSurface id={props.id} role="listbox" className={WT.options}>
      {props.matches.map((name, index) => (
        <div
          key={name}
          role="option"
          aria-selected={index === props.active}
          className={WT.option}
          title={name}
          // mousedown, before the field's blur closes the list.
          onMouseDown={(event) => {
            event.preventDefault()
            props.onPick(name)
          }}
        >
          {name}
        </div>
      ))}
    </MenuSurface>
  )
}

/**
 * @param props - the field's value, the branches to offer, and where changes go.
 * @returns the field.
 */
export function BranchPicker(props: BranchPickerProps): ReactElement {
  const { id, value, options, placeholder, disabled, onChange } = props
  const listId = useId()
  const matches = matchingBranches(options, value)
  const keys = usePickerKeys(matches, onChange)
  const shown = keys.open && matches.length > 0
  return (
    <div className={WT.picker}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
          keys.setOpen(true)
          keys.setActive(0)
        }}
        onFocus={() => {
          keys.setOpen(true)
        }}
        onBlur={() => {
          keys.setOpen(false)
        }}
        onKeyDown={keys.onKeyDown}
      />
      {shown ? (
        <BranchOptions
          id={listId}
          matches={matches}
          active={keys.active}
          onPick={(name) => {
            onChange(name)
            keys.setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
