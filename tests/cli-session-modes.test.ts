import { describe, expect, it, vi } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import type { CliModeList, CliModelList } from '../src/model-options.ts'
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

// Switching goes out as the id the CLI gave, and the answer decides what the control shows.
describe('CliSession switching mode', () => {
  it('sends the picked id and reports the CLI answer', async () => {
    const onModes = vi.fn((_modes: CliModeList) => {})
    const { fake, session } = setupWith({ onModes }, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    fake.setConfigResult = [{ ...modeOption, currentValue: 'plan' }]
    await expect(session.switchMode('plan')).resolves.toMatchObject({ current: 'plan' })
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'permission_mode', value: 'plan' }])
    expect(onModes).toHaveBeenLastCalledWith(expect.objectContaining({ current: 'plan' }))
  })

  it('leaves the CLI alone when it is already on that mode', async () => {
    const { fake, session } = setupWith({}, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    await session.switchMode('acceptEdits')
    expect(fake.setConfigCalls).toEqual([])
  })

  it('keeps a pick made before the CLI started until its first step', async () => {
    const known: CliModelList = {
      configId: 'model',
      current: 'small',
      options: [
        { value: 'small', name: 'Small' },
        { value: 'fast', name: 'Fast' },
      ],
      modes: {
        configId: 'permission_mode',
        current: 'acceptEdits',
        options: [
          { value: 'acceptEdits', name: 'Accept edits' },
          { value: 'plan', name: 'Plan' },
        ],
      },
    }
    const { fake, session } = setupWith({ knownModels: () => known }, end)
    fake.configOptions = [modelOption, { ...modeOption, options: [...(known.modes?.options ?? [])] }]
    fake.setConfigResult = [{ ...modeOption, currentValue: 'plan' }]
    await expect(session.switchMode('plan')).resolves.toMatchObject({ current: 'acceptEdits' })
    expect(fake.setConfigCalls).toEqual([])
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'permission_mode', value: 'plan' }])
    expect(session.pendingMode).toBeUndefined()
  })

  it('refuses a mode the CLI never offered', async () => {
    const { fake, session } = setupWith({}, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    await expect(session.switchMode('yolo')).rejects.toMatchObject({ code: 'CLI_MODE_FAILED' })
    expect(fake.setConfigCalls).toEqual([])
  })

  it('refuses before any list is known', async () => {
    const { session } = setupWith({}, end)
    await expect(session.switchMode('plan')).rejects.toMatchObject({ code: 'CLI_MODE_FAILED' })
  })

  it('reports a CLI that keeps its old mode', async () => {
    const { fake, session } = setupWith({}, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    fake.setConfigResult = [modeOption]
    await expect(session.switchMode('plan')).rejects.toMatchObject({ code: 'CLI_MODE_FAILED' })
  })

  it('reports a transport failure with the CLI name', async () => {
    const { fake, session } = setupWith({}, end)
    fake.configOptions = [modelOption, modeOption]
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    fake.setConfigError = new Error('broken pipe')
    await expect(session.switchMode('plan')).rejects.toThrow(/OpenCode 无法切换到模式 plan：broken pipe/)
  })
})
