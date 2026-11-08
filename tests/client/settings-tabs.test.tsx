// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { SETTINGS_TABS_STYLES, SettingsTabs } from '../../src/client/settings-tabs.tsx'
import type { SettingsTab } from '../../src/client/settings-tabs.tsx'

const TABS: readonly SettingsTab[] = [
  { id: 'a', label: '甲', render: () => <p>甲的内容</p> },
  { id: 'b', label: '乙', render: () => <p>乙的内容</p> },
  { id: 'c', label: '丙', render: () => <p>丙的内容</p> },
]

function selected(): string | null | undefined {
  return screen.getAllByRole('tab').find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent
}

afterEach(() => {
  cleanup()
})

describe('SettingsTabs', () => {
  it('starts on the first tab and shows only its panel', () => {
    render(<SettingsTabs tabs={TABS} label="设置" />)
    expect(screen.getByRole('tablist', { name: '设置' })).toBeDefined()
    expect(selected()).toBe('甲')
    expect(screen.getByRole('tabpanel', { name: '甲' }).textContent).toBe('甲的内容')
    expect(screen.queryByText('乙的内容')).toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    expect(SETTINGS_TABS_STYLES).toContain('.dsh-ccgui-tabs')
  })

  it('switches panels on click', async () => {
    render(<SettingsTabs tabs={TABS} label="设置" />)
    await userEvent.click(screen.getByRole('tab', { name: '乙' }))
    expect(selected()).toBe('乙')
    expect(screen.getByRole('tabpanel', { name: '乙' }).textContent).toBe('乙的内容')
  })

  it('moves with the arrow keys, wrapping, and jumps with Home and End', async () => {
    render(<SettingsTabs tabs={TABS} label="设置" />)
    screen.getByRole('tab', { name: '甲' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(selected()).toBe('丙')
    expect(document.activeElement?.textContent).toBe('丙')
    await userEvent.keyboard('{ArrowRight}')
    expect(selected()).toBe('甲')
    await userEvent.keyboard('{End}')
    expect(selected()).toBe('丙')
    await userEvent.keyboard('{Home}')
    expect(selected()).toBe('甲')
    await userEvent.keyboard('{ArrowDown}')
    expect(selected()).toBe('甲')
  })

  it('renders an empty strip without a panel', () => {
    render(<SettingsTabs tabs={[]} label="设置" />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tabpanel')).toBeNull()
  })
})
