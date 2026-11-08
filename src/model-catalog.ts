/**
 * What the model menu shows for each CLI. Asking a CLI means starting it, which can
 * take a while on a cold `npx` and for that command downloads and runs a package. So
 * filling the menu never asks: a CLI is only started once someone has chosen it, and
 * the menu refreshes when the answer arrives. Answers are saved, so a restarted plugin
 * can show the last known lists while it asks again.
 * @module dsh-ccgui/model-catalog
 */

import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import { DEFAULT_MODEL_ID } from './constants.ts'
import type { CliModelList, CliModelOption } from './model-options.ts'

/** What the catalog needs from the bridge. */
export interface ModelCatalogDeps {
  labelFor(provider: string): string | undefined
  probe(provider: string): Promise<CliModelList | undefined>
  /** The list for this route changed; the harness then refreshes its menus. */
  onUpdated(provider: string): void
  warn(message: string): void
  /** Keep every known list for the next run. */
  save(lists: ReadonlyMap<string, CliModelList>): Promise<void>
}

function nameOf(list: CliModelList, value: string): string {
  return list.options.find((option) => option.value === value)?.name ?? value
}

/** The harness rejects a catalog with duplicate ids, which would drop the whole CLI. */
function selectableOptions(options: readonly CliModelOption[]): readonly CliModelOption[] {
  return options.filter(
    ({ value }, index) => value !== DEFAULT_MODEL_ID && options.findIndex((option) => option.value === value) === index,
  )
}

/** Remembers each CLI's models, seeded from the lists an earlier run saved. */
export class CliModelCatalog {
  private lists: ReadonlyMap<string, CliModelList> = new Map()
  private asked: ReadonlySet<string> = new Set()
  /** Routes this run has a CLI's own answer for, as opposed to a restored list. */
  private answered: ReadonlySet<string> = new Set()

  constructor(private readonly deps: ModelCatalogDeps) {}

  /**
   * List a CLI's models. The default entry names the model it stands for, so the menu
   * always shows what is really in use.
   * @param provider - a CLI route.
   * @returns the default entry, followed by the real models once they are known.
   */
  listModels(provider: string): readonly LlmModelInfo[] {
    const list = this.lists.get(provider)
    if (list === undefined) {
      return [{ provider, id: DEFAULT_MODEL_ID, name: this.deps.labelFor(provider) ?? provider }]
    }
    return [
      { provider, id: DEFAULT_MODEL_ID, name: this.defaultName(list) },
      ...selectableOptions(list.options).map(({ value, name }) => ({ provider, id: value, name })),
    ]
  }

  /**
   * Name one model.
   * @param provider - a CLI route.
   * @param model - a model id.
   * @returns its display name, falling back to the id.
   */
  modelName(provider: string, model: string): string {
    const list = this.lists.get(provider)
    if (list === undefined) return model
    return model === DEFAULT_MODEL_ID ? this.defaultName(list) : nameOf(list, model)
  }

  /**
   * Read what a CLI reported.
   * @param provider - a CLI route.
   * @returns its model list, once known.
   */
  known(provider: string): CliModelList | undefined {
    return this.lists.get(provider)
  }

  /**
   * Ask a CLI for its models in the background, unless that is done or under way. A
   * failed attempt can be repeated: the user may have installed it or logged in since.
   * @param provider - a CLI route someone has chosen.
   */
  ensureListed(provider: string): void {
    if (this.asked.has(provider)) return
    this.asked = new Set([...this.asked, provider])
    this.deps
      .probe(provider)
      .then((list) => {
        if (list === undefined) return
        this.lists = new Map([...this.lists, [provider, list]])
        this.answered = new Set([...this.answered, provider])
        this.persist()
        this.deps.onUpdated(provider)
      })
      .catch((error: unknown) => {
        if (!this.answered.has(provider)) this.asked = new Set([...this.asked].filter((asked) => asked !== provider))
        this.deps.warn(`ccgui: could not list models for ${provider}: ${String(error)}`)
      })
  }

  /**
   * Show the lists an earlier run saved. They may be out of date, so they never replace
   * an answer from this run and do not stop the CLI from being asked when chosen.
   * @param saved - lists by provider route; routes no longer configured are skipped.
   */
  restore(saved: ReadonlyMap<string, CliModelList>): void {
    const restored = [...saved].filter(
      ([provider]) => !this.answered.has(provider) && this.deps.labelFor(provider) !== undefined,
    )
    this.lists = new Map([...this.lists, ...restored])
    for (const [provider] of restored) this.deps.onUpdated(provider)
  }

  private persist(): void {
    this.deps.save(this.lists).catch((error: unknown) => {
      this.deps.warn(`ccgui: could not save model lists: ${String(error)}`)
    })
  }

  private defaultName(list: CliModelList): string {
    return `${nameOf(list, list.current)}（默认）`
  }
}
