/**
 * How a CLI turn's ending reads to the harness, and the chunks that close a harness step.
 * @module dsh-ccgui/session/outcomes
 */

import type { StopReason } from '@agentclientprotocol/sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CLI_TOOL_NAME } from '../constants.ts'
import { closeOpenBlock, toolCallChunks } from '../stream-blocks.ts'
import type { BlockState, BlockTransition } from '../stream-blocks.ts'
import { toCliToolArgs } from '../tool-record.ts'
import type { ToolRecord } from '../tool-record.ts'
import { ptcCall } from './ptc-call.ts'
import type { PtcWrap, StreamToolCall } from './ptc-call.ts'

/** Extra fields every `finish` chunk carries so the harness can resume the native session. */
export type ReplayFields = Partial<Pick<Extract<StreamChunk, { type: 'finish' }>, 'replayState'>>

/** One step of reading, and whether it ends the harness step. */
export interface StepResult extends BlockTransition {
  readonly done: boolean
}

/** @returns the error's message, or its string form for anything thrown that is not an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failureFinish(message: string, code: string): FinishReason {
  return { kind: 'error', failure: { message, code } }
}

/**
 * Map an ACP stop reason onto the harness's finish reason.
 * @param stopReason - why the CLI ended its turn.
 * @param label - CLI display name used in user-facing messages.
 * @returns the finish reason the harness should record.
 */
function finishReason(stopReason: StopReason, label: string): FinishReason {
  switch (stopReason) {
    case 'end_turn':
      return { kind: 'stop' }
    case 'max_tokens':
      return { kind: 'max-tokens' }
    case 'cancelled':
      return { kind: 'aborted', failure: { message: `${label} 已取消本轮。`, code: 'ABORTED' } }
    case 'refusal':
      return failureFinish(`${label} 拒绝继续这个请求。`, 'CLI_REFUSAL')
    case 'max_turn_requests':
      return failureFinish(`${label} 达到了单轮请求次数上限。`, 'CLI_TURN_LIMIT')
    default:
      return failureFinish(`${label} 以未知原因结束：${String(stopReason)}`, 'CLI_UNKNOWN_STOP')
  }
}

function mirroredCall(record: ToolRecord): StreamToolCall {
  return { id: record.callId, name: CLI_TOOL_NAME, arguments: JSON.stringify(toCliToolArgs(record)) }
}

/**
 * End a harness step at a tool call the harness should run as the mirror tool.
 * @param ptc - set in a PTC session, where the call goes out wrapped in `run_code`.
 * @returns the tool-call chunks followed by a `tool-calls` finish.
 */
export function toolCallStep(blocks: BlockState, record: ToolRecord, replay: ReplayFields, ptc?: PtcWrap): StepResult {
  const call = ptc === undefined ? mirroredCall(record) : ptcCall(record, ptc)
  const { state, chunks } = toolCallChunks(blocks, call)
  return { state, chunks: [...chunks, { type: 'finish', reason: { kind: 'tool-calls' }, ...replay }], done: true }
}

/**
 * End a harness step at the end of the CLI turn.
 * @returns the closing chunks followed by the turn's finish.
 */
export function turnEndStep(
  blocks: BlockState,
  stopReason: StopReason,
  label: string,
  replay: ReplayFields,
): StepResult {
  const { state, chunks } = closeOpenBlock(blocks)
  return {
    state,
    chunks: [...chunks, { type: 'finish', reason: finishReason(stopReason, label), ...replay }],
    done: true,
  }
}

/** @returns the turn's failure as the error the harness reports. */
export function turnFailure(error: Error, label: string): LlmError {
  return error instanceof LlmError
    ? error
    : new LlmError(`${label} 执行失败：${error.message}`, 'CLI_PROMPT_FAILED', { cause: error })
}
