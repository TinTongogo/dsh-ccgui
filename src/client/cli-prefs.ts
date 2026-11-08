/**
 * The user's order for the composer's CLI switcher and which providers it leaves out, edited
 * on the settings page. The harness only lists providers per session, so the switcher reports
 * the ones it sees and they are kept here; that is how the settings page knows what to list
 * even when no session is open. A provider the switcher stops reporting is forgotten, so a CLI
 * taken out of the plugin's configuration leaves the settings page with it.
 * @module dsh-ccgui/client/cli-prefs
 */

import { cliRoute } from '../constants.ts'
import type { Store } from './store.ts'

/** A provider as the switcher lists it. */
export interface CliChoice {
  readonly id: string
  readonly label: string
}

/** A provider as the settings page lists it. */
export interface CliEntry extends CliChoice {
  readonly enabled: boolean
}

export interface CliPrefsSnapshot {
  /** The providers the switcher currently offers, in the order first seen. */
  readonly known: readonly CliChoice[]
  /** Ids in the user's order; providers missing here follow in the directory's order. */
  readonly order: readonly string[]
  /** Ids left out of the switcher; kept for a provider that is not offered right now. */
  readonly hidden: readonly string[]
}

/** The parts of `window.localStorage` used here, so tests can hand in a plain map. */
export interface CliPrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface CliPrefs extends Store<CliPrefsSnapshot> {
  /** Record the providers a switcher was given, forgetting those it no longer offers. */
  remember(choices: readonly CliChoice[]): void
  /** Move a provider one place up (-1) or down (1) in the settings list. */
  move(id: string, delta: -1 | 1): void
  setEnabled(id: string, enabled: boolean): void
}

export const CLI_PREFS_STORAGE_KEY = 'dsh-ccgui.cli-prefs'

/**
 * The harness's own model route. The switcher always lists it, so the settings page cannot
 * offer a way to turn it off and stored preferences that hid it are ignored.
 */
export const OFFICIAL_PROVIDER_ID = 'deepseek-official'

/**
 * CLIs that start out of the switcher. CodeBuddy is bundled but not yet verified with a real
 * account, so users only get it once they turn it on in settings; the backend still runs it.
 * Applied when a provider is first seen, so a user's later choice is never overridden.
 */
const HIDDEN_BY_DEFAULT: ReadonlySet<string> = new Set([cliRoute('codebuddy')])

const EMPTY: CliPrefsSnapshot = { known: [], order: [], hidden: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function choices(value: unknown): readonly CliChoice[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) =>
    isRecord(item) && typeof item.id === 'string' && typeof item.label === 'string'
      ? [{ id: item.id, label: item.label }]
      : [],
  )
}

/**
 * Read stored preferences, keeping only well-formed fields.
 * @param raw - the stored JSON, or null when nothing is stored.
 * @returns the preferences; empty ones change nothing about the switcher.
 */
export function parseCliPrefs(raw: string | null): CliPrefsSnapshot {
  if (raw === null) return EMPTY
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (_error: unknown) {
    // A corrupt entry should cost the user their order, not the plugin's start.
    return EMPTY
  }
  if (!isRecord(value)) return EMPTY
  return {
    known: choices(value.known),
    order: strings(value.order),
    hidden: strings(value.hidden).filter((id) => id !== OFFICIAL_PROVIDER_ID),
  }
}

function sortByOrder<T extends CliChoice>(items: readonly T[], order: readonly string[]): readonly T[] {
  // Unordered items rank after ordered ones; the stable sort keeps their directory order.
  const rank = (id: string): number => {
    const index = order.indexOf(id)
    return index === -1 ? order.length : index
  }
  return [...items].sort((a, b) => rank(a.id) - rank(b.id))
}

/**
 * Apply the preferences to what a switcher would list.
 * @param items - the directory's providers, in its order.
 * @param prefs - the preferences.
 * @returns the providers to show, in the user's order.
 */
export function arrangeChoices<T extends CliChoice>(items: readonly T[], prefs: CliPrefsSnapshot): readonly T[] {
  return sortByOrder(
    items.filter((item) => item.id === OFFICIAL_PROVIDER_ID || !prefs.hidden.includes(item.id)),
    prefs.order,
  )
}

/**
 * @param prefs - the preferences.
 * @returns every offered provider in the user's order, with whether the switcher shows it.
 */
export function listedEntries(prefs: CliPrefsSnapshot): readonly CliEntry[] {
  return sortByOrder(prefs.known, prefs.order).map((choice) => ({
    ...choice,
    enabled: choice.id === OFFICIAL_PROVIDER_ID || !prefs.hidden.includes(choice.id),
  }))
}

function rememberChoices(prefs: CliPrefsSnapshot, seen: readonly CliChoice[]): CliPrefsSnapshot {
  // A switcher renders before the harness has listed any provider. An empty report cannot
  // tell "this deployment has none" from "not loaded yet", so it must not clear the list.
  if (seen.length === 0) return prefs
  const offered = new Set(seen.map((choice) => choice.id))
  // A CLI removed from the plugin's agents keeps no row in settings. Its order and hidden
  // choice stay stored, so putting it back restores what the user had set before.
  const known = prefs.known.filter((choice) => offered.has(choice.id))
  const renamed = known.map((choice) => seen.find((candidate) => candidate.id === choice.id) ?? choice)
  const added = seen.filter((choice) => !known.some((candidate) => candidate.id === choice.id))
  const dropped = known.length !== prefs.known.length
  const relabelled = renamed.some((choice, index) => choice.label !== prefs.known[index]?.label)
  if (!dropped && added.length === 0 && !relabelled) return prefs
  const startHidden = added.filter((choice) => HIDDEN_BY_DEFAULT.has(choice.id)).map((choice) => choice.id)
  const hidden = [...prefs.hidden, ...startHidden.filter((id) => !prefs.hidden.includes(id))]
  return { ...prefs, known: [...renamed, ...added], hidden }
}

function moveChoice(prefs: CliPrefsSnapshot, id: string, delta: -1 | 1): CliPrefsSnapshot {
  // Moving writes out the whole list, so later additions land after what the user arranged.
  const ids = listedEntries(prefs).map((entry) => entry.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= ids.length) return prefs
  const other = ids[to] ?? id
  return { ...prefs, order: ids.map((candidate, index) => (index === from ? other : index === to ? id : candidate)) }
}

function enableChoice(prefs: CliPrefsSnapshot, id: string, enabled: boolean): CliPrefsSnapshot {
  // The official route is the harness's own model provider; the settings page has no switch
  // for it, and a stale preference must not take it out of the switcher.
  if (id === OFFICIAL_PROVIDER_ID) return prefs
  const hidden = prefs.hidden.includes(id)
  if (enabled) return hidden ? { ...prefs, hidden: prefs.hidden.filter((candidate) => candidate !== id) } : prefs
  return hidden ? prefs : { ...prefs, hidden: [...prefs.hidden, id] }
}

function readPrefs(storage: CliPrefsStorage): CliPrefsSnapshot {
  try {
    return parseCliPrefs(storage.getItem(CLI_PREFS_STORAGE_KEY))
  } catch (_error: unknown) {
    // Storage can be blocked (private modes, policies); the directory's own order is harmless.
    return EMPTY
  }
}

/**
 * @param storage - where the preferences are kept; the browser's localStorage in the harness.
 * @returns the preferences, loaded from storage.
 */
export function createCliPrefs(storage: CliPrefsStorage): CliPrefs {
  let prefs = readPrefs(storage)
  let listeners: readonly (() => void)[] = []
  const update = (next: CliPrefsSnapshot): void => {
    if (next === prefs) return
    prefs = next
    try {
      storage.setItem(CLI_PREFS_STORAGE_KEY, JSON.stringify(prefs))
    } catch (_error: unknown) {
      // The change still applies for this run; only remembering it across restarts is lost.
    }
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => prefs,
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    remember: (seen) => {
      update(rememberChoices(prefs, seen))
    },
    move: (id, delta) => {
      update(moveChoice(prefs, id, delta))
    },
    setEnabled: (id, enabled) => {
      update(enableChoice(prefs, id, enabled))
    },
  }
}
