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

// ACP reports one cumulative usage per CLI turn, while the harness reads each step's usage
// as one model request; forwarding it inflated speed and context figures (issue #4).
describe('CliSession token usage', () => {
  it('does not forward the usage a CLI reports with its turn', async () => {
    const { session } = setup((t) => {
      t.update(text('ok'))
      return {
        stopReason: 'end_turn',
        usage: { totalTokens: 130, inputTokens: 10, outputTokens: 20, cachedReadTokens: 100 },
      }
    })
    const chunks = await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect(usageOf(chunks)).toEqual([])
    expect(chunks.at(-1)).toEqual(expect.objectContaining({ type: 'finish' }))
  })

  it('does not forward usage after a tool call step either', async () => {
    const released = gate()
    const { session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await released.wait
      t.update(toolUpdate('a', { status: 'completed' }))
      return { stopReason: 'end_turn', usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2 } }
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    released.open()
    await session.waitForTool(toolCallOf(first).id, never)
    const second = await collect(session.stream({ messages: [...messages, toolResult()] }))
    expect(usageOf([...first, ...second])).toEqual([])
    expect(second.at(-1)).toEqual(expect.objectContaining({ type: 'finish' }))
  })
})
