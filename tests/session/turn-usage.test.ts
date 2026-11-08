import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { EMPTY_BLOCKS } from '../../src/stream-blocks.ts'
import { addUsage, toTokenUsage, withUsage } from '../../src/session/turn-usage.ts'

const FINISH: StreamChunk = { type: 'finish', reason: { kind: 'stop' } }

describe('toTokenUsage', () => {
  it('maps every ACP field onto its harness name', () => {
    expect(
      toTokenUsage({
        totalTokens: 180,
        inputTokens: 20,
        outputTokens: 60,
        cachedReadTokens: 90,
        cachedWriteTokens: 10,
        thoughtTokens: 15,
      }),
    ).toEqual({
      totalTokens: 180,
      inputTokens: 20,
      outputTokens: 60,
      cacheReadTokens: 90,
      cacheWriteTokens: 10,
      reasoningTokens: 15,
    })
  })

  it('leaves out optional counts the CLI did not report', () => {
    expect(toTokenUsage({ totalTokens: 3, inputTokens: 1, outputTokens: 2, cachedReadTokens: null })).toStrictEqual({
      totalTokens: 3,
      inputTokens: 1,
      outputTokens: 2,
    })
  })

  it('drops an optional count that is not a token count', () => {
    expect(toTokenUsage({ totalTokens: Number.NaN, inputTokens: 1, outputTokens: 2, thoughtTokens: -1 })).toStrictEqual(
      { inputTokens: 1, outputTokens: 2 },
    )
  })

  it('reports nothing without usage or with unusable input and output counts', () => {
    expect(toTokenUsage(undefined)).toBeUndefined()
    expect(toTokenUsage(null)).toBeUndefined()
    expect(toTokenUsage({ totalTokens: 1, inputTokens: -1, outputTokens: 2 })).toBeUndefined()
    expect(toTokenUsage({ totalTokens: 1, inputTokens: 1, outputTokens: Number.POSITIVE_INFINITY })).toBeUndefined()
  })
})

describe('addUsage', () => {
  it('keeps whichever side exists', () => {
    const usage = { inputTokens: 1, outputTokens: 2 }
    expect(addUsage(undefined, undefined)).toBeUndefined()
    expect(addUsage(usage, undefined)).toBe(usage)
    expect(addUsage(undefined, usage)).toBe(usage)
  })

  it('sums the counts of two turns', () => {
    expect(
      addUsage(
        { inputTokens: 1, outputTokens: 2, totalTokens: 13, cacheReadTokens: 10 },
        { inputTokens: 3, outputTokens: 4, totalTokens: 7, reasoningTokens: 1 },
      ),
    ).toStrictEqual({ inputTokens: 4, outputTokens: 6, totalTokens: 20, cacheReadTokens: 10, reasoningTokens: 1 })
  })

  it('drops the total unless both turns state one', () => {
    expect(
      addUsage({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }, { inputTokens: 1, outputTokens: 1 }),
    ).toStrictEqual({ inputTokens: 2, outputTokens: 3 })
  })
})

describe('withUsage', () => {
  const step = { state: EMPTY_BLOCKS, chunks: [FINISH], done: true }

  it('puts the usage just before the finish', () => {
    const usage = { inputTokens: 1, outputTokens: 2 }
    expect(withUsage(step, usage).chunks).toEqual([{ type: 'usage', usage }, FINISH])
  })

  it('leaves the step alone without usage', () => {
    expect(withUsage(step, undefined)).toBe(step)
  })
})
