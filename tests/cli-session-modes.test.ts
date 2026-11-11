import { describe, expect, it, vi } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import type { CliModeList } from '../src/model-options.ts'
import { collect, setupWith, user } from './fixtures/cli-session-helpers.ts'

const modelOption: SessionConfigOption = {
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue: 'small',
  options: [
    { value: 'small', name: 'Small' },
    { value: 'fast', name: 'Fast' },
  ],
}

const modeOption: SessionConfigOption = {
  id: 'permission_mode',
  name: 'Permission mode',
  category: 'mode',
  type: 'select',
  currentValue: 'acceptEdits',
  options: [
    { value: 'default', name: 'Default' },
    { value: 'acceptEdits', name: 'Accept edits' },
    { value: 'plan', name: 'Plan' },
  ],
}

const end = () => 'end_turn' as const

// A CLI's modes are its own vocabulary. The session only reports them verbatim; it
// never turns them into a harness preset or decides what they mean.
describe('CliSession native modes', () => {
  it('reports the modes exactly as the CLI stated them', async () => {
    const onModes = vi.fn((_modes: CliModeList) => {})
    const { fake, session } = setupWith({ onModes }, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(onModes).toHaveBeenCalledWith({
      configId: 'permission_mode',
      current: 'acceptEdits',
      options: [
        { value: 'default', name: 'Default' },
        { value: 'acceptEdits', name: 'Accept edits' },
        { value: 'plan', name: 'Plan' },
      ],
    })
  })

  it('says nothing when the CLI reports no modes', async () => {
    const onModes = vi.fn((_modes: CliModeList) => {})
    const { fake, session } = setupWith({ onModes }, end)
    fake.configOptions = [modelOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(onModes).not.toHaveBeenCalled()
  })

  it('keeps a mode id that happens to equal a model id', async () => {
    const onModes = vi.fn((_modes: CliModeList) => {})
    const { fake, session } = setupWith({ onModes }, end)
    fake.configOptions = [
      modelOption,
      { ...modeOption, options: [{ value: 'small', name: 'Small mode' }], currentValue: 'small' },
    ]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(onModes).toHaveBeenCalledWith(expect.objectContaining({ configId: 'permission_mode', current: 'small' }))
  })
})
