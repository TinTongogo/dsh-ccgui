/**
 * Which vendor mark a model row shows in the model menu. A CLI such as OpenCode lists
 * models from many vendors under one provider, so the mark is read from the model itself
 * and the provider's own mark is only the fallback.
 * @module dsh-ccgui/client/model-marks
 */

import { markOf } from './provider-marks.ts'
import type { ProviderMarkId } from './provider-marks.ts'

/** The fields of a row this reads; the id and the display name are matched together. */
export interface ModelIdentity {
  readonly provider: string
  readonly model: string
  readonly name: string
}

// Short family names (K3, o4) only count at the start of a word, so `pro3` or `polk2`
// stay unclaimed. DeepSeek comes first: its names never contain the others' hints.
const FAMILIES: readonly (readonly [ProviderMarkId, RegExp])[] = [
  ['deepseek', /deepseek/i],
  ['kimi', /kimi|moonshot|(?:^|[\s/_.-])k\d/i],
  ['claude', /claude|(?:^|[\s/_.-])(?:opus|sonnet|haiku)(?:$|[\s/_.-]|\d)/i],
  ['codex', /gpt|codex|openai|(?:^|[\s/_.-])o\d(?:$|[\s/_.-])/i],
]

/**
 * Pick a model row's mark.
 * @param row - the row's provider, model id and display name.
 * @returns the vendor the model is recognised as, else the provider's own mark, else
 * undefined. The generic CLI mark is not used: on every row of a CLI's list it says nothing.
 */
export function modelMarkOf({ provider, model, name }: ModelIdentity): ProviderMarkId | undefined {
  const text = `${model} ${name}`
  const family = FAMILIES.find(([, pattern]) => pattern.test(text))
  if (family !== undefined) return family[0]
  const own = markOf(provider)
  return own === 'cli' ? undefined : own
}
