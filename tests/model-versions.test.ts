import { describe, expect, it } from 'vitest'
import { olderVersions } from '../src/model-versions.ts'

describe('olderVersions', () => {
  it('finds the models a newer version of the same family replaces', () => {
    const names = ['Opus 5.5', 'Sonnet 5.5', 'Haiku 4.5', 'Haiku 5.5', 'Opus 5', 'Opus 4.8', 'Sonnet 4.6']
    expect([...olderVersions(names)].sort()).toEqual(['Haiku 4.5', 'Opus 4.8', 'Opus 5', 'Sonnet 4.6'])
  })

  it('reads the version wherever it sits in the name', () => {
    expect([...olderVersions(['6.1 Sol', '6 Sol', '5.6 Sol', '6 Luna'])].sort()).toEqual(['5.6 Sol', '6 Sol'])
  })

  it('compares versions as numbers, not text', () => {
    expect([...olderVersions(['GLM-5.10', 'GLM-5.9'])]).toEqual(['GLM-5.9'])
  })

  it('leaves models of different families alone', () => {
    expect(olderVersions(['Qwen3.7 Plus', 'Qwen3.8 Max', 'K3', 'K3-256k', 'Big Pickle']).size).toBe(0)
  })

  it('marks nothing when the same version appears twice', () => {
    expect(olderVersions(['Opus 5.5', 'Opus 5.5']).size).toBe(0)
  })
})
