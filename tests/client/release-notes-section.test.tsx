// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from '../../src/client/release-notes.ts'
import type { ReleaseNote } from '../../src/client/release-notes.ts'
import { RELEASE_NOTES_STYLES, ReleaseNotesSection } from '../../src/client/release-notes-section.tsx'

const NOTES: readonly ReleaseNote[] = [
  {
    version: '2.0.0',
    date: '2026-12-01',
    sections: [
      { heading: '✨ 新功能', items: [{ title: '新菜单', text: '用 `npx` 启动。' }] },
      { heading: '📄 文档', items: [{ text: '只改了文档。' }] },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-01',
    sections: [{ heading: '🐛 问题修复', items: [{ text: '修好启动。' }] }],
  },
]

const button = (name: string): HTMLElement => screen.getByRole('button', { name })

afterEach(() => {
  cleanup()
})

describe('ReleaseNotesSection', () => {
  it('opens on the newest release, one version per page', () => {
    render(<ReleaseNotesSection notes={NOTES} />)
    expect(screen.getByRole('group', { name: 'v2.0.0 版本记录' })).toBeDefined()
    expect(screen.getByText('2026-12-01')).toBeDefined()
    expect(screen.getByText('✨ 新功能')).toBeDefined()
    expect(screen.getByText('新菜单：')).toBeDefined()
    expect(screen.getByText('第 1 / 2 页')).toBeDefined()
    expect(screen.queryByText('修好启动。')).toBeNull()
    expect(screen.queryByText('只改了文档。')).toBeDefined()
  })

  it('renders backticked commands as code', () => {
    render(<ReleaseNotesSection notes={NOTES} />)
    expect(screen.getByText('npx').tagName).toBe('CODE')
    expect(screen.getByText('npx').closest('li')?.textContent).toBe('新菜单：用 npx 启动。')
  })

  it('steps between releases and stops at both ends', async () => {
    render(<ReleaseNotesSection notes={NOTES} />)
    expect(button('上一页').getAttribute('disabled')).not.toBeNull()
    expect(button('下一页').getAttribute('disabled')).toBeNull()
    await userEvent.click(button('下一页'))
    expect(screen.getByRole('group', { name: 'v1.0.0 版本记录' })).toBeDefined()
    expect(screen.getByText('修好启动。')).toBeDefined()
    expect(screen.getByText('第 2 / 2 页')).toBeDefined()
    expect(button('下一页').getAttribute('disabled')).not.toBeNull()
    expect(button('上一页').getAttribute('disabled')).toBeNull()
    await userEvent.click(button('上一页'))
    expect(screen.getByText('第 1 / 2 页')).toBeDefined()
  })

  it('jumps to a release from its dot and marks the current page', async () => {
    render(<ReleaseNotesSection notes={NOTES} />)
    expect(button('v2.0.0').getAttribute('aria-current')).toBe('page')
    expect(button('v1.0.0').getAttribute('aria-current')).toBeNull()
    await userEvent.click(button('v1.0.0'))
    expect(button('v1.0.0').getAttribute('aria-current')).toBe('page')
    expect(button('v2.0.0').getAttribute('aria-current')).toBeNull()
    expect(screen.getByText('修好启动。')).toBeDefined()
  })

  it('marks the release the running build belongs to', async () => {
    render(<ReleaseNotesSection notes={NOTES} currentVersion="1.0.0" />)
    expect(screen.queryByText('当前版本')).toBeNull()
    await userEvent.click(button('下一页'))
    expect(screen.getByText('当前版本')).toBeDefined()
  })

  it('defaults to the bundled notes', () => {
    const newest = RELEASE_NOTES[0]
    if (newest === undefined) throw new Error('no bundled release notes')
    render(<ReleaseNotesSection />)
    expect(screen.getByRole('group', { name: `v${newest.version} 版本记录` })).toBeDefined()
  })

  it('says so when there is no release to show', () => {
    render(<ReleaseNotesSection notes={[]} />)
    expect(screen.getByText('还没有版本记录。')).toBeDefined()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('ships styles for the page, the pager and the dots', () => {
    expect(RELEASE_NOTES_STYLES).toContain('.dsh-ccgui-notes-page')
    expect(RELEASE_NOTES_STYLES).toContain('.dsh-ccgui-notes-step')
    expect(RELEASE_NOTES_STYLES).toContain('.dsh-ccgui-notes-dot[aria-current="page"]')
  })
})
