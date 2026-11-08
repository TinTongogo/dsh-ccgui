import { describe, expect, it, vi } from 'vitest'
import {
  MAX_COMMAND_LENGTH,
  MAX_NAME_LENGTH,
  createScriptBook,
  draftProblem,
  parseScripts,
  promoteScript,
  removeScript,
  saveDraft,
  scriptLabel,
  shellInput,
  storageKey,
} from '../../src/client/launch-scripts.ts'
import type { LaunchScript, ScriptStorage } from '../../src/client/launch-scripts.ts'

const DEV: LaunchScript = { id: 'a', name: '开发服务器', command: 'npm run dev' }
const TEST: LaunchScript = { id: 'b', name: '', command: 'pnpm test --watch' }

function memoryStorage(initial: Record<string, string> = {}) {
  let items: Readonly<Record<string, string>> = initial
  const storage = {
    getItem: vi.fn((key: string) => items[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      items = { ...items, [key]: value }
    }),
  } satisfies ScriptStorage
  return storage
}

describe('storageKey', () => {
  it('keeps one list per working directory and one for sessions without one', () => {
    expect(storageKey('/work/app')).not.toBe(storageKey('/work/other'))
    expect(storageKey(undefined)).toBe(storageKey(''))
    expect(storageKey(undefined)).not.toBe(storageKey('/work/app'))
  })
})

describe('parseScripts', () => {
  it('reads nothing from an empty, corrupt or non-list entry', () => {
    expect(parseScripts(null)).toEqual([])
    expect(parseScripts('{not json')).toEqual([])
    expect(parseScripts('{"id":"a"}')).toEqual([])
  })

  it('drops entries without an id or a command, and fills a missing name', () => {
    const raw = JSON.stringify([
      DEV,
      { id: 'x', command: '   ' },
      { command: 'ls' },
      7,
      null,
      { id: 'c', command: 'ls' },
    ])
    expect(parseScripts(raw)).toEqual([DEV, { id: 'c', name: '', command: 'ls' }])
  })
})

describe('scriptLabel', () => {
  it('prefers the name and falls back to the first line of the command', () => {
    expect(scriptLabel(DEV)).toBe('开发服务器')
    expect(scriptLabel({ name: '  ', command: '\n  cd web\nnpm start' })).toBe('cd web')
  })
})

describe('shellInput', () => {
  it('enters each non-empty line, ending with Enter', () => {
    expect(shellInput('npm run dev')).toBe('npm run dev\r')
    expect(shellInput('  cd web\r\n\nnpm start\n')).toBe('cd web\rnpm start\r')
  })
})

describe('draftProblem', () => {
  it('asks for a command and enforces the limits', () => {
    expect(draftProblem({ name: 'x', command: '  ' })).toBe('请填写要运行的命令')
    expect(draftProblem({ name: '', command: 'x'.repeat(MAX_COMMAND_LENGTH + 1) })).toContain(`${MAX_COMMAND_LENGTH}`)
    expect(draftProblem({ name: 'n'.repeat(MAX_NAME_LENGTH + 1), command: 'ls' })).toContain(`${MAX_NAME_LENGTH}`)
    expect(draftProblem({ name: '', command: 'ls' })).toBeUndefined()
  })
})

describe('list edits', () => {
  it('adds a new script at the end with trimmed fields', () => {
    const next = saveDraft([DEV], { name: ' 测试 ', command: ' pnpm test \n' }, () => 'new')
    expect(next).toEqual([DEV, { id: 'new', name: '测试', command: 'pnpm test' }])
  })

  it('replaces an edited script in place without touching the original list', () => {
    const scripts = [DEV, TEST]
    const next = saveDraft(scripts, { id: 'a', name: 'dev', command: 'vite' }, () => 'unused')
    expect(next).toEqual([{ id: 'a', name: 'dev', command: 'vite' }, TEST])
    expect(scripts).toEqual([DEV, TEST])
  })

  it('treats a draft whose script was deleted meanwhile as new', () => {
    expect(saveDraft([TEST], { id: 'gone', name: '', command: 'ls' }, () => 'n')).toEqual([
      TEST,
      { id: 'n', name: '', command: 'ls' },
    ])
  })

  it('removes and promotes by id', () => {
    expect(removeScript([DEV, TEST], 'a')).toEqual([TEST])
    expect(promoteScript([DEV, TEST], 'b')).toEqual([TEST, DEV])
    const scripts = [DEV]
    expect(promoteScript(scripts, 'missing')).toBe(scripts)
  })
})

describe('createScriptBook', () => {
  it('returns the same list until it changes, so React sees a stable snapshot', () => {
    const storage = memoryStorage({ [storageKey('/w')]: JSON.stringify([DEV]) })
    const book = createScriptBook(storage)
    const first = book.read('/w')
    expect(first).toEqual([DEV])
    expect(book.read('/w')).toBe(first)
    expect(storage.getItem).toHaveBeenCalledTimes(1)
  })

  it('stores writes per directory and tells subscribers until they leave', () => {
    const storage = memoryStorage()
    const book = createScriptBook(storage)
    const listener = vi.fn()
    const unsubscribe = book.subscribe(listener)
    book.write('/w', [TEST])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(book.read('/w')).toEqual([TEST])
    expect(book.read('/other')).toEqual([])
    expect(createScriptBook(storage).read('/w')).toEqual([TEST])
    unsubscribe()
    book.write('/w', [])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('shows no scripts when storage refuses reads, and lets a refused write throw', () => {
    const book = createScriptBook({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(book.read('/w')).toEqual([])
    expect(() => {
      book.write('/w', [DEV])
    }).toThrow('quota')
  })
})
