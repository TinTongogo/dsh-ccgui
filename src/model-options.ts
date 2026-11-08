/**
 * Reads a CLI's model list out of the configuration options ACP reports.
 * @module dsh-ccgui/model-options
 */

import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import { DEFAULT_MODEL_ID } from './constants.ts'

/** One model a CLI offers. */
export interface CliModelOption {
  readonly value: string
  readonly name: string
}

/** The models a CLI offers and which one is active. */
export interface CliModelList {
  /** Option id to send when switching; ACP does not fix this name. */
  readonly configId: string
  readonly current: string
  readonly options: readonly CliModelOption[]
}

const CONVENTIONAL_MODEL_OPTION_ID = 'model'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function flattenEntries(entries: unknown): readonly unknown[] {
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: unknown) => {
    if (!isObject(entry) || !('options' in entry)) return [entry]
    return Array.isArray(entry.options) ? (entry.options as unknown[]) : []
  })
}

/**
 * A CLI's own default entry can be named for its role, "Default (recommended)", with only the
 * description saying which model that is. The menu names the model, as it does for other CLIs.
 */
function readEntry(entry: unknown): readonly CliModelOption[] {
  if (!isObject(entry) || !isText(entry.value)) return []
  const name = entry.value === DEFAULT_MODEL_ID && isText(entry.description) ? entry.description : entry.name
  return [{ value: entry.value, name: isText(name) ? name : entry.value }]
}

/**
 * Find the model option. ACP marks it with a category, so that wins; the id is only
 * a convention, for CLIs that report no category. The SDK does not validate responses,
 * so everything here is checked: an empty name or id in the catalog would make the
 * harness drop the whole CLI from its menus.
 * @param configOptions - the options a CLI reported, if any.
 * @returns the model list, or undefined when the CLI offers no selectable models.
 */
export function readModelList(
  configOptions: readonly SessionConfigOption[] | null | undefined,
): CliModelList | undefined {
  const selects = (Array.isArray(configOptions) ? (configOptions as readonly unknown[]) : [])
    .filter(isObject)
    .filter((candidate) => candidate.type === 'select')
  const option =
    selects.find((candidate) => candidate.category === 'model') ??
    selects.find((candidate) => candidate.category == null && candidate.id === CONVENTIONAL_MODEL_OPTION_ID)
  if (option === undefined || !isText(option.id) || !isText(option.currentValue)) return undefined
  const options = flattenEntries(option.options).flatMap(readEntry)
  return options.length === 0 ? undefined : { configId: option.id, current: option.currentValue, options }
}
