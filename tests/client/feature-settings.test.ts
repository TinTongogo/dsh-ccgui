import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FLAGS,
  FEATURES,
  FEATURES_STORAGE_KEY,
  createFeatureSettings,
  parseFlags,
  whileEnabled,
} from '../../src/client/feature-settings.ts'
import type { FeatureStorage } from '../../src/client/feature-settings.ts'

function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  let items = initial
  return {
    getItem: (key: string) => items[key] ?? null,
    setItem: vi.fn((key: string, value: string) => {
      items = { ...items, [key]: value }
    }),
  } satisfies FeatureStorage
}

const throwing: FeatureStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('FEATURES', () => {
  it('lists every switchable feature once, each on by default', () => {
    expect(FEATURES.map((feature) => feature.id)).toEqual([
      'filesDefault',
      'gitChanges',
      'compactTabs',
      'terminalEntry',
      'launchScripts',
    ])
    expect(Object.values(DEFAULT_FLAGS).every(Boolean)).toBe(true)
    for (const feature of FEATURES) {
      expect(feature.title).not.toBe('')
      expect(feature.description).not.toBe('')
    }
  })
})

describe('parseFlags', () => {
  it('turns everything on when nothing is stored', () => {
    expect(parseFlags(null)).toEqual(DEFAULT_FLAGS)
  })

  it('keeps stored booleans and defaults the rest', () => {
    expect(parseFlags(JSON.stringify({ terminalEntry: false }))).toEqual({ ...DEFAULT_FLAGS, terminalEntry: false })
  })

  it('ignores unknown keys, non-boolean values and corrupt entries', () => {
    expect(parseFlags(JSON.stringify({ terminalEntry: 'no', other: false }))).toEqual(DEFAULT_FLAGS)
    expect(parseFlags('{not json')).toEqual(DEFAULT_FLAGS)
    expect(parseFlags('[false]')).toEqual(DEFAULT_FLAGS)
    expect(parseFlags('null')).toEqual(DEFAULT_FLAGS)
  })
})

describe('createFeatureSettings', () => {
  it('reads the stored flags', () => {
    const storage = memoryStorage({ [FEATURES_STORAGE_KEY]: JSON.stringify({ filesDefault: false }) })
    expect(createFeatureSettings(storage).getSnapshot().filesDefault).toBe(false)
  })

  it('saves a change, notifies listeners and hands out a new snapshot', () => {
    const storage = memoryStorage()
    const settings = createFeatureSettings(storage)
    const before = settings.getSnapshot()
    const listener = vi.fn()
    const unsubscribe = settings.subscribe(listener)
    settings.set('launchScripts', false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(settings.getSnapshot()).toEqual({ ...DEFAULT_FLAGS, launchScripts: false })
    expect(before).toEqual(DEFAULT_FLAGS)
    expect(storage.setItem).toHaveBeenCalledWith(FEATURES_STORAGE_KEY, JSON.stringify(settings.getSnapshot()))
    unsubscribe()
    settings.set('launchScripts', true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the value does not change', () => {
    const storage = memoryStorage()
    const settings = createFeatureSettings(storage)
    const listener = vi.fn()
    settings.subscribe(listener)
    settings.set('terminalEntry', true)
    expect(listener).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('still works for this run when storage is blocked', () => {
    const settings = createFeatureSettings(throwing)
    expect(settings.getSnapshot()).toEqual(DEFAULT_FLAGS)
    settings.set('filesDefault', false)
    expect(settings.getSnapshot().filesDefault).toBe(false)
  })
})

describe('whileEnabled', () => {
  it('installs while the feature is on and removes it when switched off', () => {
    const settings = createFeatureSettings(memoryStorage())
    const uninstall = vi.fn()
    const install = vi.fn(() => uninstall)
    const stop = whileEnabled(settings, 'terminalEntry', install)
    expect(install).toHaveBeenCalledTimes(1)
    settings.set('launchScripts', false)
    expect(install).toHaveBeenCalledTimes(1)
    settings.set('terminalEntry', false)
    expect(uninstall).toHaveBeenCalledTimes(1)
    settings.set('terminalEntry', true)
    expect(install).toHaveBeenCalledTimes(2)
    stop()
    expect(uninstall).toHaveBeenCalledTimes(2)
    settings.set('terminalEntry', false)
    expect(uninstall).toHaveBeenCalledTimes(2)
  })

  it('waits for a feature that starts switched off', () => {
    const settings = createFeatureSettings(
      memoryStorage({ [FEATURES_STORAGE_KEY]: JSON.stringify({ filesDefault: false }) }),
    )
    const install = vi.fn(() => () => undefined)
    const stop = whileEnabled(settings, 'filesDefault', install)
    expect(install).not.toHaveBeenCalled()
    stop()
    settings.set('filesDefault', true)
    expect(install).not.toHaveBeenCalled()
  })
})
