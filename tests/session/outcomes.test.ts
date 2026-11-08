import type { StopReason } from '@agentclientprotocol/sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { errorMessage, toolCallStep, turnEndStep, turnFailure } from '../../src/session/outcomes.ts'
import { nativeReplayState } from '../../src/request-input.ts'
import { appendDelta, EMPTY_BLOCKS } from '../../src/stream-blocks.ts'
import { mergeToolUpdate, toCliToolArgs } from '../../src/tool-record.ts'

const LABEL = 'X CLI'
const REPLAY = { replayState: nativeReplayState('acp-1', 'dsh-1') }

function finishOf(stopReason: StopReason): unknown {
  const { chunks } = turnEndStep(EMPTY_BLOCKS, stopReason, LABEL, REPLAY)
  return chunks.at(-1)
}

describe('errorMessage', () => {
  it('reads an Error and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(42)).toBe('42')
  })
})

describe('turnEndStep', () => {
  it.each([
    ['end_turn', { kind: 'stop' }],
    ['max_tokens', { kind: 'max-tokens' }],
    ['cancelled', { kind: 'aborted', failure: { message: 'X CLI 已取消本轮。', code: 'ABORTED' } }],
    ['refusal', { kind: 'error', failure: { message: 'X CLI 拒绝继续这个请求。', code: 'CLI_REFUSAL' } }],
    [
      'max_turn_requests',
      { kind: 'error', failure: { message: 'X CLI 达到了单轮请求次数上限。', code: 'CLI_TURN_LIMIT' } },
    ],
  ] as const)('finishes a %s turn as %o, carrying the replay state', (stopReason, reason) => {
    expect(finishOf(stopReason)).toEqual({ type: 'finish', reason, ...REPLAY })
  })

  it('reports a stop reason it does not know, by name', () => {
    expect(finishOf('something_new' as StopReason)).toEqual({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'X CLI 以未知原因结束：something_new', code: 'CLI_UNKNOWN_STOP' } },
      ...REPLAY,
    })
  })

  it('closes an open block before finishing, and ends the step', () => {
    const open = appendDelta(EMPTY_BLOCKS, 'text', 'hi').state
    const step = turnEndStep(open, 'end_turn', LABEL, {})
    expect(step.done).toBe(true)
    expect(step.chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(step.chunks.length).toBeGreaterThan(1)
  })
})

describe('toolCallStep', () => {
  it('hands the call to the harness as the mirror tool and ends the step', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', title: 'Run', status: 'in_progress' }, () => 'cli-1')
    const step = toolCallStep(EMPTY_BLOCKS, record, REPLAY)

    expect(step.done).toBe(true)
    expect(step.chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' }, ...REPLAY })
    expect(step.chunks).toContainEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: 'cli-1', name: 'cli_tool', arguments: JSON.stringify(toCliToolArgs(record)) },
    })
  })
})

describe('turnFailure', () => {
  it('passes an LlmError through unchanged', () => {
    const error = new LlmError('already readable', 'CLI_START_FAILED')
    expect(turnFailure(error, LABEL)).toBe(error)
  })

  it('wraps any other error with the CLI name, a code and the cause', () => {
    const cause = new Error('pipe closed')
    const wrapped = turnFailure(cause, LABEL)
    expect(wrapped).toBeInstanceOf(LlmError)
    expect(wrapped.message).toBe('X CLI 执行失败：pipe closed')
    expect(wrapped.code).toBe('CLI_PROMPT_FAILED')
    expect(wrapped.cause).toBe(cause)
  })
})
