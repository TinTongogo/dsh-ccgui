/**
 * Token usage a CLI reports for its turn, restated in the harness's terms so the
 * conversation shows speed and cache hits for CLI sessions too.
 *
 * ACP's `PromptResponse.usage` and the harness's `TokenUsage` agree that input
 * excludes cache reads (Claude Code reports Anthropic's split as is; Codex
 * subtracts cached input before reporting), so the counts map one to one.
 * @module dsh-ccgui/session/turn-usage
 */

import type { Usage } from '@agentclientprotocol/sdk'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { StepResult } from './outcomes.ts'

type OptionalCount = 'totalTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens'

/** Counts that are summed across turns whenever either turn reports them. */
const SUMMED_COUNTS = ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Omitting a count, rather than setting it to undefined, keeps "not reported" distinct from zero. */
function optionalCounts(counts: Readonly<Record<OptionalCount, unknown>>): Partial<Record<OptionalCount, number>> {
  return Object.fromEntries(Object.entries(counts).filter(([, value]) => isCount(value)))
}

/**
 * @param usage - what the CLI reported with its turn's stop reason.
 * @returns the harness's usage, or undefined when the CLI reported none it can use.
 */
export function toTokenUsage(usage: Usage | null | undefined): TokenUsage | undefined {
  if (usage === null || usage === undefined) return undefined
  const { inputTokens, outputTokens } = usage
  if (!isCount(inputTokens) || !isCount(outputTokens)) return undefined
  return {
    inputTokens,
    outputTokens,
    ...optionalCounts({
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cachedReadTokens,
      cacheWriteTokens: usage.cachedWriteTokens,
      reasoningTokens: usage.thoughtTokens,
    }),
  }
}

/**
 * Combine the usage of CLI turns that end within one harness step, as queued steering does.
 * The total stays only when both turns state one, because it must be exact.
 * @returns the combined usage, or undefined when neither turn reported any.
 */
export function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  const summed = SUMMED_COUNTS.flatMap((key) =>
    a[key] === undefined && b[key] === undefined ? [] : [[key, (a[key] ?? 0) + (b[key] ?? 0)] as const],
  )
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    ...(a.totalTokens === undefined || b.totalTokens === undefined
      ? {}
      : { totalTokens: a.totalTokens + b.totalTokens }),
    ...Object.fromEntries(summed),
  }
}

/**
 * The harness expects usage right before the terminal finish and nothing after it.
 * @param step - a step whose last chunk is its finish.
 * @param usage - the usage to report, if any.
 * @returns the step with its usage in place.
 */
export function withUsage(step: StepResult, usage: TokenUsage | undefined): StepResult {
  if (usage === undefined) return step
  return {
    ...step,
    chunks: [...step.chunks.slice(0, -1), { type: 'usage', usage }, ...step.chunks.slice(-1)],
  }
}
