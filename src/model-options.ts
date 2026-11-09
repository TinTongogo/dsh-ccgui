/**
 * Reads a CLI's model list, and the reasoning levels of its active model, out of the
 * configuration options ACP reports.
 * @module dsh-ccgui/model-options
 */

import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import { DEFAULT_MODEL_ID } from './constants.ts'

/** One model a CLI offers. */
export interface CliModelOption {
  readonly value: string
  readonly name: string
}

/** The reasoning levels a model offers and which one is set. */
export interface CliEffortList {
  /** Option id to send when changing the level; each CLI names it differently. */
  readonly configId: string
  readonly current: string
  readonly options: readonly CliModelOption[]
}

/** The models a CLI offers and which one is active. */
export interface CliModelList {
  /** Option id to send when switching; ACP does not fix this name. */
  readonly configId: string
  readonly current: string
  readonly options: readonly CliModelOption[]
  /**
   * Reasoning levels by model id, for the models seen so far: `null` for a model seen to
   * offer none. Absent when no model has been seen with levels.
   */
  readonly efforts?: Readonly<Record<string, CliEffortList | null>>
}

/** An entry as read, before names it shares with others are told apart. */
interface ReadEntry extends CliModelOption {
  readonly description: string | undefined
}

const CONVENTIONAL_MODEL_OPTION_ID = 'model'
const MODEL_CATEGORY = 'model'
const EFFORT_CATEGORY = 'thought_level'
const NAME_SEPARATOR = ' · '

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
function readEntry(entry: unknown): readonly ReadEntry[] {
  if (!isObject(entry) || !isText(entry.value)) return []
  const name = entry.value === DEFAULT_MODEL_ID && isText(entry.description) ? entry.description : entry.name
  const description = isText(entry.description) ? entry.description : undefined
  return [{ value: entry.value, name: isText(name) ? name : entry.value, description }]
}

/**
 * A CLI can list several models under one name, CodeBuddy's free and paid tiers of Hy4 among
 * them, which would leave rows nobody can tell apart. Such names gain what does tell them apart:
 * the descriptions when those differ, otherwise the ids. The default entry is left alone, as the
 * catalog labels it on its own and it is expected to share its model's name.
 */
function distinguishNames(entries: readonly ReadEntry[]): readonly CliModelOption[] {
  const named = entries.filter(({ value }) => value !== DEFAULT_MODEL_ID)
  const peersOf = (name: string): readonly ReadEntry[] => named.filter((entry) => entry.name === name)
  return entries.map(({ value, name, description }) => {
    const peers = peersOf(name)
    if (value === DEFAULT_MODEL_ID || peers.length < 2) return { value, name }
    const descriptions = new Set(peers.map((peer) => peer.description))
    const byDescription = descriptions.size === peers.length && !descriptions.has(undefined)
    return { value, name: `${name}${NAME_SEPARATOR}${(byDescription ? description : undefined) ?? value}` }
  })
}

type ConfigOptions = readonly SessionConfigOption[] | null | undefined

function selectsOf(configOptions: ConfigOptions): readonly Record<string, unknown>[] {
  return (Array.isArray(configOptions) ? (configOptions as readonly unknown[]) : [])
    .filter(isObject)
    .filter((candidate) => candidate.type === 'select')
}

/** A level is shown under its own name; the default-model naming does not apply to it. */
function readLevel(entry: unknown): readonly CliModelOption[] {
  if (!isObject(entry) || !isText(entry.value)) return []
  return [{ value: entry.value, name: isText(entry.name) ? entry.name : entry.value }]
}

/** The harness rejects repeated level ids, so only the first of each is kept. */
function uniqueOptions(options: readonly CliModelOption[]): readonly CliModelOption[] {
  return options.filter(({ value }, index) => options.findIndex((option) => option.value === value) === index)
}

/**
 * Find the reasoning level option. Only ACP's category identifies it: the ids differ
 * between CLIs (`effort`, `thinking`, `reasoning_effort`), and an id alone could be
 * some other setting. Checked like the model option, as the SDK does not validate it.
 * @param configOptions - the options a CLI reported, if any.
 * @returns the levels, or undefined when the active model offers none.
 */
export function readEffortList(configOptions: ConfigOptions): CliEffortList | undefined {
  const option = selectsOf(configOptions).find((candidate) => candidate.category === EFFORT_CATEGORY)
  if (option === undefined || !isText(option.id) || !isText(option.currentValue)) return undefined
  const options = uniqueOptions(flattenEntries(option.options).flatMap(readLevel))
  return options.length === 0 ? undefined : { configId: option.id, current: option.currentValue, options }
}

/**
 * Find the model option. ACP marks it with a category, so that wins; the id is only
 * a convention, for CLIs that report no category. The SDK does not validate responses,
 * so everything here is checked: an empty name or id in the catalog would make the
 * harness drop the whole CLI from its menus.
 * @param configOptions - the options a CLI reported, if any.
 * @returns the model list, with the active model's reasoning levels when it has any, or
 * undefined when the CLI offers no selectable models.
 */
export function readModelList(configOptions: ConfigOptions): CliModelList | undefined {
  const selects = selectsOf(configOptions)
  const option =
    selects.find((candidate) => candidate.category === MODEL_CATEGORY) ??
    selects.find((candidate) => candidate.category == null && candidate.id === CONVENTIONAL_MODEL_OPTION_ID)
  if (option === undefined || !isText(option.id) || !isText(option.currentValue)) return undefined
  const options = distinguishNames(flattenEntries(option.options).flatMap(readEntry))
  if (options.length === 0) return undefined
  const effort = readEffortList(configOptions)
  const list = { configId: option.id, current: option.currentValue, options }
  return effort === undefined ? list : { ...list, efforts: { [option.currentValue]: effort } }
}
