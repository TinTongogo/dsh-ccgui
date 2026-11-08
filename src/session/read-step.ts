/**
 * Reading one harness step out of a CLI turn: text and reasoning stream through, and the
 * step ends at the next tool call or at the end of the turn.
 * @module dsh-ccgui/session/read-step
 */

import type { LlmError, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { appendDelta, closeOpenBlock, EMPTY_BLOCKS } from '../stream-blocks.ts'
import type { BlockState } from '../stream-blocks.ts'
import type { ToolRecord } from '../tool-record.ts'
import { toolCallStep, turnEndStep, turnFailure } from './outcomes.ts'
import type { ReplayFields, StepResult } from './outcomes.ts'
import { addUsage, toTokenUsage, withUsage } from './turn-usage.ts'
import type { TurnEnd } from './turn-queue.ts'
import type { SessionEvent } from './types.ts'

/** What reading a step needs from its session. */
export interface StepSource {
  /** CLI display name used in user-facing messages. */
  readonly label: string
  /** @returns the next event; a failed or aborted wait abandons the turn. */
  readonly nextEvent: (signal: AbortSignal | undefined) => Promise<SessionEvent>
  /** Whether a turn is running or waiting, or events are still unread. */
  readonly hasWork: () => boolean
  /** Whether this dead session holds user input it can no longer deliver. */
  readonly owesInput: () => boolean
  readonly failure: () => LlmError | undefined
  /** @returns the call to hand to the harness, marked as handed off; undefined if it is gone. */
  readonly handOff: (acpId: string) => ToolRecord | undefined
  readonly replay: () => ReplayFields
}

/**
 * Read until the next tool call or the end of the CLI turn.
 * @param source - the session being read.
 * @param signal - cancellation; aborting abandons the turn.
 * @yields the step's stream chunks, ending with `finish`.
 */
export async function* readStep(source: StepSource, signal: AbortSignal | undefined): AsyncGenerator<StreamChunk> {
  let blocks = EMPTY_BLOCKS
  // Steering can end several CLI turns inside one step; the step reports them all.
  let usage: TokenUsage | undefined
  while (source.hasWork()) {
    const event = await source.nextEvent(signal)
    if (source.owesInput() && event.type === 'turn-end') continue
    if (event.type === 'turn-end') usage = addUsage(usage, toTokenUsage(event.usage))
    const step = applyEvent(source, blocks, event, usage)
    blocks = step.state
    yield* step.chunks
    if (step.done) return
  }
  if (source.owesInput()) throw source.failure() as LlmError
  const { state, chunks } = closeOpenBlock(blocks)
  const finish: StreamChunk = { type: 'finish', reason: { kind: 'stop' }, ...source.replay() }
  yield* withUsage({ state, chunks: [...chunks, finish], done: true }, usage).chunks
}

function applyEvent(
  source: StepSource,
  blocks: BlockState,
  event: SessionEvent,
  usage: TokenUsage | undefined,
): StepResult {
  switch (event.type) {
    case 'text':
    case 'reasoning':
      return { ...appendDelta(blocks, event.type, event.text), done: false }
    case 'tool-ready': {
      const record = source.handOff(event.acpId)
      return record === undefined
        ? { state: blocks, chunks: [], done: false }
        : toolCallStep(blocks, record, source.replay())
    }
    case 'turn-end':
      return applyTurnEnd(source, blocks, event, usage)
    case 'failure':
      throw turnFailure(event.error, source.label)
  }
}

/** Queued steering runs as the next CLI turn inside the same harness turn. */
function applyTurnEnd(
  source: StepSource,
  blocks: BlockState,
  end: Extract<TurnEnd, { type: 'turn-end' }>,
  usage: TokenUsage | undefined,
): StepResult {
  if (source.hasWork()) return { state: blocks, chunks: [], done: false }
  return withUsage(turnEndStep(blocks, end.stopReason, source.label, source.replay()), usage)
}
