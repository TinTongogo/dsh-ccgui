// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerAddToChat } from '../../src/client/add-to-chat.tsx'
import type {
  AddToChatContext,
  ComposerActions,
  FileTarget,
  MenuAction,
  MenuContribution,
} from '../../src/client/add-to-chat.tsx'

interface Registration {
  readonly options: Readonly<Record<string, unknown>>
  readonly component: unknown
}

const SPAN = { rev: 3 }

function fakeComposer(accepts = true) {
  return {
    captureInsertion: vi.fn(() => SPAN),
    insertText: vi.fn((_text: string, _span: unknown) => accepts),
  } satisfies ComposerActions
}

function harness() {
  const registrations: Registration[] = []
  const contributions: MenuContribution[] = []
  const unregister = vi.fn()
  const dependencies: (readonly string[])[] = []
  const slots: AddToChatContext['slots'] = {
    inject: (_name, add) => add(),
    register: (options, component) => {
      registrations.push({ options, component })
      return undefined
    },
  }
  const ctx: AddToChatContext = {
    slots,
    effect: (run) => {
      run()
    },
    inject: (deps, apply) => {
      dependencies.push(deps)
      apply({
        ...ctx,
        contextMenus: {
          register: (contribution) => {
            contributions.push(contribution)
            return unregister
          },
        },
      })
      return undefined
    },
  }
  registerAddToChat(ctx)
  return { registrations, contributions, dependencies, unregister }
}

function registrationNamed(registrations: readonly Registration[], name: string): Registration {
  const found = registrations.find(({ options }) => options.name === name)
  if (found === undefined) throw new Error(`nothing registered in ${name}`)
  return found
}

/** Mount the composer bridge for one session, as the harness does for each open composer. */
function mountComposer(registrations: readonly Registration[], sessionId: string, inputActions: ComposerActions) {
  const bridge = registrationNamed(registrations, 'conversation.input.left')
  const Component = bridge.component as ComponentType<Record<string, unknown>>
  const inject = bridge.options.inject as (sessionId: string) => Record<string, unknown>
  return render(<Component {...inject(sessionId)} sessionId={sessionId} inputActions={inputActions} />)
}

function actionFor(contributions: readonly MenuContribution[], kind: FileTarget['kind'], value: FileTarget['value']) {
  const contribution = contributions.find((entry) => entry.target === kind)
  if (contribution === undefined) throw new Error(`no ${kind} contribution`)
  const [action] = contribution.resolve(value)
  if (action === undefined) throw new Error('no action')
  return action
}

async function run(action: MenuAction): Promise<void> {
  if (action.run === undefined) throw new Error('action has no run')
  await action.run()
}

afterEach(() => {
  cleanup()
})

describe('registerAddToChat', () => {
  it('waits for the context menu service and contributes to file and folder menus', () => {
    const { contributions, dependencies, registrations } = harness()
    expect(dependencies).toEqual([['contextMenus']])
    expect(contributions.map(({ id, target }) => [id, target])).toEqual([
      ['dsh-ccgui.add-to-chat.file', 'file'],
      ['dsh-ccgui.add-to-chat.directory', 'directory'],
    ])
    // Ahead of the harness's own file actions, which start at order 100.
    expect(contributions.every(({ order }) => order < 100)).toBe(true)
    expect(registrationNamed(registrations, 'contextMenu.icon').options.key).toBe('dsh-ccgui.add-to-chat')
  })

  it('labels the action like CC GUI and gives it a plus icon', () => {
    const { contributions, registrations } = harness()
    const action = actionFor(contributions, 'file', { sessionId: 's1', path: '/repo/a.ts' })
    expect(action.label).toBe('添加到对话')
    expect(action.icon).toEqual({ key: 'dsh-ccgui.add-to-chat' })
    const Icon = registrationNamed(registrations, 'contextMenu.icon').component as ComponentType
    const { container } = render(<Icon />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('inserts an @ mention at the caret of the clicked session’s composer', async () => {
    const { contributions, registrations } = harness()
    const mine = fakeComposer()
    const other = fakeComposer()
    mountComposer(registrations, 's1', mine)
    mountComposer(registrations, 's2', other)
    await run(actionFor(contributions, 'file', { sessionId: 's1', path: '/repo/DSH 项目/a.ts' }))
    expect(mine.insertText).toHaveBeenCalledWith('@"/repo/DSH 项目/a.ts" ', SPAN)
    expect(other.insertText).not.toHaveBeenCalled()
  })

  it('works for folders too', async () => {
    const { contributions, registrations } = harness()
    const composer = fakeComposer()
    mountComposer(registrations, 's1', composer)
    await run(actionFor(contributions, 'directory', { sessionId: 's1', path: '/repo/src' }))
    expect(composer.insertText).toHaveBeenCalledWith('@/repo/src ', SPAN)
  })

  it('fails visibly when the composer refuses the text', async () => {
    const { contributions, registrations } = harness()
    mountComposer(registrations, 's1', fakeComposer(false))
    const action = actionFor(contributions, 'file', { sessionId: 's1', path: '/repo/a.ts' })
    expect(action.failureLabel).toBeTruthy()
    await expect(run(action)).rejects.toThrow()
  })

  it('fails visibly once the session’s composer is gone', async () => {
    const { contributions, registrations } = harness()
    const view = mountComposer(registrations, 's1', fakeComposer())
    view.unmount()
    await expect(run(actionFor(contributions, 'file', { sessionId: 's1', path: '/repo/a.ts' }))).rejects.toThrow()
  })

  it('keeps the newer composer when an older one for the same session unmounts', async () => {
    const { contributions, registrations } = harness()
    const older = mountComposer(registrations, 's1', fakeComposer())
    const newer = fakeComposer()
    mountComposer(registrations, 's1', newer)
    older.unmount()
    await run(actionFor(contributions, 'file', { sessionId: 's1', path: '/repo/a.ts' }))
    expect(newer.insertText).toHaveBeenCalledTimes(1)
  })

  it('draws nothing in the composer row', () => {
    const { registrations } = harness()
    const { container } = mountComposer(registrations, 's1', fakeComposer())
    expect(container.innerHTML).toBe('')
  })
})
