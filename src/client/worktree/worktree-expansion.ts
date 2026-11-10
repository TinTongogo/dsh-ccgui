/**
 * Which 「Worktrees」 groups and worktree rows the user opened or closed, remembered across
 * restarts the way the harness remembers its own workspace rows. Only explicit choices are
 * kept: without one, a row is open exactly when it holds the session on screen, so a session
 * opened in a worktree is never hidden inside a closed group.
 * @module dsh-ccgui/client/worktree/worktree-expansion
 */

import type { Store } from '../store.ts'

export type ExpansionKind = 'groups' | 'worktrees'

type Choices = Readonly<Record<string, boolean>>

export type Expansion = Readonly<Record<ExpansionKind, Choices>>

/** The parts of `window.localStorage` used here, so tests can hand in a plain map. */
export interface ExpansionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ExpansionStore extends Store<Expansion> {
  readonly set: (kind: ExpansionKind, id: string, open: boolean) => void
}

export const EXPANSION_STORAGE_KEY = 'dsh-ccgui.worktree-expansion'

const NO_CHOICES: Expansion = { groups: {}, worktrees: {} }

function choicesOf(value: unknown): Choices {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  )
}

/**
 * @param raw - the stored JSON, or null when nothing is stored.
 * @returns the choices; anything malformed counts as no choice.
 */
export function parseExpansion(raw: string | null): Expansion {
  if (raw === null) return NO_CHOICES
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return NO_CHOICES
    return { groups: choicesOf(Reflect.get(value, 'groups')), worktrees: choicesOf(Reflect.get(value, 'worktrees')) }
  } catch (_error: unknown) {
    // A corrupt entry only costs the user which rows were open.
    return NO_CHOICES
  }
}

function read(storage: ExpansionStorage): Expansion {
  try {
    return parseExpansion(storage.getItem(EXPANSION_STORAGE_KEY))
  } catch (_error: unknown) {
    // Storage can be blocked; starting without choices is harmless.
    return NO_CHOICES
  }
}

/**
 * @param expansion - the choices.
 * @param kind - groups or worktree rows.
 * @param id - the workspace the row stands for.
 * @param fallback - whether the row is open without a choice.
 * @returns whether the row is open.
 */
export function isOpen(expansion: Expansion, kind: ExpansionKind, id: string, fallback: boolean): boolean {
  return expansion[kind][id] ?? fallback
}

/**
 * @param storage - where the choices are kept; the browser's localStorage in the harness.
 * @returns the store, loaded from storage.
 */
export function createExpansion(storage: ExpansionStorage): ExpansionStore {
  let state = read(storage)
  let listeners: readonly (() => void)[] = []
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    set: (kind, id, open) => {
      if (state[kind][id] === open) return
      state = { ...state, [kind]: { ...state[kind], [id]: open } }
      try {
        storage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(state))
      } catch (_error: unknown) {
        // The rows still open and close for this run; only remembering it is lost.
      }
      for (const listener of listeners) listener()
    },
  }
}
