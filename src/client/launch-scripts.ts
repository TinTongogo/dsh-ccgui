/**
 * Startup scripts ("启动脚本"): the list a workspace keeps, how it is stored, and the pure
 * edits the manager applies to it. Scripts belong to a working directory, as in CC GUI,
 * so every session opened on the same project shares one list.
 * @module dsh-ccgui/client/launch-scripts
 */

/** One saved command; the first in a list is the one the header's run button starts. */
export interface LaunchScript {
  readonly id: string
  /** Optional; an empty name shows the command's first line instead. */
  readonly name: string
  readonly command: string
}

/** What the editor hands back; no `id` means a new script. */
export interface LaunchScriptDraft {
  readonly id?: string | undefined
  readonly name: string
  readonly command: string
}

/** The parts of `window.localStorage` the book uses, so tests can hand in a plain map. */
export interface ScriptStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** An observable, per-directory view of the saved scripts. */
export interface ScriptBook {
  read(cwd: string | undefined): readonly LaunchScript[]
  write(cwd: string | undefined, scripts: readonly LaunchScript[]): void
  subscribe(listener: () => void): () => void
}

const STORAGE_PREFIX = 'dsh-ccgui.launchScripts:'
/** Sessions whose directory is not known yet still get a list, shared among themselves. */
const NO_DIRECTORY_KEY = `${STORAGE_PREFIX}*`
const EMPTY: readonly LaunchScript[] = []
/** A pasted log should not end up being typed into a shell. */
export const MAX_COMMAND_LENGTH = 4000
export const MAX_NAME_LENGTH = 40

/**
 * @param cwd - the session's working directory, if the harness has reported it.
 * @returns the storage key for that directory's scripts.
 */
export function storageKey(cwd: string | undefined): string {
  return cwd === undefined || cwd === '' ? NO_DIRECTORY_KEY : `${STORAGE_PREFIX}${cwd}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalize(value: unknown): LaunchScript | undefined {
  if (!isRecord(value)) return undefined
  const { id, name, command } = value
  if (typeof id !== 'string' || typeof command !== 'string' || command.trim() === '') return undefined
  return { id, name: typeof name === 'string' ? name : '', command }
}

/**
 * Read a stored list, dropping whatever an older or hand-edited entry got wrong.
 * @param raw - the stored JSON, or null when nothing is stored.
 * @returns the scripts that are usable.
 */
export function parseScripts(raw: string | null): readonly LaunchScript[] {
  if (raw === null) return EMPTY
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (_error: unknown) {
    // A corrupt entry should cost the user their list, not the whole header.
    return EMPTY
  }
  if (!Array.isArray(value)) return EMPTY
  return value.map(normalize).filter((script): script is LaunchScript => script !== undefined)
}

/**
 * @param script - a saved script.
 * @returns what menus and tabs call it.
 */
export function scriptLabel(script: Pick<LaunchScript, 'name' | 'command'>): string {
  const name = script.name.trim()
  if (name !== '') return name
  return script.command.trim().split(/\r?\n/, 1)[0] ?? ''
}

/**
 * Turn a command into keystrokes. Each line is entered on its own, so a multi-line script
 * runs its lines in order, the way pasting them into the shell would.
 * @param command - the saved command.
 * @returns the text to write to the terminal, Enter included.
 */
export function shellInput(command: string): string {
  const lines = command
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  return `${lines.join('\r')}\r`
}

/**
 * Check a draft before saving it.
 * @param draft - the editor's fields.
 * @returns a message for the user, or undefined when the draft can be saved.
 */
export function draftProblem(draft: LaunchScriptDraft): string | undefined {
  if (draft.command.trim() === '') return '请填写要运行的命令'
  if (draft.command.length > MAX_COMMAND_LENGTH) return `命令不能超过 ${MAX_COMMAND_LENGTH} 个字符`
  if (draft.name.trim().length > MAX_NAME_LENGTH) return `名称不能超过 ${MAX_NAME_LENGTH} 个字符`
  return undefined
}

/**
 * Add a new script at the end, or replace the one with the draft's id in place.
 * @param scripts - the current list.
 * @param draft - the editor's fields, already checked with {@link draftProblem}.
 * @param newId - makes the id for a new script.
 * @returns the new list.
 */
export function saveDraft(
  scripts: readonly LaunchScript[],
  draft: LaunchScriptDraft,
  newId: () => string,
): readonly LaunchScript[] {
  const fields = { name: draft.name.trim(), command: draft.command.trim() }
  const { id } = draft
  if (id === undefined || !scripts.some((script) => script.id === id)) {
    return [...scripts, { id: newId(), ...fields }]
  }
  return scripts.map((script) => (script.id === id ? { ...script, ...fields } : script))
}

/**
 * @param scripts - the current list.
 * @param id - the script to drop.
 * @returns the list without it.
 */
export function removeScript(scripts: readonly LaunchScript[], id: string): readonly LaunchScript[] {
  return scripts.filter((script) => script.id !== id)
}

/**
 * Make a script the one the run button starts.
 * @param scripts - the current list.
 * @param id - the script to move first.
 * @returns the reordered list.
 */
export function promoteScript(scripts: readonly LaunchScript[], id: string): readonly LaunchScript[] {
  const chosen = scripts.find((script) => script.id === id)
  if (chosen === undefined) return scripts
  return [chosen, ...scripts.filter((script) => script.id !== id)]
}

function readRaw(storage: ScriptStorage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch (_error: unknown) {
    // Reads happen during render; a blocked storage should show no scripts, not break the
    // header. Saving reports the same failure to the user, where it can be acted on.
    return null
  }
}

/**
 * A book over some storage. Reads are cached per key, because React compares snapshots by
 * identity and a fresh parse on every render would loop.
 * @param storage - where the lists live; the browser's localStorage in the harness.
 * @returns the book.
 */
export function createScriptBook(storage: ScriptStorage): ScriptBook {
  let cache: ReadonlyMap<string, readonly LaunchScript[]> = new Map()
  let listeners: readonly (() => void)[] = []
  return {
    read(cwd) {
      const key = storageKey(cwd)
      const cached = cache.get(key)
      if (cached !== undefined) return cached
      const scripts = parseScripts(readRaw(storage, key))
      cache = new Map(cache).set(key, scripts)
      return scripts
    },
    write(cwd, scripts) {
      const key = storageKey(cwd)
      storage.setItem(key, JSON.stringify(scripts))
      cache = new Map(cache).set(key, scripts)
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((other) => other !== listener)
      }
    },
  }
}
