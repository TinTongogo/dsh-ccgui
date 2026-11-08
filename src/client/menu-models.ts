/**
 * What the composer's model control lists for a session. On a CLI that is the CLI's own
 * models. On anything else it is every provider the harness runs itself, with the CLIs left
 * out: a CLI cannot pick up a conversation it took no part in, which is also why the switcher
 * locks once a session has started. The harness's own seat lists every provider in its one
 * global catalog and offers no way to narrow it per session, so this control replaces it.
 * @module dsh-ccgui/client/menu-models
 */

import { CLI_ROUTE_PREFIX } from '../constants.ts'
import { cliModels } from './choices.ts'
import type { DirectoryGroup, DirectoryReasoning, DirectorySelection, DirectoryState } from './choices.ts'

const ACCOUNT_PROVIDER_ID = 'deepseek-account'
const OFFICIAL_PROVIDER_ID = 'deepseek-official'
/** The harness renames this group in its own menu; this one follows. */
const ACCOUNT_PROVIDER_NAME = 'DeepSeek 账号'
const MENU_LABEL = '模型'
/** The harness's own label for letting the provider pick the level, untranslated there too. */
const PROVIDER_DEFAULT_LABEL = 'Default'
const PROVIDER_DEFAULT_KEY = 'provider-default'
const LOADING_STATUS = 'loading'

/** One model row, which only the provider and the model id together identify. */
export interface MenuRow {
  readonly provider: string
  readonly model: string
  readonly name: string
  readonly reasoning?: DirectoryReasoning
}

/** One provider's rows. */
export interface MenuSection {
  readonly id: string
  readonly name: string
  readonly rows: readonly MenuRow[]
}

/** One reasoning level; `effort` is undefined for the provider's own choice. */
export interface EffortLevel {
  readonly key: string
  readonly effort: string | undefined
  readonly name: string
}

/** Everything the model control renders. */
export interface MenuModels {
  /** Names the open card for assistive technology. */
  readonly label: string
  readonly sections: readonly MenuSection[]
  /** Whether each section gets a heading; a CLI's single list needs none. */
  readonly headed: boolean
  readonly current: MenuRow | undefined
  /** The catalog has not arrived yet, so a missing current model is not yet a missing one. */
  readonly loading: boolean
  /** Names the CLI whose list is still the stand-in it has before reporting its models. */
  readonly unlisted: string | undefined
  /** The current model's levels; empty when it advertises none. */
  readonly efforts: readonly EffortLevel[]
  readonly effort: EffortLevel | undefined
}

/**
 * Tell whether a row is the given selection.
 * @param row - a row.
 * @param selection - a selection, if any.
 * @returns true when both name the same provider and model.
 */
export function isRow(
  row: MenuRow,
  selection: Pick<DirectorySelection, 'provider' | 'model'> | null | undefined,
): boolean {
  return row.provider === selection?.provider && row.model === selection.model
}

/**
 * Count the rows, which decides whether the card offers search.
 * @param sections - the sections to count.
 * @returns the number of rows across them.
 */
export function rowCount(sections: readonly MenuSection[]): number {
  return sections.reduce((count, section) => count + section.rows.length, 0)
}

function toSection({ id, name, models }: DirectoryGroup): MenuSection {
  return {
    id,
    name: id === ACCOUNT_PROVIDER_ID ? ACCOUNT_PROVIDER_NAME : name,
    rows: models.map(({ id: model, name: modelName, reasoning }) => ({
      provider: id,
      model,
      name: modelName,
      ...(reasoning === undefined ? {} : { reasoning }),
    })),
  }
}

/** The same order as the harness's menu: the account first, the API key second, the rest as listed. */
const providerRank = (id: string): number => (id === ACCOUNT_PROVIDER_ID ? 0 : id === OFFICIAL_PROVIDER_ID ? 1 : 2)

function effortLevels(reasoning: DirectoryReasoning | undefined): readonly EffortLevel[] {
  if (reasoning === undefined) return []
  const levels = reasoning.efforts.map(({ id, name }) => ({ key: `effort:${id}`, effort: id, name }))
  if (reasoning.defaultEffort !== undefined) return levels
  return [{ key: PROVIDER_DEFAULT_KEY, effort: undefined, name: PROVIDER_DEFAULT_LABEL }, ...levels]
}

type Listing = Pick<MenuModels, 'label' | 'sections' | 'headed' | 'unlisted'>

function listing(state: DirectoryState): Listing {
  const cli = cliModels(state)
  if (cli !== undefined) {
    const section = toSection({ id: cli.provider, name: cli.name, models: cli.rows })
    return { label: cli.name, sections: [section], headed: false, unlisted: cli.listed ? undefined : cli.name }
  }
  const sections = state.groups
    .filter((group) => !group.id.startsWith(CLI_ROUTE_PREFIX))
    .map(toSection)
    .sort((left, right) => providerRank(left.id) - providerRank(right.id))
  return { label: MENU_LABEL, sections, headed: true, unlisted: undefined }
}

/**
 * List what the model control offers a session.
 * @param state - the session's model directory.
 * @returns the sections, the current model and its reasoning levels.
 */
export function menuModels(state: DirectoryState): MenuModels {
  const listed = listing(state)
  const current = listed.sections.flatMap((section) => section.rows).find((row) => isRow(row, state.current))
  const efforts = effortLevels(current?.reasoning)
  const chosen = state.current?.reasoningEffort ?? current?.reasoning?.defaultEffort
  return {
    ...listed,
    current,
    loading: state.status === LOADING_STATUS,
    efforts,
    effort: efforts.find((level) => level.effort === chosen),
  }
}
