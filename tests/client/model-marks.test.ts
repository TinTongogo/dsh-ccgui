import { describe, expect, it } from 'vitest'
import { modelMarkOf } from '../../src/client/model-marks.ts'

describe('modelMarkOf', () => {
  it.each([
    // [provider, model id, display name, expected mark]
    ['cli-opencode', 'opencode/deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash（默认）', 'deepseek'],
    ['cli-opencode', 'default', 'DeepSeek-V4.1-Flash（默认）', 'deepseek'],
    ['cli-opencode', 'opencode/k3', 'K3', 'kimi'],
    ['cli-opencode', 'opencode/k3-256k', 'K3-256k', 'kimi'],
    ['cli-opencode', 'x/k2.8-preview', 'K2.8 Preview', 'kimi'],
    ['cli-opencode', 'moonshotai/kimi-k2-turbo', 'Kimi K2 Turbo', 'kimi'],
    ['cli-opencode', 'anthropic/claude-opus-5-5', 'Claude Opus 5.5', 'claude'],
    ['cli-claude', 'opus', 'Opus', 'claude'],
    ['cli-claude', 'haiku', 'Haiku 5.5', 'claude'],
    ['cli-opencode', 'openai/gpt-5.5', 'GPT-5.5', 'codex'],
    ['cli-opencode', 'openai/o4-mini', 'o4-mini', 'codex'],
    ['cli-codex', 'gpt-5-codex', 'gpt-5-codex', 'codex'],
  ])('reads %s %s (%s) as %s', (provider, model, name, mark) => {
    expect(modelMarkOf({ provider, model, name })).toBe(mark)
  })

  it('falls back to the provider’s own mark for a model it cannot place', () => {
    expect(modelMarkOf({ provider: 'cli-opencode', model: 'big-pickle', name: 'Big Pickle' })).toBe('opencode')
    expect(modelMarkOf({ provider: 'deepseek-official', model: 'chat', name: 'Chat' })).toBe('deepseek')
  })

  it('claims no mark rather than the generic CLI one, or a brand for an unknown provider', () => {
    expect(modelMarkOf({ provider: 'cli-someone-elses', model: 'x1', name: 'X1' })).toBeUndefined()
    expect(modelMarkOf({ provider: 'openrouter', model: 'qwen3.8-max', name: 'Qwen3.8 Max' })).toBeUndefined()
  })

  it('does not mistake words that merely contain the vendor hints', () => {
    expect(modelMarkOf({ provider: 'openrouter', model: 'polk2', name: 'Polk2' })).toBeUndefined()
    expect(modelMarkOf({ provider: 'openrouter', model: 'pro3', name: 'Pro3' })).toBeUndefined()
  })
})
