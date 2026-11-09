import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import {
  collect,
  gate,
  never,
  setup,
  text,
  toolCall,
  toolCallOf,
  toolResult,
  toolUpdate,
  user,
} from './fixtures/cli-session-helpers.ts'

const usageOf = (chunks: readonly StreamChunk[]) => chunks.filter((chunk) => chunk.type === 'usage')

describe('CliSession token usage', () => {
  it('reports the turn usage right before the finish', async () => {
    const { session } = setup((t) => {
      t.update(text('ok'))
      return {
        stopReason: 'end_turn',
        usage: { totalTokens: 130, inputTokens: 10, outputTokens: 20, cachedReadTokens: 100 },
      }
    })
    const chunks = await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(chunks.slice(-2)).toEqual([
      { type: 'usage', usage: { totalTokens: 130, inputTokens: 10, outputTokens: 20, cacheReadTokens: 100 } },
      expect.objectContaining({ type: 'finish' }),
    ])
  })

  it('reports nothing for a CLI that sends no usage', async () => {
    const { session } = setup(() => 'end_turn')
    expect(usageOf(await collect(session.stream({ messages: [user('1', 'hi')] })))).toEqual([])
  })

  it('reports usage on the step that ends the turn, not on a tool call step', async () => {
    const released = gate()
    const { session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await released.wait
      t.update(toolUpdate('a', { status: 'completed' }))
      return { stopReason: 'end_turn', usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2 } }
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    expect(usageOf(first)).toEqual([])
    released.open()
    await session.waitForTool(toolCallOf(first).id, never)
    const second = await collect(session.stream({ messages: [...messages, toolResult()] }))
    expect(usageOf(second)).toEqual([{ type: 'usage', usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2 } }])
  })

  it('adds up the turns that steering runs within one step', async () => {
    const released = gate()
    const { session } = setup(
      async (t) => {
        t.update(toolCall('a', { status: 'in_progress' }))
        await released.wait
        t.update(toolUpdate('a', { status: 'completed' }))
        return { stopReason: 'end_turn', usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2 } }
      },
      (t) => {
        t.update(text('steered'))
        return { stopReason: 'end_turn', usage: { totalTokens: 7, inputTokens: 3, outputTokens: 4 } }
      },
    )
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    released.open()
    await session.waitForTool(toolCallOf(first).id, never)
    const second = await collect(session.stream({ messages: [...messages, toolResult(), user('2', 'also')] }))
    expect(usageOf(second)).toEqual([{ type: 'usage', usage: { totalTokens: 10, inputTokens: 4, outputTokens: 6 } }])
  })
})
