// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SESSION_STATUS_MARK_CLASS,
  SESSION_STATUS_STYLES,
  SessionStatusMark,
} from '../../src/client/session-status-mark.tsx'
import type { SessionList } from '../../src/client/session-status-mark.tsx'
import { createStore } from '../fixtures/client-store.ts'

const CODEX_ROW = { projectionValues: { modelSelection: { next: { provider: 'cli-codex', model: 'x' } } } }

function listOf(byId: Record<string, typeof CODEX_ROW | undefined>) {
  return createStore<{ byId: Readonly<Record<string, typeof CODEX_ROW | undefined>> }>({ byId })
}

/** The harness's row markup, reduced to the parts the mark relies on. */
function Row({ list, dot = true }: { readonly list: SessionList; readonly dot?: boolean }) {
  return (
    <div data-row-key="session:s1">
      <span className="_slot_ab12">{dot ? <svg data-state="ongoing" /> : null}</span>
      <span className="_title_ab12">标题</span>
      <span className="_rowResting_ab12">
        <SessionStatusMark sessionId="s1" list={list} />
      </span>
    </div>
  )
}

const cell = (container: HTMLElement) => container.querySelector('[class*="_slot"]')

afterEach(cleanup)

describe('SessionStatusMark', () => {
  it('portals the provider mark into the row leading cell, next to the status dot', () => {
    const { container } = render(<Row list={listOf({ s1: CODEX_ROW })} />)
    const mark = cell(container)?.querySelector(`.${SESSION_STATUS_MARK_CLASS} [data-cli-mark="codex"]`)
    expect(mark).not.toBeNull()
    expect(cell(container)?.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(container.querySelector('._rowResting_ab12 [data-cli-mark]')).toBeNull()
  })

  it('waits for the row to name a provider, then follows the list', () => {
    const list = listOf({})
    const { container } = render(<Row list={list} />)
    expect(container.querySelector(`.${SESSION_STATUS_MARK_CLASS}`)).toBeNull()
    list.set({ byId: { s1: CODEX_ROW } })
    expect(cell(container)?.querySelector('[data-cli-mark="codex"]')).not.toBeNull()
  })

  it('draws nothing outside a session row', () => {
    const { container } = render(<SessionStatusMark sessionId="s1" list={listOf({ s1: CODEX_ROW })} />)
    expect(document.querySelector(`.${SESSION_STATUS_MARK_CLASS}`)).toBeNull()
    expect(container.querySelector('span')?.hidden).toBe(true)
  })

  it('removes the portaled mark with the row', () => {
    const { unmount } = render(<Row list={listOf({ s1: CODEX_ROW })} />)
    unmount()
    expect(document.querySelector(`.${SESSION_STATUS_MARK_CLASS}`)).toBeNull()
  })
})

describe('SESSION_STATUS_STYLES', () => {
  it('shows the mark only beside a status dot', () => {
    expect(SESSION_STATUS_STYLES).toContain(`.${SESSION_STATUS_MARK_CLASS} { display: none;`)
    expect(SESSION_STATUS_STYLES).toContain(':has(> [data-state]) > .dsh-cli-status-mark { display: inline-flex; }')
  })

  it('swaps the spinner for a breathing dot that respects reduced motion', () => {
    expect(SESSION_STATUS_STYLES).toMatch(/svg\[data-state="ongoing"\] \{[^}]*animation: dsh-cli-status-heartbeat/)
    expect(SESSION_STATUS_STYLES).toContain('svg[data-state="ongoing"] > * { display: none; }')
    expect(SESSION_STATUS_STYLES).toMatch(/prefers-reduced-motion[^@]*animation: none/)
  })

  it('never nests :has() or depends on a hashed class name', () => {
    expect(SESSION_STATUS_STYLES).not.toMatch(/:has\([^)]*:has\(/)
    expect(SESSION_STATUS_STYLES).not.toMatch(/\.[A-Za-z0-9-]+_[A-Za-z]/)
  })
})
