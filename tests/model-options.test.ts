import { describe, expect, it } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import { readModelList } from '../src/model-options.ts'

const select = (fields: object): SessionConfigOption => ({
  id: 'model',
  name: 'Model',
  type: 'select',
  currentValue: 'a',
  options: [
    { value: 'a', name: 'A' },
    { value: 'b', name: 'B' },
  ],
  ...fields,
})

describe('readModelList', () => {
  it('reads the model option', () => {
    expect(readModelList([select({ category: 'model' })])).toEqual({
      configId: 'model',
      current: 'a',
      options: [
        { value: 'a', name: 'A' },
        { value: 'b', name: 'B' },
      ],
    })
  })

  // ACP names the category; the id is only a convention, so a CLI may use another.
  it('finds it by category under any id', () => {
    expect(readModelList([select({ id: 'llm', category: 'model' })])?.configId).toBe('llm')
  })

  it('prefers the category over an option merely called model', () => {
    const decoy = select({ id: 'model', category: 'mode' })
    const real = select({ id: 'llm', category: 'model' })
    expect(readModelList([decoy, real])?.configId).toBe('llm')
  })

  it('falls back to the conventional id', () => {
    expect(readModelList([select({})])?.configId).toBe('model')
  })

  it('flattens grouped options', () => {
    const grouped = select({
      options: [
        { group: 'x', name: 'X', options: [{ value: 'a', name: 'A' }] },
        { group: 'y', name: 'Y', options: [{ value: 'b', name: 'B' }] },
      ],
    })
    expect(readModelList([grouped])?.options).toEqual([
      { value: 'a', name: 'A' },
      { value: 'b', name: 'B' },
    ])
  })

  // Recorded from claude-agent-acp: only the description says which model this entry is.
  it('names a default entry after the model it describes', () => {
    const options = [
      { value: 'default', name: 'Default (recommended)', description: 'Opus 5.5' },
      { value: 'haiku', name: 'Haiku 5.5', description: 'Fastest for quick answers' },
    ]
    expect(readModelList([select({ category: 'model', currentValue: 'default', options })])?.options).toEqual([
      { value: 'default', name: 'Opus 5.5' },
      { value: 'haiku', name: 'Haiku 5.5' },
    ])
  })

  it.each([[undefined], [''], [5]])('keeps the name of a default entry whose description is %s', (description) => {
    const options = [{ value: 'default', name: 'Auto', description }]
    expect(readModelList([select({ category: 'model', currentValue: 'default', options })])?.options).toEqual([
      { value: 'default', name: 'Auto' },
    ])
  })

  it('ignores options that are not selects', () => {
    const toggle = { id: 'model', name: 'Model', type: 'boolean', currentValue: true } as unknown as SessionConfigOption
    expect(readModelList([toggle])).toBeUndefined()
  })

  it('finds nothing when the CLI lists no models', () => {
    expect(readModelList([select({ options: [] })])).toBeUndefined()
    expect(readModelList([select({ id: 'mode', category: 'mode' })])).toBeUndefined()
    expect(readModelList([])).toBeUndefined()
    expect(readModelList(undefined)).toBeUndefined()
  })
})

// The SDK does not validate responses, so these come straight from the CLI.
describe('readModelList with values a CLI should not have sent', () => {
  const asOptions = (value: unknown) => value as readonly SessionConfigOption[]

  it.each([
    ['a non-list', {}],
    ['a list of junk', [null, 'x', 5]],
    ['an option with no options', [select({ category: 'model', options: undefined })]],
    ['an option with non-list options', [select({ category: 'model', options: 'a,b' })]],
    ['an option with no current value', [select({ category: 'model', currentValue: undefined })]],
    ['an option with an empty current value', [select({ category: 'model', currentValue: '' })]],
    ['an option with no usable id', [select({ category: 'model', id: 5 })]],
    [
      'an option whose entries are all unusable',
      [select({ category: 'model', options: [{ value: '' }, { name: 'x' }] })],
    ],
  ])('finds no list in %s', (_name, value) => {
    expect(readModelList(asOptions(value))).toBeUndefined()
  })

  it('drops the entries it cannot use and keeps the rest', () => {
    const options = [
      null,
      'x',
      { value: '', name: 'empty' },
      { name: 'none' },
      { value: 5, name: 'number' },
      { value: 'ok', name: 'OK' },
    ]
    expect(readModelList(asOptions([select({ category: 'model', options })]))?.options).toEqual([
      { value: 'ok', name: 'OK' },
    ])
  })

  it.each([[undefined], [''], [5]])('names an entry after its value when its name is %s', (name) => {
    const options = [{ value: 'a', name }]
    expect(readModelList(asOptions([select({ category: 'model', options })]))?.options).toEqual([
      { value: 'a', name: 'a' },
    ])
  })

  it('skips a group whose options are not a list', () => {
    const options = [
      { group: 'g', name: 'G', options: 'nope' },
      { value: 'a', name: 'A' },
    ]
    expect(readModelList(asOptions([select({ category: 'model', options })]))?.options).toEqual([
      { value: 'a', name: 'A' },
    ])
  })
})
