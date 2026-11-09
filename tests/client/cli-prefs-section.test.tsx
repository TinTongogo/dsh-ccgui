// @vitest-environment jsdom
/// <reference lib="dom" />

import { act, cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliPrefs } from '../../src/client/cli-prefs.ts'
import type { CliPrefsStorage } from '../../src/client/cli-prefs.ts'
import { CLI_PREFS_STYLES, CliPrefsSection } from '../../src/client/cli-prefs-section.tsx'

function memoryStorage(): CliPrefsStorage {
  let items: Readonly<Record<string, string>> = {}
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items = { ...items, [key]: value }
    },
  }
}

function seeded() {
  const prefs = createCliPrefs(memoryStorage())
  prefs.remember([
    { id: 'deepseek-official', label: 'DeepSeek' },
    { id: 'cli-claude', label: 'Claude Code' },
    { id: 'cli-codex', label: 'Codex CLI' },
  ])
  return prefs
}

function rowNames(): readonly string[] {
  return screen.getAllByRole('listitem').map((row) => row.getAttribute('aria-label') ?? '')
}

afterEach(() => {
  cleanup()
})

describe('CliPrefsSection', () => {
  it('explains where the list comes from before any provider is known', () => {
    render(<CliPrefsSection prefs={createCliPrefs(memoryStorage())} />)
    expect(screen.getByText('打开任一会话后，这里会列出可切换的 CLI。')).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lists known providers with their marks, disabling moves past either end', () => {
    render(<CliPrefsSection prefs={seeded()} />)
    expect(rowNames()).toEqual(['DeepSeek', 'Claude Code', 'Codex CLI'])
    const [first, , last] = screen.getAllByRole('listitem')
    expect(first?.querySelector('svg')).not.toBeNull()
    expect(within(first ?? document.body).getByRole('button', { name: '上移 DeepSeek' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(within(last ?? document.body).getByRole('button', { name: '下移 Codex CLI' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(CLI_PREFS_STYLES).toContain('.dsh-ccgui-cli-prefs')
    expect(screen.getByText('输入框 CLI 切换菜单里的顺序和显示的项。关闭的 CLI 不再出现在菜单中。')).toBeDefined()
    expect(screen.getByText('更多 CLI 适配中…')).toBeDefined()
  })

  it('reorders providers with the arrow buttons', async () => {
    const prefs = seeded()
    render(<CliPrefsSection prefs={prefs} />)
    await userEvent.click(screen.getByRole('button', { name: '上移 Codex CLI' }))
    expect(rowNames()).toEqual(['DeepSeek', 'Codex CLI', 'Claude Code'])
    await userEvent.click(screen.getByRole('button', { name: '下移 DeepSeek' }))
    expect(rowNames()).toEqual(['Codex CLI', 'DeepSeek', 'Claude Code'])
    expect(prefs.getSnapshot().order).toEqual(['cli-codex', 'deepseek-official', 'cli-claude'])
  })

  it('drops the row of a provider the switcher stops listing', () => {
    const prefs = seeded()
    render(<CliPrefsSection prefs={prefs} />)
    expect(rowNames()).toEqual(['DeepSeek', 'Claude Code', 'Codex CLI'])
    act(() => {
      prefs.remember([
        { id: 'deepseek-official', label: 'DeepSeek' },
        { id: 'cli-claude', label: 'Claude Code' },
      ])
    })
    expect(rowNames()).toEqual(['DeepSeek', 'Claude Code'])
  })

  it('shows the built-in provider without a switch', () => {
    render(<CliPrefsSection prefs={seeded()} />)
    expect(screen.queryByRole('switch', { name: '启用 DeepSeek' })).toBeNull()
    expect(screen.getByText('内置提供方，始终显示')).toBeDefined()
    expect(screen.getByRole('switch', { name: '启用 Claude Code' })).toBeDefined()
  })

  it('turns a CLI off with visible feedback and back on', async () => {
    const prefs = seeded()
    render(<CliPrefsSection prefs={prefs} />)
    const claude = screen.getByRole('switch', { name: '启用 Claude Code' })
    expect(claude.getAttribute('title')).toBe('关闭后不再出现在 CLI 菜单')
    await userEvent.click(claude)
    expect(prefs.getSnapshot().hidden).toEqual(['cli-claude'])
    expect(claude.getAttribute('aria-checked')).toBe('false')
    expect(claude.getAttribute('title')).toBe('开启后重新出现在 CLI 菜单')
    expect(screen.getByText('已关闭，不在 CLI 菜单中显示')).toBeDefined()
    // Any CLI can be turned off at once; DeepSeek keeps the switcher from being empty.
    await userEvent.click(screen.getByRole('switch', { name: '启用 Codex CLI' }))
    expect(prefs.getSnapshot().hidden).toEqual(['cli-claude', 'cli-codex'])
    await userEvent.click(claude)
    expect(prefs.getSnapshot().hidden).toEqual(['cli-codex'])
  })
})
