// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCliPrefs } from '../../src/client/cli-prefs.ts'
import { FEATURES, createFeatureSettings } from '../../src/client/feature-settings.ts'
import type { FeatureStorage } from '../../src/client/feature-settings.ts'
import { UPCOMING_FEATURES } from '../../src/client/more-section.tsx'
import { SETTINGS_PAGE_STYLES, SettingsIcon, SettingsPage } from '../../src/client/settings-page.tsx'
import { SETTINGS_SECTION_ID, gateInject, registerSettingsPage } from '../../src/client/settings-register.ts'
import type { SettingsContext } from '../../src/client/settings-register.ts'

function memoryStorage(): FeatureStorage {
  let items: Readonly<Record<string, string>> = {}
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items = { ...items, [key]: value }
    },
  }
}

afterEach(() => {
  cleanup()
})

describe('SettingsPage', () => {
  async function openFeatures(): Promise<void> {
    await userEvent.click(screen.getByRole('tab', { name: '界面交互' }))
  }

  it('opens on the CLI list, with a tab per group of options', () => {
    render(
      <SettingsPage settings={createFeatureSettings(memoryStorage())} cliPrefs={createCliPrefs(memoryStorage())} />,
    )
    expect(screen.getByRole('heading', { name: 'CC GUI 设置' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeDefined()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['CLI 列表', '界面交互', '更多功能'])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByRole('tabpanel', { name: 'CLI 列表' })).toBeDefined()
    expect(screen.getByText('打开任一会话后，这里会列出可切换的 CLI。')).toBeDefined()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows one switch per feature, reflecting its state', async () => {
    const settings = createFeatureSettings(memoryStorage())
    settings.set('terminalEntry', false)
    render(<SettingsPage settings={settings} cliPrefs={createCliPrefs(memoryStorage())} />)
    await openFeatures()
    expect(screen.getByRole('tabpanel', { name: '界面交互' })).toBeDefined()
    const switches = screen.getAllByRole('switch')
    expect(switches.map((element) => element.getAttribute('aria-label'))).toEqual(FEATURES.map((f) => f.title))
    expect(switches.map((element) => element.getAttribute('aria-checked'))).toEqual(
      FEATURES.map((feature) => (feature.id === 'terminalEntry' ? 'false' : 'true')),
    )
    for (const feature of FEATURES) expect(screen.getByText(feature.description)).toBeDefined()
  })

  it('switches a feature off and on again', async () => {
    const settings = createFeatureSettings(memoryStorage())
    render(<SettingsPage settings={settings} cliPrefs={createCliPrefs(memoryStorage())} />)
    await openFeatures()
    const files = screen.getByRole('switch', { name: '右侧栏默认打开工作区文件' })
    await userEvent.click(files)
    expect(settings.getSnapshot().filesDefault).toBe(false)
    expect(files.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(files)
    expect(settings.getSnapshot().filesDefault).toBe(true)
  })

  it('announces the upcoming features without offering a control', async () => {
    render(
      <SettingsPage settings={createFeatureSettings(memoryStorage())} cliPrefs={createCliPrefs(memoryStorage())} />,
    )
    await userEvent.click(screen.getByRole('tab', { name: '更多功能' }))
    const panel = screen.getByRole('tabpanel', { name: '更多功能' })
    for (const feature of UPCOMING_FEATURES) {
      expect(screen.getByText(feature.title)).toBeDefined()
      expect(screen.getByText(feature.description)).toBeDefined()
    }
    expect(screen.getAllByText('即将开放…')).toHaveLength(UPCOMING_FEATURES.length)
    expect(panel.querySelectorAll('button, a, input, select, [role="switch"]')).toHaveLength(0)
  })

  it('draws its navigation icon at the requested size and ships styles for its classes', () => {
    const { container } = render(<SettingsIcon size={18} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(SETTINGS_PAGE_STYLES).toContain('.dsh-ccgui-settings')
    expect(SETTINGS_PAGE_STYLES).toContain('--dsw-alias-state-success-primary')
    expect(SETTINGS_PAGE_STYLES).toContain('.dsh-ccgui-more-soon')
  })
})

describe('registerSettingsPage', () => {
  it('adds a settings section after 插件市场 and the glyph its navigation row draws', () => {
    const registrations: { options: Parameters<SettingsContext['slots']['register']>[0]; component: unknown }[] = []
    const ctx: SettingsContext = {
      slots: {
        inject: (_name, add) => add(),
        register: (options, component) => {
          registrations.push({ options, component })
          return undefined
        },
      },
    }
    const settings = createFeatureSettings(memoryStorage())
    const cliPrefs = createCliPrefs(memoryStorage())
    registerSettingsPage(ctx, settings, cliPrefs)
    const [section, icon] = registrations
    expect(section?.options).toMatchObject({
      name: 'settings.section',
      id: SETTINGS_SECTION_ID,
      order: 50,
      label: 'CC GUI 设置',
    })
    expect(section?.options.inject?.()).toEqual({ settings, cliPrefs })
    expect(section?.component).toBe(SettingsPage)
    expect(icon?.options).toEqual({ name: 'settings.section.icon', id: SETTINGS_SECTION_ID })
    expect(icon?.component).toBe(SettingsIcon)
  })

  it('renders the section with what it injects', async () => {
    let page: { inject?: () => unknown; component: unknown } | undefined
    registerSettingsPage(
      {
        slots: {
          inject: (_name, add) => add(),
          register: (options, component) => {
            if (options.name === 'settings.section') page = { inject: () => options.inject?.(), component }
            return undefined
          },
        },
      },
      createFeatureSettings(memoryStorage()),
      createCliPrefs(memoryStorage()),
    )
    const Component = page?.component as ComponentType<Record<string, unknown>>
    render(<Component {...(page?.inject?.() as Record<string, unknown>)} />)
    await userEvent.click(screen.getByRole('tab', { name: '界面交互' }))
    expect(screen.getAllByRole('switch')).toHaveLength(FEATURES.length)
  })
})

describe('gateInject', () => {
  function setup(fiber: unknown = { dispose: vi.fn(() => Promise.resolve()) }) {
    const settings = createFeatureSettings(memoryStorage())
    const cleanups: (() => void)[] = []
    const labels: (string | undefined)[] = []
    const inject = vi.fn((_deps: readonly string[], _apply: () => void) => fiber)
    const gated = gateInject(
      {
        effect: (run, label) => {
          labels.push(label)
          cleanups.push(run())
        },
      },
      settings,
      'terminalEntry',
      inject,
    )
    return { settings, cleanups, labels, inject, gated, fiber }
  }

  it('injects at once while the feature is on and disposes the injection when it is switched off', () => {
    const dispose = vi.fn(() => Promise.resolve())
    const { settings, inject, gated, labels } = setup({ dispose })
    const apply = vi.fn()
    expect(gated(['sidebarRight'], apply)).toBeUndefined()
    expect(inject).toHaveBeenCalledWith(['sidebarRight'], apply)
    expect(labels).toEqual(['ccgui: terminalEntry switch'])
    settings.set('terminalEntry', false)
    expect(dispose).toHaveBeenCalledTimes(1)
    settings.set('terminalEntry', true)
    expect(inject).toHaveBeenCalledTimes(2)
  })

  it('takes the feature out when the plugin unloads', () => {
    const dispose = vi.fn(() => Promise.resolve())
    const { gated, cleanups } = setup({ dispose })
    gated(['sidebarRight'], vi.fn())
    for (const cleanup of cleanups) cleanup()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('tolerates an injection without a disposer and a disposer that fails', async () => {
    const quiet = setup(undefined)
    quiet.gated([], vi.fn())
    expect(() => {
      quiet.settings.set('terminalEntry', false)
    }).not.toThrow()
    const failing = setup({ dispose: vi.fn(() => Promise.reject(new Error('stuck'))) })
    failing.gated([], vi.fn())
    failing.settings.set('terminalEntry', false)
    await Promise.resolve()
  })
})
