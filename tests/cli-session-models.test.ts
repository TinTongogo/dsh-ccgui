import { describe, expect, it, vi } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import type { PromptScript } from './fixtures/fake-transport.ts'
import {
  toolCall,
  user,
  toolResult,
  assistantWithReplay,
  setup,
  setupWith,
  collect,
  textOf,
  toolCallOf,
  never,
} from './fixtures/cli-session-helpers.ts'

describe('CliSession model selection', () => {
  const modelOption = (currentValue: string): SessionConfigOption => ({
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue,
    options: [
      { value: 'small', name: 'Small' },
      { value: 'large', name: 'Large' },
    ],
  })

  function withModels(...scripts: PromptScript[]) {
    const context = setup(...scripts)
    context.fake.configOptions = [modelOption('small')]
    return context
  }

  it('switches the CLI to the chosen model before the prompt goes out', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'large' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'model', value: 'large' }])
    expect(fake.operations).toEqual(['set:large', 'prompt'])
  })

  it('leaves the CLI alone when its default is selected', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'default' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('leaves the CLI alone when the chosen model is already active', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'small' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('switches once, not on every step', async () => {
    const { fake, session } = withModels(
      () => 'end_turn' as const,
      () => 'end_turn' as const,
    )
    await collect(session.stream({ messages: [user('1', 'one')], model: 'large' }))
    await collect(session.stream({ messages: [user('1', 'one'), user('2', 'two')], model: 'large' }))
    expect(fake.setConfigCalls).toHaveLength(1)
  })

  it('goes back to the CLI default when that is selected again', async () => {
    const { fake, session } = withModels(
      () => 'end_turn' as const,
      () => 'end_turn' as const,
    )
    await collect(session.stream({ messages: [user('1', 'one')], model: 'large' }))
    await collect(session.stream({ messages: [user('1', 'one'), user('2', 'two')], model: 'default' }))
    expect(fake.setConfigCalls.map((call) => call.value)).toEqual(['large', 'small'])
  })

  it('does not touch the model on a continuation step', async () => {
    const { fake, session } = withModels((t) => {
      t.update(toolCall('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages, model: 'small' }))
    await session.waitForTool(toolCallOf(first).id, never)
    await collect(session.stream({ messages: [...messages, toolResult()], model: 'large' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('does not send the message when the CLI refuses the model', async () => {
    const { fake, session } = withModels()
    fake.setConfigError = new Error('unknown model')
    await expect(collect(session.stream({ messages: [user('1', 'hi')], model: 'large' }))).rejects.toMatchObject({
      code: 'CLI_MODEL_FAILED',
    })
    expect(fake.prompts).toEqual([])
    expect(session.sentMessageIds.has('1')).toBe(false)
  })

  it('does not trust a switch the CLI reports back as something else', async () => {
    const { fake, session } = withModels()
    fake.setConfigResult = [modelOption('small')]
    await expect(collect(session.stream({ messages: [user('1', 'hi')], model: 'large' }))).rejects.toMatchObject({
      code: 'CLI_MODEL_FAILED',
    })
    expect(fake.prompts).toEqual([])
  })

  it('accepts a switch the CLI confirms', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    fake.setConfigResult = [modelOption('large')]
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'large' }))
    expect(fake.prompts).toHaveLength(1)
  })

  it('still tries the conventional id when the CLI did not list its options', async () => {
    const { fake, session } = setup(() => 'end_turn' as const)
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'large' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'model', value: 'large' }])
  })

  it('reapplies a chosen model after a resume', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    fake.capabilities = { sessionCapabilities: { resume: {} } }
    const messages = [assistantWithReplay('acp-old', 'dsh-1'), user('2', 'more')]
    await collect(session.stream({ messages, model: 'large' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-old', configId: 'model', value: 'large' }])
  })

  it('cannot be left waiting by an aborted switch', async () => {
    const { fake, session } = withModels()
    fake.setConfigOption = () => new Promise(() => {})
    const controller = new AbortController()
    const turn = collect(session.stream({ messages: [user('1', 'hi')], model: 'large', signal: controller.signal }))
    await vi.waitFor(() => expect(fake.newSessions).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort(new Error('stop'))
    await expect(turn).rejects.toThrow('stop')
  })

  describe('after reattaching', () => {
    const KNOWN = {
      configId: 'llm',
      current: 'small',
      options: [
        { value: 'small', name: 'Small' },
        { value: 'large', name: 'Large' },
      ],
    }
    const history = [assistantWithReplay('acp-old', 'dsh-1'), user('1', 'hi')]

    function resumed(extra: object, ...scripts: PromptScript[]) {
      const context = setupWith(extra, ...scripts)
      context.fake.capabilities = { sessionCapabilities: { resume: {} } }
      return context
    }

    // A resumed session reports the model it was left on, which may be one the user chose.
    it('takes default to mean the CLI default, not the model the session was left on', async () => {
      const { fake, session } = resumed({ knownModels: () => KNOWN }, () => 'end_turn' as const)
      fake.configOptions = [modelOption('large')]
      await collect(session.stream({ messages: history, model: 'default' }))
      expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-old', configId: 'model', value: 'small' }])
    })

    it('leaves the model alone when it cannot tell what default stands for', async () => {
      const { fake, session } = resumed({}, () => 'end_turn' as const)
      fake.configOptions = [modelOption('large')]
      await collect(session.stream({ messages: history, model: 'default' }))
      expect(fake.setConfigCalls).toEqual([])
    })

    it('uses what the CLI reported earlier when resuming reports no options', async () => {
      const { fake, session } = resumed({ knownModels: () => KNOWN }, () => 'end_turn' as const)
      fake.configOptions = undefined
      await collect(session.stream({ messages: history, model: 'large' }))
      expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-old', configId: 'llm', value: 'large' }])
    })

    it('does not switch when the session is already on the chosen model', async () => {
      const { fake, session } = resumed({ knownModels: () => KNOWN }, () => 'end_turn' as const)
      fake.configOptions = [modelOption('large')]
      await collect(session.stream({ messages: history, model: 'large' }))
      expect(fake.setConfigCalls).toEqual([])
    })

    it('refuses the session another CLI recorded and says it starts fresh', async () => {
      const { fake, session } = resumed({ provider: 'cli-y' }, () => 'end_turn' as const)
      const chunks = await collect(session.stream({ messages: history }))
      expect(fake.resumed).toEqual([])
      expect(fake.newSessions).toHaveLength(1)
      expect(textOf(chunks)).toContain('无法恢复')
    })
  })

  // The CLI may still act on a request this side stopped waiting for.
  it('does not trust the current model after a switch was interrupted', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    const answer = fake.setConfigOption.bind(fake)
    fake.setConfigOption = () => new Promise(() => {})
    const controller = new AbortController()
    const step = collect(session.stream({ messages: [user('1', 'hi')], model: 'large', signal: controller.signal }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort(new Error('stopped'))
    await expect(step).rejects.toThrow('stopped')
    session.abandonTurn()
    fake.setConfigOption = answer
    await collect(session.stream({ messages: [user('2', 'again')], model: 'small' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'model', value: 'small' }])
    expect(fake.prompts).toHaveLength(1)
  })

  it('follows a model change the CLI announces by itself', async () => {
    const { fake, session } = withModels(
      (f) => {
        f.update({ sessionUpdate: 'config_option_update', configOptions: [modelOption('large')] })
        return 'end_turn' as const
      },
      () => 'end_turn' as const,
    )
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    await collect(session.stream({ messages: [user('2', 'again')], model: 'small' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'model', value: 'small' }])
  })

  it('still says the CLI starts fresh when the first attempt failed before the prompt', async () => {
    const { fake, session } = withModels(() => 'end_turn' as const)
    fake.setConfigError = new Error('no such model')
    const messages = [assistantWithReplay('acp-old', 'someone-else'), user('1', 'hi')]
    await expect(collect(session.stream({ messages, model: 'large' }))).rejects.toThrow('no such model')
    session.abandonTurn()
    fake.setConfigError = undefined
    const chunks = await collect(session.stream({ messages: [...messages, user('2', 'again')], model: 'large' }))
    expect(textOf(chunks)).toContain('无法恢复')
  })
})
