import { describe, expect, it, vi } from 'vitest'
import { registerChanges } from '../../../src/client/changes/changes-register.ts'
import type { ChangesContext } from '../../../src/client/changes/changes-register.ts'
import { CHANGES_KIND } from '../../../src/client/changes/changes-kind.ts'
import { ChangesPanel } from '../../../src/client/changes/changes-panel.tsx'
import { ChangesTitle } from '../../../src/client/changes/changes-title.tsx'
import type { CwdList } from '../../../src/client/changes/changes-panel.tsx'

describe('registerChanges', () => {
  it('registers the tab type with a guide entry, and the body in the tab seat for each session', () => {
    const unregister = vi.fn()
    const register = vi.fn((_definition: unknown) => unregister)
    const slotRegister = vi.fn()
    const effects: (() => () => void)[] = []
    const child = {
      effect: (run: () => () => void) => {
        effects.push(run)
      },
      sidebarRightTabs: { register },
      slots: { inject: (_name: string, add: () => unknown) => add(), register: slotRegister },
    }
    const deps: (readonly string[])[] = []
    const ctx: ChangesContext = {
      inject: (names, apply) => {
        deps.push(names)
        apply(child)
      },
    }
    const list: CwdList = { subscribe: () => () => undefined, getSnapshot: () => ({ byId: {} }) }
    const fetchFn = vi.fn()
    registerChanges(ctx, list, fetchFn)

    expect(deps).toEqual([['sidebarRightTabs', 'slots']])
    const [run] = effects
    expect(run?.()).toBe(unregister)
    const definition = register.mock.calls[0]?.[0] as {
      id: string
      kind: string
      title: (address: string) => string
      guide: { title: () => string; description: () => string }[]
    }
    expect(definition).toMatchObject({ id: 'dsh-ccgui.changes', kind: CHANGES_KIND })
    expect(definition.title('')).toBe('变更')
    expect(definition.guide[0]?.title()).toBe('变更')
    expect(definition.guide[0]?.description()).toContain('Git')

    const [options, component] = slotRegister.mock.calls[0] as [
      { name: string; key: string; inject: (sessionId: string) => unknown },
      unknown,
    ]
    expect(options).toMatchObject({ name: 'sidebar.right.pane.tab', key: 'dsh-ccgui.changes' })
    expect(options.inject('s9')).toEqual({ sessionId: 's9', list, fetch: fetchFn })
    expect(component).toBe(ChangesPanel)
    expect(slotRegister).toHaveBeenNthCalledWith(
      2,
      { name: 'sidebar.right.pane.tab.title', key: 'dsh-ccgui.changes' },
      ChangesTitle,
    )
  })
})
