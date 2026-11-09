import type { StopReason } from '@agentclientprotocol/sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { errorMessage, toolCallStep, turnEndStep, turnFailure } from '../../src/session/outcomes.ts'
import { ptcCall } from '../../src/session/ptc-call.ts'
import { nativeReplayState } from '../../src/request-input.ts'
import { appendDelta, EMPTY_BLOCKS } from '../../src/stream-blocks.ts'
import { mergeToolUpdate, toCliToolArgs } from '../../src/tool-record.ts'

const LABEL = 'X CLI'
const REPLAY = { replayState: nativeReplayState('acp-1', 'dsh-1') }

function finishOf(stopReason: StopReason, text = ''): unknown {
  const { chunks } = turnEndStep(EMPTY_BLOCKS, { stopReason, text }, LABEL, REPLAY)
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
    [
      'refusal',
      {
        kind: 'error',
        failure: {
          message: 'X CLI 拒绝继续这个请求，但未说明原因（可查看 CLI 日志了解详情）。',
          code: 'CLI_REFUSAL',
        },
      },
    ],
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
    const step = turnEndStep(open, { stopReason: 'end_turn', text: '' }, LABEL, {})
    expect(step.done).toBe(true)
    expect(step.chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(step.chunks.length).toBeGreaterThan(1)
  })
})

describe('refusal details', () => {
  // ACP has no error field on PromptResponse: the reason only arrives as streamed
  // text. Without carrying it into the failure the user sees an empty refusal.
  it('explains a refusal with what the CLI said', () => {
    expect(finishOf('refusal', 'Hy4 限时免费模型的额度已用尽，请切换模型。')).toMatchObject({
      reason: {
        kind: 'error',
        failure: {
          code: 'CLI_REFUSAL',
          message: 'X CLI 拒绝继续这个请求：Hy4 限时免费模型的额度已用尽，请切换模型。',
        },
      },
    })
  })

  it('collapses whitespace in the reason', () => {
    expect(finishOf('refusal', '  模型\n不可用  ')).toMatchObject({
      reason: { failure: { message: 'X CLI 拒绝继续这个请求：模型 不可用' } },
    })
  })

  it('keeps the tail of a long answer, where the reason usually is', () => {
    const message = (
      finishOf('refusal', 'a'.repeat(500) + 'QUOTA_EXCEEDED') as {
        reason: { failure: { message: string } }
      }
    ).reason.failure.message
    expect(message).toContain('QUOTA_EXCEEDED')
    expect(message.startsWith('X CLI 拒绝继续这个请求：…')).toBe(true)
    expect(message.length).toBeLessThan(450)
  })

  it('leaves a normal finish untouched even when the CLI produced text', () => {
    expect(finishOf('end_turn', 'a complete answer')).toMatchObject({ reason: { kind: 'stop' } })
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

  it('hands the call over as run_code in a PTC session', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', title: 'Run', status: 'in_progress' }, () => 'cli-1')
    const step = toolCallStep(EMPTY_BLOCKS, record, REPLAY, { timeoutMs: 1_000 })

    expect(step.done).toBe(true)
    expect(step.chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' }, ...REPLAY })
    expect(step.chunks).toContainEqual({
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id: 'cli-1',
        name: 'run_code',
        arguments: ptcCall(record, { timeoutMs: 1_000 }).arguments,
      },
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
