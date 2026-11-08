// @vitest-environment jsdom
/// <reference lib="dom" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PLUGIN_VERSION, SETTINGS_ABOUT_STYLES, SettingsAbout } from '../../src/client/settings-about.tsx'

afterEach(() => {
  cleanup()
})

/** The repository's web page, from package.json's `repository.url` (`git+https://….git`). */
function packageRepositoryPage(): string {
  // Vitest runs from the repository root; under jsdom import.meta.url is not a file: URL.
  const manifest: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
  const repository: unknown =
    typeof manifest === 'object' && manifest !== null && 'repository' in manifest ? manifest.repository : undefined
  const url: unknown =
    typeof repository === 'object' && repository !== null && 'url' in repository ? repository.url : undefined
  if (typeof url !== 'string') throw new Error('package.json: repository.url must be a string')
  return url.replace(/^git\+/, '').replace(/\.git$/, '')
}

describe('SettingsAbout', () => {
  it('shows the version, outside the build as a development build', () => {
    // Only the client build defines the version; tests run the source directly.
    expect(PLUGIN_VERSION).toBe('开发版')
    const { container } = render(<SettingsAbout />)
    expect(screen.getByText('开发版').parentElement?.textContent).toBe('版本开发版')
    expect(container.querySelectorAll('.dsh-ccgui-about-pill')).toHaveLength(3)
    expect(SETTINGS_ABOUT_STYLES).toContain('.dsh-ccgui-about')
  })

  // The pill is this plugin's own repository, the one package.json publishes to npm.
  it("links to this plugin's repository in a new window", () => {
    render(<SettingsAbout />)
    const link = screen.getByRole('link', { name: 'GitHub' })
    expect(packageRepositoryPage()).toBe('https://github.com/zhukunpenglinyutong/dsh-ccgui')
    expect(link.getAttribute('href')).toBe(packageRepositoryPage())
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
