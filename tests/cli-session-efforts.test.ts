import { describe, expect, it, vi } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import type { PromptScript } from './fixtures/fake-transport.ts'
import {
  assistantWithReplay,
  collect,
  setupWith,
  textOf,
  toolCall,
  toolCallOf,
  toolResult,
  user,
  never,
} from './fixtures/cli-session-helpers.ts'
import type { CliEffortList } from '../src/model-options.ts'

const modelOption = (currentValue: string): SessionConfigOption => ({
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue,
  options: [
    { value: 'small', name: 'Small' },
    { value: 'fast', name: 'Fast' },
  ],
})

const thinking = (currentValue: string, values: readonly string[] = ['low', 'high', 'max']): SessionConfigOption => ({
  id: 'thinking',
  name: 'Thinking',
  category: 'thought_level',
  type: 'select',
  currentValue,
  options: values.map((value) => ({ value, name: value.toUpperCase() })),
})

function withEfforts(...scripts: PromptScript[]) {
  const onEfforts = vi.fn((_model: string, _effort: CliEffortList | undefined) => {})
  const context = setupWith({ onEfforts }, ...scripts)
  context.fake.configOptions = [modelOption('small'), thinking('high')]
  return { ...context, onEfforts }
}

const end = () => 'end_turn' as const

describe('CliSession reasoning level', () => {
  it('sets the chosen level before the prompt goes out', async () => {
    const { fake, session } = withEfforts(end)
    await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-1', configId: 'thinking', value: 'max' }])
    expect(fake.operations).toEqual(['set:max', 'prompt'])
  })

  it('leaves the CLI alone when no level is chosen', async () => {
    const { fake, session } = withEfforts(end)
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('leaves the CLI alone when the chosen level is already set', async () => {
    const { fake, session } = withEfforts(end)
    await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'high' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('sets the level once, not on every step', async () => {
    const { fake, session } = withEfforts(end, end)
    await collect(session.stream({ messages: [user('1', 'one')], reasoningEffort: 'low' }))
    await collect(session.stream({ messages: [user('1', 'one'), user('2', 'two')], reasoningEffort: 'low' }))
    expect(fake.setConfigCalls).toHaveLength(1)
  })

  it('does not touch the level on a continuation step', async () => {
    const { fake, session } = withEfforts((t) => {
      t.update(toolCall('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    await session.waitForTool(toolCallOf(first).id, never)
    await collect(session.stream({ messages: [...messages, toolResult()], reasoningEffort: 'max' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  // Switching the model can change the levels; the level is set against the new model's.
  it('switches the model first, then sets the level the new model offers', async () => {
    const { fake, session } = withEfforts(end)
    fake.setConfigOption = (sessionId, configId, value) => {
      fake.setConfigCalls.push({ sessionId, configId, value })
      return Promise.resolve(
        configId === 'model'
          ? [modelOption(value), thinking('max', ['on', 'max'])]
          : [modelOption('fast'), thinking(value, ['on', 'max'])],
      )
    }
    await collect(session.stream({ messages: [user('1', 'hi')], model: 'fast', reasoningEffort: 'on' }))
    expect(fake.setConfigCalls.map(({ configId, value }) => `${configId}:${value}`)).toEqual([
      'model:fast',
      'thinking:on',
    ])
  })

  // The harness checked the level against the levels it last knew; a CLI that has since
  // reported other levels keeps its own rather than failing the message.
  it('keeps the CLI level when the chosen one is not offered', async () => {
    const { fake, session } = withEfforts(end)
    await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'ultra' }))
    expect(fake.setConfigCalls).toEqual([])
    expect(fake.prompts).toHaveLength(1)
  })

  it('tells the user when the chosen level is not offered', async () => {
    const { session } = withEfforts(end)
    const chunks = await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'ultra' }))
    expect(textOf(chunks)).toContain('不支持思考强度 ultra')
    expect(textOf(chunks)).toContain('high')
  })

  it('ignores a level for a CLI that offers none', async () => {
    const { fake, session } = withEfforts(end)
    fake.configOptions = [modelOption('small')]
    await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' }))
    expect(fake.setConfigCalls).toEqual([])
  })

  it('does not send the message when the CLI refuses the level', async () => {
    const { fake, session } = withEfforts()
    fake.setConfigError = new Error('bad level')
    await expect(
      collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' })),
    ).rejects.toMatchObject({
      code: 'CLI_EFFORT_FAILED',
    })
    expect(fake.prompts).toEqual([])
    expect(session.sentMessageIds.has('1')).toBe(false)
  })

  it('does not trust a level the CLI reports back as something else', async () => {
    const { fake, session } = withEfforts()
    fake.setConfigResult = [modelOption('small'), thinking('high')]
    await expect(
      collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' })),
    ).rejects.toMatchObject({
      code: 'CLI_EFFORT_FAILED',
    })
  })

  it('sets the level again after a failed attempt', async () => {
    const { fake, session } = withEfforts(end)
    fake.setConfigError = new Error('busy')
    await expect(collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' }))).rejects.toThrow()
    fake.setConfigError = undefined
    await collect(session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max' }))
    expect(fake.setConfigCalls).toHaveLength(2)
  })

  it('cannot be left waiting by an aborted change', async () => {
    const { fake, session } = withEfforts()
    fake.setConfigOption = () => new Promise(() => {})
    const controller = new AbortController()
    const turn = collect(
      session.stream({ messages: [user('1', 'hi')], reasoningEffort: 'max', signal: controller.signal }),
    )
    await vi.waitFor(() => expect(fake.newSessions).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort(new Error('stop'))
    await expect(turn).rejects.toThrow('stop')
  })

  it('reads the levels a resumed session reports', async () => {
    const { fake, session } = withEfforts(end)
    fake.capabilities = { sessionCapabilities: { resume: {} } }
    const messages = [assistantWithReplay('acp-old', 'dsh-1'), user('2', 'more')]
    await collect(session.stream({ messages, reasoningEffort: 'low' }))
    expect(fake.setConfigCalls).toEqual([{ sessionId: 'acp-old', configId: 'thinking', value: 'low' }])
  })

  describe('reporting what the CLI offers', () => {
    it('reports the levels of the model a new session starts on', async () => {
      const { session, onEfforts } = withEfforts(end)
      await collect(session.stream({ messages: [user('1', 'hi')] }))
      expect(onEfforts).toHaveBeenCalledWith('small', {
        configId: 'thinking',
        current: 'high',
        options: [
          { value: 'low', name: 'LOW' },
          { value: 'high', name: 'HIGH' },
          { value: 'max', name: 'MAX' },
        ],
      })
    })

    it('reports a model without levels as offering none', async () => {
      const { fake, session, onEfforts } = withEfforts(end)
      fake.configOptions = [modelOption('small')]
      await collect(session.stream({ messages: [user('1', 'hi')] }))
      expect(onEfforts).toHaveBeenCalledWith('small', undefined)
    })

    it('reports the levels after a model switch', async () => {
      const { fake, session, onEfforts } = withEfforts(end)
      fake.setConfigResult = [modelOption('fast'), thinking('max', ['on', 'max'])]
      await collect(session.stream({ messages: [user('1', 'hi')], model: 'fast' }))
      expect(onEfforts).toHaveBeenLastCalledWith('fast', expect.objectContaining({ current: 'max' }))
    })

    it('reports levels the CLI changes on its own', async () => {
      const { session, onEfforts } = withEfforts((t) => {
        t.update({
          sessionUpdate: 'config_option_update',
          configOptions: [modelOption('fast'), thinking('on', ['on'])],
        })
        return 'end_turn' as const
      })
      await collect(session.stream({ messages: [user('1', 'hi')] }))
      expect(onEfforts).toHaveBeenLastCalledWith('fast', expect.objectContaining({ current: 'on' }))
    })

    // The harness checks the level again on every step of a turn, against what the catalog
    // says now; changing it mid-turn would fail a level the turn started with.
    it('holds what it learns until the turn ends', async () => {
      let reportedDuringTurn = -1
      const { fake, session, onEfforts } = withEfforts(() => {
        reportedDuringTurn = onEfforts.mock.calls.length
        return 'end_turn' as const
      })
      fake.setConfigResult = [modelOption('fast'), thinking('max', ['on', 'max'])]
      await collect(session.stream({ messages: [user('1', 'hi')], model: 'fast' }))
      expect(reportedDuringTurn).toBe(0)
      expect(onEfforts.mock.calls.map(([model]) => model)).toEqual(['small', 'fast'])
    })

    it('reports nothing when the CLI does not say which model is active', async () => {
      const { fake, session, onEfforts } = withEfforts(end)
      fake.configOptions = [thinking('high')]
      await collect(session.stream({ messages: [user('1', 'hi')] }))
      expect(onEfforts).not.toHaveBeenCalled()
    })
  })
})
