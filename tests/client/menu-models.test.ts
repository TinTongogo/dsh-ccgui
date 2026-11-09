import { describe, expect, it } from 'vitest'
import type { DirectoryState } from '../../src/client/choices.ts'
import { isRow, menuModels, rowCount } from '../../src/client/menu-models.ts'

const REASONING = {
  efforts: [
    { id: 'low', name: 'Low' },
    { id: 'high', name: 'High' },
  ],
  defaultEffort: 'high',
}
const OFFICIAL = {
  id: 'deepseek-official',
  name: 'DeepSeek',
  models: [
    { id: 'flash', name: 'Flash', reasoning: REASONING },
    { id: 'pro', name: 'Pro' },
  ],
}
const ACCOUNT = { id: 'deepseek-account', name: 'deepseek-account', models: [{ id: 'flash', name: 'Flash' }] }
const OTHER = {
  id: 'acme',
  name: 'Acme',
  models: [{ id: 'a1', name: 'A1', reasoning: { efforts: REASONING.efforts } }],
}
const CLAUDE = {
  id: 'cli-claude',
  name: 'Claude Code',
  models: [
    { id: 'default', name: 'Opus（默认）' },
    { id: 'opus', name: 'Opus' },
  ],
}

const state = (fields: Partial<DirectoryState> = {}): DirectoryState => ({
  groups: [OTHER, CLAUDE, OFFICIAL, ACCOUNT],
  current: { provider: 'deepseek-official', model: 'flash' },
  ...fields,
})

describe('menuModels on a provider the harness runs', () => {
  it('lists every provider but the CLIs, account first and API key second, with headings', () => {
    const models = menuModels(state())
    expect(models.sections.map((section) => section.name)).toEqual(['DeepSeek 账号', 'DeepSeek', 'Acme'])
    expect(models.headed).toBe(true)
    expect(models.label).toBe('模型')
    expect(models.unlisted).toBeUndefined()
  })

  // The account and the API key offer the same model ids.
  it('finds the current model by provider and id together', () => {
    const models = menuModels(state())
    expect(models.current).toMatchObject({ provider: 'deepseek-official', model: 'flash' })
  })

  it('offers the current model levels and picks its default', () => {
    const models = menuModels(state())
    expect(models.efforts.map((level) => level.name)).toEqual(['Low', 'High'])
    expect(models.effort?.effort).toBe('high')
  })

  it('follows a level the session chose', () => {
    const current = { provider: 'deepseek-official', model: 'flash', reasoningEffort: 'low' }
    expect(menuModels(state({ current })).effort?.name).toBe('Low')
  })

  it('offers the provider its own choice when the model names no default', () => {
    const models = menuModels(state({ current: { provider: 'acme', model: 'a1' } }))
    expect(models.efforts.map((level) => level.name)).toEqual(['Default', 'Low', 'High'])
    expect(models.effort).toMatchObject({ key: 'provider-default', effort: undefined })
  })

  it('offers no levels for a model without them', () => {
    const models = menuModels(state({ current: { provider: 'deepseek-official', model: 'pro' } }))
    expect(models.efforts).toEqual([])
    expect(models.effort).toBeUndefined()
  })

  it('has no current model before a selection, and says when the catalog is still loading', () => {
    expect(menuModels(state({ current: null })).current).toBeUndefined()
    expect(menuModels(state({ status: 'loading' })).loading).toBe(true)
    expect(menuModels(state({ status: 'ready' })).loading).toBe(false)
  })
})

describe('menuModels on a CLI', () => {
  const onClaude = { provider: 'cli-claude', model: 'opus' }

  it("lists only that CLI's models, without a heading", () => {
    const models = menuModels(state({ current: onClaude }))
    expect(models.sections).toHaveLength(1)
    expect(models.sections[0]?.rows.map((row) => row.name)).toEqual(['Opus（默认）', 'Opus'])
    expect(models.headed).toBe(false)
    expect(models.label).toBe('Claude Code')
    expect(models.current?.name).toBe('Opus')
    expect(models.efforts).toEqual([])
  })

  it('names the CLI while only its stand-in is listed', () => {
    const waiting = { ...CLAUDE, models: [{ id: 'default', name: 'Claude Code' }] }
    const models = menuModels({ groups: [waiting], current: { provider: 'cli-claude', model: 'default' } })
    expect(models.unlisted).toBe('Claude Code')
  })
})

describe('row helpers', () => {
  const row = { provider: 'p', model: 'm', name: 'M' }

  it('matches a row on provider and model', () => {
    expect(isRow(row, { provider: 'p', model: 'm' })).toBe(true)
    expect(isRow(row, { provider: 'q', model: 'm' })).toBe(false)
    expect(isRow(row, null)).toBe(false)
  })

  it('counts rows across sections', () => {
    expect(
      rowCount([
        { id: 'a', name: 'A', rows: [row, row] },
        { id: 'b', name: 'B', rows: [row] },
      ]),
    ).toBe(3)
  })
})
