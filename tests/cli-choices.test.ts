import { describe, expect, it } from 'vitest'
import { cliChoices, cliModels, selectionForChoice } from '../src/client/choices.ts'
import type { DirectoryState } from '../src/client/choices.ts'

const DEEPSEEK = {
  id: 'deepseek-official',
  name: 'DeepSeek',
  models: [
    { id: 'flash', name: 'Flash' },
    { id: 'pro', name: 'Pro' },
  ],
}
const OPENCODE = {
  id: 'cli-opencode',
  name: 'OpenCode',
  models: [
    { id: 'default', name: 'Beam（默认）' },
    { id: 'beam', name: 'Beam' },
  ],
}
const CODEX = { id: 'cli-codex', name: 'Codex', models: [{ id: 'default', name: 'Codex' }] }

const state = (fields: Partial<DirectoryState> = {}): DirectoryState => ({
  groups: [DEEPSEEK, OPENCODE, CODEX],
  current: { provider: 'deepseek-official', model: 'flash' },
  ...fields,
})

describe('cliChoices', () => {
  it('lists every provider', () => {
    expect(cliChoices(state()).items).toEqual([
      { id: 'deepseek-official', label: 'DeepSeek' },
      { id: 'cli-opencode', label: 'OpenCode' },
      { id: 'cli-codex', label: 'Codex' },
    ])
  })

  it('marks the current provider', () => {
    const choices = cliChoices(state({ current: { provider: 'cli-codex', model: 'default' } }))
    expect(choices.currentId).toBe('cli-codex')
    expect(choices.currentLabel).toBe('Codex')
  })

  // Without any CLI this button would only repeat the model menu.
  it('stays hidden when no CLI is available', () => {
    expect(cliChoices(state({ groups: [DEEPSEEK] })).visible).toBe(false)
    expect(cliChoices(state({ groups: [] })).visible).toBe(false)
    expect(cliChoices(state()).visible).toBe(true)
  })

  it('has no current choice before the session has a model', () => {
    const choices = cliChoices(state({ current: null }))
    expect(choices.currentId).toBeUndefined()
    expect(choices.currentLabel).toBeUndefined()
  })

  it('does not name a provider that is not in the catalog', () => {
    expect(cliChoices(state({ current: { provider: 'gone', model: 'x' } })).currentLabel).toBeUndefined()
  })
})

describe('cliModels', () => {
  const onOpenCode = { provider: 'cli-opencode', model: 'beam' }

  it('lists only the models of the CLI the session is on', () => {
    expect(cliModels(state({ current: onOpenCode }))?.rows).toEqual(OPENCODE.models)
  })

  it('says which CLI and which model are in use', () => {
    const models = cliModels(state({ current: onOpenCode }))
    expect(models?.provider).toBe('cli-opencode')
    expect(models?.name).toBe('OpenCode')
    expect(models?.currentId).toBe('beam')
    expect(models?.currentName).toBe('Beam')
  })

  // Any other provider keeps the harness's menu, which also offers its effort levels.
  it('steps aside for a provider that is not a CLI', () => {
    expect(cliModels(state())).toBeUndefined()
  })

  it('steps aside until the session has a model', () => {
    expect(cliModels(state({ current: null }))).toBeUndefined()
  })

  it('steps aside for a CLI that is not in the catalog', () => {
    expect(cliModels(state({ current: { provider: 'cli-gone', model: 'default' } }))).toBeUndefined()
  })

  it('names no current model when the selected one is no longer listed', () => {
    const models = cliModels(state({ current: { provider: 'cli-opencode', model: 'gone' } }))
    expect(models?.currentId).toBeUndefined()
    expect(models?.currentName).toBeUndefined()
  })

  // Before a CLI has answered, its only row is a stand-in that carries the CLI's own name.
  it('knows a CLI has not reported its models yet', () => {
    expect(cliModels(state({ current: { provider: 'cli-codex', model: 'default' } }))?.listed).toBe(false)
  })

  it('knows a CLI has reported its models', () => {
    expect(cliModels(state({ current: onOpenCode }))?.listed).toBe(true)
  })
})

describe('selectionForChoice', () => {
  it('starts a CLI on its own default model', () => {
    expect(selectionForChoice(state(), 'cli-opencode')).toEqual({ provider: 'cli-opencode', model: 'default' })
  })

  it('starts any other provider on its first model', () => {
    const current = { provider: 'cli-codex', model: 'default' }
    expect(selectionForChoice(state({ current }), 'deepseek-official')).toEqual({
      provider: 'deepseek-official',
      model: 'flash',
    })
  })

  it('does nothing when the provider is already selected', () => {
    expect(selectionForChoice(state(), 'deepseek-official')).toBeUndefined()
  })

  it('does nothing for an unknown provider or one with no models', () => {
    expect(selectionForChoice(state(), 'gone')).toBeUndefined()
    const empty = { id: 'empty', name: 'Empty', models: [] }
    expect(selectionForChoice(state({ groups: [DEEPSEEK, empty] }), 'empty')).toBeUndefined()
  })
})
