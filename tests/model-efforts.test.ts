import { describe, expect, it } from 'vitest'
import { learnEfforts, reasoningFor } from '../src/model-efforts.ts'
import type { CliEffortList, CliModelList } from '../src/model-options.ts'

const THREE: CliEffortList = {
  configId: 'thinking',
  current: 'high',
  options: [
    { value: 'low', name: 'Low' },
    { value: 'high', name: 'High' },
    { value: 'max', name: 'Max' },
  ],
}

const TWO: CliEffortList = {
  configId: 'thinking',
  current: 'max',
  options: [
    { value: 'on', name: 'On' },
    { value: 'max', name: 'Max' },
  ],
}

const LIST: CliModelList = {
  configId: 'model',
  current: 'small',
  options: [
    { value: 'small', name: 'Small' },
    { value: 'large', name: 'Large' },
    { value: 'fast', name: 'Fast' },
  ],
  efforts: { small: THREE },
}

describe('reasoningFor', () => {
  it('offers the levels the CLI reported, defaulting to the one it is set to', () => {
    expect(reasoningFor(LIST, 'small')).toEqual({
      efforts: [
        { id: 'low', name: 'Low' },
        { id: 'high', name: 'High' },
        { id: 'max', name: 'Max' },
      ],
      defaultEffort: 'high',
    })
  })

  it('treats the default entry as the model it stands for', () => {
    expect(reasoningFor(LIST, 'default')).toEqual(reasoningFor(LIST, 'small'))
  })

  // Only the default model is seen before a session; asking each model would mean switching
  // the CLI through all of them.
  it('lends a model never seen the levels of the default model', () => {
    expect(reasoningFor(LIST, 'large')).toEqual(reasoningFor(LIST, 'small'))
  })

  it('uses what a model reported once it has been seen', () => {
    const list = { ...LIST, efforts: { ...LIST.efforts, large: TWO } }
    expect(reasoningFor(list, 'large')?.efforts.map(({ id }) => id)).toEqual(['on', 'max'])
  })

  it('offers no levels for a model seen to have none', () => {
    expect(reasoningFor({ ...LIST, efforts: { ...LIST.efforts, fast: null } }, 'fast')).toBeUndefined()
  })

  // Model ids come from the CLI; one named like an Object member must not read as a record.
  it('does not mistake an inherited property for a model seen', () => {
    expect(reasoningFor(LIST, 'constructor')).toEqual(reasoningFor(LIST, 'small'))
    expect(learnEfforts(LIST, 'constructor', TWO).efforts?.constructor).toEqual(TWO)
  })

  it('offers no levels for a CLI that reported none', () => {
    const { efforts: _efforts, ...bare } = LIST
    expect(reasoningFor(bare, 'small')).toBeUndefined()
  })

  // The harness rejects a default that is not one of the levels.
  it('leaves the default out when the current value is not a level', () => {
    const list = { ...LIST, efforts: { small: { ...THREE, current: 'auto' } } }
    expect(reasoningFor(list, 'small')).not.toHaveProperty('defaultEffort')
  })
})

describe('learnEfforts', () => {
  it('records the levels of a model seen for the first time', () => {
    expect(learnEfforts(LIST, 'large', TWO).efforts).toEqual({ small: THREE, large: TWO })
  })

  it('records that a model offers no levels', () => {
    expect(learnEfforts(LIST, 'fast', undefined).efforts).toEqual({ small: THREE, fast: null })
  })

  it('returns the same list when nothing changed, so nothing is saved or refreshed', () => {
    expect(learnEfforts(LIST, 'small', THREE)).toBe(LIST)
    const none = learnEfforts(LIST, 'fast', undefined)
    expect(learnEfforts(none, 'fast', undefined)).toBe(none)
  })

  // A session's level is what the user picked, and the CLI carries it over a model switch;
  // the default stays what the CLI starts on.
  it('keeps the default a model started with while the user changes the level', () => {
    expect(learnEfforts(LIST, 'small', { ...THREE, current: 'low' })).toBe(LIST)
  })

  it('takes the default the CLI started with for a new model when that model has it', () => {
    expect(learnEfforts(LIST, 'large', { ...THREE, current: 'low' }).efforts?.large?.current).toBe('high')
  })

  it('takes the reported value when the earlier default is not one of the new levels', () => {
    expect(learnEfforts(LIST, 'small', TWO).efforts?.small).toEqual(TWO)
  })

  it('starts a record for a list that had none', () => {
    const { efforts: _efforts, ...bare } = LIST
    expect(learnEfforts(bare, 'small', TWO).efforts).toEqual({ small: TWO })
  })
})
