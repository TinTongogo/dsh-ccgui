// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TERMINAL_ENTRY_STYLES, registerTerminalEntry, toggleTerminal } from '../../src/client/terminal-entry.tsx'
import type { SidebarTerminalFace, TerminalEntryContext, TerminalTab } from '../../src/client/terminal-entry.tsx'

interface SidebarState {
  tabs: readonly TerminalTab[]
  active: TerminalTab | undefined
  expanded: boolean
}

function fakeSidebar(initial: Partial<SidebarState> = {}) {
  const state: SidebarState = { tabs: [], active: undefined, expanded: false, ...initial }
  const sidebar = {
    tabsIn: vi.fn((_sessionId: string) => state.tabs),
    active: vi.fn(() => state.active),
    isExpanded: vi.fn(() => state.expanded),
    toggleExpanded: vi.fn(),
    focus: vi.fn<(tabId: string) => void>(),
    openTab: vi.fn<(kind: string) => void>(),
  } satisfies SidebarTerminalFace
  return sidebar
}

const TERMINAL: TerminalTab = { id: 't1', kind: 'terminal' }
const GUIDE: TerminalTab = { id: 'g1', kind: 'guide' }

afterEach(() => {
  cleanup()
})

describe('toggleTerminal', () => {
  it('opens a new terminal when the session has none', () => {
    const sidebar = fakeSidebar({ tabs: [GUIDE], active: GUIDE, expanded: true })
    toggleTerminal(sidebar, 's1')
    expect(sidebar.tabsIn).toHaveBeenCalledWith('s1')
    expect(sidebar.openTab).toHaveBeenCalledWith('terminal')
    expect(sidebar.focus).not.toHaveBeenCalled()
    expect(sidebar.toggleExpanded).not.toHaveBeenCalled()
  })

  it('collapses the panel when a terminal is already in front', () => {
    const sidebar = fakeSidebar({ tabs: [TERMINAL], active: TERMINAL, expanded: true })
    toggleTerminal(sidebar, 's1')
    expect(sidebar.toggleExpanded).toHaveBeenCalledTimes(1)
    expect(sidebar.openTab).not.toHaveBeenCalled()
    expect(sidebar.focus).not.toHaveBeenCalled()
  })

  it('brings back an existing terminal and expands a collapsed panel', () => {
    const sidebar = fakeSidebar({ tabs: [GUIDE, TERMINAL], active: TERMINAL, expanded: false })
    toggleTerminal(sidebar, 's1')
    expect(sidebar.focus).toHaveBeenCalledWith('t1')
    expect(sidebar.toggleExpanded).toHaveBeenCalledTimes(1)
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })

  it('switches to an existing terminal behind another tab without collapsing', () => {
    const sidebar = fakeSidebar({ tabs: [GUIDE, TERMINAL], active: GUIDE, expanded: true })
    toggleTerminal(sidebar, 's1')
    expect(sidebar.focus).toHaveBeenCalledWith('t1')
    expect(sidebar.toggleExpanded).not.toHaveBeenCalled()
    expect(sidebar.openTab).not.toHaveBeenCalled()
  })
})

interface Registration {
  readonly options: { name: string; id: string; order?: number; inject(sessionId: string): unknown }
  readonly component: unknown
}

function harness(sidebar: SidebarTerminalFace) {
  const registrations: Registration[] = []
  const dependencies: (readonly string[])[] = []
  const slots: TerminalEntryContext['slots'] = {
    inject: (_name, add) => add(),
    register: (options, component) => {
      registrations.push({ options, component })
      return undefined
    },
  }
  const ctx: TerminalEntryContext = {
    slots,
    inject: (deps, apply) => {
      dependencies.push(deps)
      apply({ slots, inject: ctx.inject, sidebarRight: sidebar })
      return undefined
    },
  }
  registerTerminalEntry(ctx)
  return { registrations, dependencies }
}

function renderEntry(sidebar: SidebarTerminalFace, sessionId = 's1') {
  const { registrations } = harness(sidebar)
  const registration = registrations[0]
  if (registration === undefined) throw new Error('nothing registered')
  const Component = registration.component as ComponentType<Record<string, unknown>>
  const injected = registration.options.inject(sessionId) as Record<string, unknown>
  return render(<Component {...injected} sessionId={sessionId} />)
}

describe('registerTerminalEntry', () => {
  it('waits for the right sidebar and puts the button in the session header', () => {
    const { registrations, dependencies } = harness(fakeSidebar())
    expect(dependencies).toEqual([['sidebarRight']])
    expect(registrations.map(({ options }) => [options.id, options.name, options.order])).toEqual([
      ['dsh-ccgui.terminal-entry', 'conversation.session.header.utilities', -1],
    ])
  })

  it('toggles the terminal of its own session when clicked', async () => {
    const sidebar = fakeSidebar()
    renderEntry(sidebar, 's7')
    const button = screen.getByRole('button', { name: '切换终端' })
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.click(button)
    expect(sidebar.tabsIn).toHaveBeenCalledWith('s7')
    expect(sidebar.openTab).toHaveBeenCalledWith('terminal')
  })

  it('ships styles for its button class', () => {
    expect(TERMINAL_ENTRY_STYLES).toContain('.dsh-cli-terminal-entry')
  })
})
