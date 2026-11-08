import { describe, expect, it } from 'vitest'
import {
  CLI_PREFS_STORAGE_KEY,
  arrangeChoices,
  createCliPrefs,
  listedEntries,
  parseCliPrefs,
} from '../../src/client/cli-prefs.ts'
import type { CliPrefsSnapshot, CliPrefsStorage } from '../../src/client/cli-prefs.ts'

function memoryStorage(initial: Readonly<Record<string, string>> = {}): CliPrefsStorage & {
  read(key: string): string | undefined
} {
  let items = initial
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items = { ...items, [key]: value }
    },
    read: (key) => items[key],
  }
}

const DEEPSEEK = { id: 'deepseek-official', label: 'DeepSeek' }
const CLAUDE = { id: 'cli-claude', label: 'Claude Code' }
const CODEX = { id: 'cli-codex', label: 'Codex CLI' }
const PI = { id: 'cli-pi', label: 'PI CLI' }

function snapshot(partial: Partial<CliPrefsSnapshot>): CliPrefsSnapshot {
  return { known: [], order: [], hidden: [], ...partial }
}

describe('parseCliPrefs', () => {
  it('falls back to empty preferences for missing, corrupt or malformed entries', () => {
    const empty = snapshot({})
    expect(parseCliPrefs(null)).toEqual(empty)
    expect(parseCliPrefs('{')).toEqual(empty)
    expect(parseCliPrefs('[]')).toEqual(empty)
    expect(parseCliPrefs('{"order":"x","hidden":[1],"known":[{"id":2}]}')).toEqual(empty)
  })

  it('keeps well-formed fields and drops malformed items', () => {
    const raw = JSON.stringify({
      order: ['cli-codex', 3, 'cli-claude'],
      hidden: ['cli-pi', 'deepseek-official'],
      known: [CLAUDE, { id: 'x' }, CODEX],
    })
    expect(parseCliPrefs(raw)).toEqual(
      snapshot({ order: ['cli-codex', 'cli-claude'], hidden: ['cli-pi'], known: [CLAUDE, CODEX] }),
    )
  })
})

describe('arrangeChoices', () => {
  it('leaves the directory order alone without preferences', () => {
    expect(arrangeChoices([DEEPSEEK, CLAUDE, CODEX], snapshot({}))).toEqual([DEEPSEEK, CLAUDE, CODEX])
  })

  it('sorts by the saved order, keeps unordered entries after it, and drops hidden ones', () => {
    const prefs = snapshot({ order: ['cli-codex', 'deepseek-official'], hidden: ['cli-claude'] })
    expect(arrangeChoices([DEEPSEEK, CLAUDE, CODEX, PI], prefs)).toEqual([CODEX, DEEPSEEK, PI])
  })

  it('keeps the built-in provider even when stored preferences hid it', () => {
    const prefs = snapshot({ hidden: ['deepseek-official', 'cli-claude', 'cli-codex', 'cli-pi'] })
    expect(arrangeChoices([DEEPSEEK, CLAUDE, CODEX, PI], prefs)).toEqual([DEEPSEEK])
  })
})

describe('listedEntries', () => {
  it('lists every known provider in the saved order with its enabled state', () => {
    const prefs = snapshot({
      known: [DEEPSEEK, CLAUDE, CODEX],
      order: ['cli-codex'],
      hidden: ['cli-claude', 'deepseek-official'],
    })
    expect(listedEntries(prefs)).toEqual([
      { ...CODEX, enabled: true },
      { ...DEEPSEEK, enabled: true },
      { ...CLAUDE, enabled: false },
    ])
  })
})

describe('createCliPrefs', () => {
  it('remembers providers it is shown, updating names and persisting only on change', () => {
    const storage = memoryStorage()
    const prefs = createCliPrefs(storage)
    let calls = 0
    prefs.subscribe(() => {
      calls += 1
    })
    prefs.remember([DEEPSEEK, CLAUDE])
    const first = prefs.getSnapshot()
    prefs.remember([CLAUDE, DEEPSEEK])
    expect(prefs.getSnapshot()).toBe(first)
    prefs.remember([{ id: 'cli-claude', label: 'Claude' }, CODEX])
    expect(prefs.getSnapshot().known).toEqual([DEEPSEEK, { id: 'cli-claude', label: 'Claude' }, CODEX])
    expect(calls).toBe(2)
    expect(parseCliPrefs(storage.read(CLI_PREFS_STORAGE_KEY) ?? null)).toEqual(prefs.getSnapshot())
  })

  it('loads what was stored', () => {
    const stored = snapshot({ known: [CLAUDE], hidden: ['cli-claude'] })
    const prefs = createCliPrefs(memoryStorage({ [CLI_PREFS_STORAGE_KEY]: JSON.stringify(stored) }))
    expect(prefs.getSnapshot()).toEqual(stored)
  })

  it('moves a provider up or down, ignoring moves past either end', () => {
    const prefs = createCliPrefs(memoryStorage())
    prefs.remember([DEEPSEEK, CLAUDE, CODEX])
    prefs.move('cli-codex', -1)
    expect(listedEntries(prefs.getSnapshot()).map((entry) => entry.id)).toEqual([
      'deepseek-official',
      'cli-codex',
      'cli-claude',
    ])
    const before = prefs.getSnapshot()
    prefs.move('deepseek-official', -1)
    prefs.move('cli-claude', 1)
    prefs.move('unknown', 1)
    expect(prefs.getSnapshot()).toBe(before)
  })

  it('hides and shows any CLI, but never the built-in provider', () => {
    const prefs = createCliPrefs(memoryStorage())
    prefs.remember([DEEPSEEK, CLAUDE, CODEX])
    prefs.setEnabled('deepseek-official', false)
    expect(prefs.getSnapshot().hidden).toEqual([])
    prefs.setEnabled('cli-claude', false)
    prefs.setEnabled('cli-codex', false)
    expect(prefs.getSnapshot().hidden).toEqual(['cli-claude', 'cli-codex'])
    expect(arrangeChoices([DEEPSEEK, CLAUDE, CODEX], prefs.getSnapshot())).toEqual([DEEPSEEK])
    prefs.setEnabled('cli-claude', true)
    expect(prefs.getSnapshot().hidden).toEqual(['cli-codex'])
    const before = prefs.getSnapshot()
    prefs.setEnabled('cli-claude', true)
    expect(prefs.getSnapshot()).toBe(before)
  })

  it('hides a CLI that starts hidden when first seen, until the user turns it on', () => {
    const codebuddy = { id: 'cli-codebuddy', label: 'CodeBuddy CLI' }
    const prefs = createCliPrefs(memoryStorage())
    prefs.remember([DEEPSEEK, CLAUDE, codebuddy])
    expect(prefs.getSnapshot().hidden).toEqual(['cli-codebuddy'])
    expect(arrangeChoices([DEEPSEEK, CLAUDE, codebuddy], prefs.getSnapshot())).toEqual([DEEPSEEK, CLAUDE])
    expect(listedEntries(prefs.getSnapshot()).find((entry) => entry.id === 'cli-codebuddy')?.enabled).toBe(false)
    prefs.setEnabled('cli-codebuddy', true)
    prefs.remember([DEEPSEEK, CLAUDE, codebuddy])
    expect(prefs.getSnapshot().hidden).toEqual([])
  })

  // Kimi has been verified with a real account, so it shows from the start.
  it('shows a verified CLI when first seen', () => {
    const prefs = createCliPrefs(memoryStorage())
    prefs.remember([DEEPSEEK, CLAUDE, { id: 'cli-kimi', label: 'Kimi CLI' }])
    expect(prefs.getSnapshot().hidden).toEqual([])
  })

  it('stops notifying after unsubscribe and survives storage that throws', () => {
    const prefs = createCliPrefs({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    let calls = 0
    const unsubscribe = prefs.subscribe(() => {
      calls += 1
    })
    prefs.remember([CLAUDE])
    unsubscribe()
    prefs.remember([CODEX])
    expect(calls).toBe(1)
    expect(prefs.getSnapshot().known).toEqual([CLAUDE, CODEX])
  })
})
