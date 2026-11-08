/**
 * Which of the plugin's additions to the harness's own interface are on. Each can be switched
 * off from the settings page (see settings-page.tsx) for users who prefer the harness's
 * original interaction; a switch takes effect at once, without a reload.
 * @module dsh-ccgui/client/feature-settings
 */

import type { Store } from './store.ts'

/** A switchable feature. Additions too small to get in anyone's way are not listed. */
export type FeatureId = 'filesDefault' | 'gitChanges' | 'compactTabs' | 'terminalEntry' | 'launchScripts'

export type FeatureFlags = Readonly<Record<FeatureId, boolean>>

/** How the settings page describes a feature. */
export interface FeatureInfo {
  readonly id: FeatureId
  readonly title: string
  readonly description: string
}

/** The parts of `window.localStorage` the settings use, so tests can hand in a plain map. */
export interface FeatureStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The current flags, plus the one way to change them. */
export interface FeatureSettings extends Store<FeatureFlags> {
  set(id: FeatureId, enabled: boolean): void
}

export const FEATURES_STORAGE_KEY = 'dsh-ccgui.features'

/** In the order the settings page lists them. */
export const FEATURES: readonly FeatureInfo[] = [
  {
    id: 'filesDefault',
    title: '右侧栏默认打开工作区文件',
    description: '展开右侧栏时直接显示工作区文件。关闭后恢复显示「开始」引导页。',
  },
  {
    id: 'gitChanges',
    title: '右侧栏的变更页',
    description: '在右侧栏查看、暂存并提交 Git 变更，和工作区文件一起打开。关闭后移除这个页面。',
  },
  {
    id: 'compactTabs',
    title: '右侧栏紧凑页签',
    description: '右侧栏的页签只显示图标，悬停时显示名称和关闭按钮。关闭后恢复图标加文字的宽页签。',
  },
  {
    id: 'terminalEntry',
    title: '会话顶部的终端按钮',
    description: '在会话标题栏一键打开或收起终端。关闭后从右侧栏打开终端。',
  },
  {
    id: 'launchScripts',
    title: '会话顶部的启动脚本',
    description: '在会话标题栏保存并一键运行常用命令。关闭只隐藏入口，已保存的脚本会保留。',
  },
]

/** Everything is on until the user says otherwise; that is why they installed the plugin. */
export const DEFAULT_FLAGS: FeatureFlags = {
  filesDefault: true,
  gitChanges: true,
  compactTabs: true,
  terminalEntry: true,
  launchScripts: true,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read stored flags, keeping only what is a known feature with a boolean value.
 * @param raw - the stored JSON, or null when nothing is stored.
 * @returns the flags, with defaults for whatever is missing or malformed.
 */
export function parseFlags(raw: string | null): FeatureFlags {
  if (raw === null) return DEFAULT_FLAGS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (_error: unknown) {
    // A corrupt entry should cost the user their choices, not the plugin's start.
    return DEFAULT_FLAGS
  }
  if (!isRecord(value)) return DEFAULT_FLAGS
  return FEATURES.reduce<FeatureFlags>((flags, { id }) => {
    const stored = value[id]
    return typeof stored === 'boolean' ? { ...flags, [id]: stored } : flags
  }, DEFAULT_FLAGS)
}

function readFlags(storage: FeatureStorage): FeatureFlags {
  try {
    return parseFlags(storage.getItem(FEATURES_STORAGE_KEY))
  } catch (_error: unknown) {
    // Storage can be blocked (private modes, policies); the defaults are the harmless choice.
    return DEFAULT_FLAGS
  }
}

/**
 * @param storage - where the choices are kept; the browser's localStorage in the harness.
 * @returns the settings, loaded from storage.
 */
export function createFeatureSettings(storage: FeatureStorage): FeatureSettings {
  let flags = readFlags(storage)
  let listeners: readonly (() => void)[] = []
  return {
    getSnapshot: () => flags,
    subscribe(listener) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    set(id, enabled) {
      if (flags[id] === enabled) return
      flags = { ...flags, [id]: enabled }
      try {
        storage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(flags))
      } catch (_error: unknown) {
        // The switch still applies for this run; only remembering it across restarts is lost.
      }
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Keep a feature installed exactly while it is switched on.
 * @param settings - the feature settings.
 * @param id - the feature to follow.
 * @param install - adds the feature and returns how to take it out again.
 * @returns stops following and takes the feature out if it is in.
 */
export function whileEnabled(settings: FeatureSettings, id: FeatureId, install: () => () => void): () => void {
  let uninstall: (() => void) | undefined
  const reconcile = (): void => {
    const enabled = settings.getSnapshot()[id]
    if (enabled && uninstall === undefined) uninstall = install()
    if (!enabled && uninstall !== undefined) {
      const current = uninstall
      uninstall = undefined
      current()
    }
  }
  reconcile()
  const unsubscribe = settings.subscribe(reconcile)
  return () => {
    unsubscribe()
    uninstall?.()
    uninstall = undefined
  }
}
