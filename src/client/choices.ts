/**
 * What the composer's CLI switcher and model menu offer, derived from the model directory.
 * @module dsh-ccgui/client/choices
 */

import { CLI_ROUTE_PREFIX, DEFAULT_MODEL_ID } from '../constants.ts'

/** One model in the model directory. */
export interface DirectoryModel {
  readonly id: string
  readonly name: string
}

/** One provider group in the model directory. */
interface DirectoryGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly DirectoryModel[]
}

/** A session's model selection. */
export interface DirectorySelection {
  readonly provider: string
  readonly model: string
}

/** The fields of the model directory this switcher reads. */
export interface DirectoryState {
  readonly groups: readonly DirectoryGroup[]
  readonly current: DirectorySelection | null
  /** The selection on its way to the harness, if any. */
  readonly pending?: DirectorySelection | null
}

/** What the switcher renders. */
export interface CliChoices {
  /** False when no CLI is available, where the button would only repeat the model menu. */
  readonly visible: boolean
  readonly items: readonly { readonly id: string; readonly label: string }[]
  readonly currentId: string | undefined
  readonly currentLabel: string | undefined
}

/** What the model menu renders for a session on a CLI. */
export interface CliModels {
  readonly provider: string
  readonly name: string
  readonly rows: readonly DirectoryModel[]
  readonly currentId: string | undefined
  readonly currentName: string | undefined
  /** False while the only row is the stand-in a CLI has before it reports its models. */
  readonly listed: boolean
}

/**
 * List the models of the CLI a session is on.
 * @param state - the session's model directory.
 * @returns that CLI's rows, or undefined when the session is not on a CLI in the catalog.
 */
export function cliModels({ groups, current }: DirectoryState): CliModels | undefined {
  const group = groups.find((candidate) => candidate.id === current?.provider)
  if (!group?.id.startsWith(CLI_ROUTE_PREFIX)) return undefined
  const selected = group.models.find((model) => model.id === current?.model)
  return {
    provider: group.id,
    name: group.name,
    rows: group.models,
    currentId: selected?.id,
    currentName: selected?.name,
    listed: group.models.some((model) => model.name !== group.name),
  }
}

/**
 * List the providers to switch between.
 * @param state - the session's model directory.
 * @returns the menu's rows and the current choice.
 */
export function cliChoices({ groups, current }: DirectoryState): CliChoices {
  const selected = groups.find((group) => group.id === current?.provider)
  return {
    visible: groups.some((group) => group.id.startsWith(CLI_ROUTE_PREFIX)),
    items: groups.map((group) => ({ id: group.id, label: group.name })),
    currentId: selected?.id,
    currentLabel: selected?.name,
  }
}

/**
 * Pick the model a provider starts on. A CLI starts on its own default; any other
 * provider has no such entry, so it starts on the first model it lists.
 * @param state - the session's model directory.
 * @param provider - the chosen provider.
 * @returns the selection to apply, or undefined when there is nothing to change.
 */
export function selectionForChoice(
  { groups, current }: DirectoryState,
  provider: string,
): DirectorySelection | undefined {
  if (current?.provider === provider) return undefined
  const first = groups.find((group) => group.id === provider)?.models[0]
  if (first === undefined) return undefined
  return { provider, model: provider.startsWith(CLI_ROUTE_PREFIX) ? DEFAULT_MODEL_ID : first.id }
}
