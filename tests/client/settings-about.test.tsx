// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PLUGIN_VERSION, SETTINGS_ABOUT_STYLES, SettingsAbout } from '../../src/client/settings-about.tsx'

afterEach(() => {
  cleanup()
})

describe('SettingsAbout', () => {
  it('shows the version, outside the build as a development build', () => {
    // Only the client build defines the version; tests run the source directly.
    expect(PLUGIN_VERSION).toBe('开发版')
    const { container } = render(<SettingsAbout />)
    expect(screen.getByText('开发版').parentElement?.textContent).toBe('版本开发版')
    expect(container.querySelectorAll('.dsh-ccgui-about-pill')).toHaveLength(3)
    expect(SETTINGS_ABOUT_STYLES).toContain('.dsh-ccgui-about')
  })

  it('links to CC GUI in a new window', () => {
    render(<SettingsAbout />)
    const link = screen.getByRole('link', { name: 'GitHub' })
    expect(link.getAttribute('href')).toBe('https://github.com/zhukunpenglinyutong/desktop-cc-gui')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
  })

  it('opens the WeChat group QR code and closes it with a second press or Escape', async () => {
    render(<SettingsAbout />)
    const toggle = screen.getByRole('button', { name: '微信交流群' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('img', { name: '官方微信交流群二维码' })).toBeNull()
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('img', { name: '官方微信交流群二维码' })).toBeDefined()
    expect(screen.getByText('使用微信扫一扫')).toBeDefined()
    await userEvent.click(toggle)
    expect(screen.queryByRole('img', { name: '官方微信交流群二维码' })).toBeNull()
    await userEvent.click(toggle)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('img', { name: '官方微信交流群二维码' })).toBeNull()
  })
})
