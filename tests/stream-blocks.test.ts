import { describe, expect, it } from 'vitest'
import { appendDelta, closeOpenBlock, EMPTY_BLOCKS, toolCallChunks } from '../src/stream-blocks.ts'

describe('appendDelta', () => {
  it('opens a block on the first delta', () => {
    const { state, chunks } = appendDelta(EMPTY_BLOCKS, 'text', 'he')
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'he' },
    ])
    expect(state).toEqual({ nextIndex: 1, open: { index: 0, blockType: 'text', text: 'he' } })
  })

  it('extends the open block of the same type', () => {
    const first = appendDelta(EMPTY_BLOCKS, 'text', 'he')
    const second = appendDelta(first.state, 'text', 'llo')
    expect(second.chunks).toEqual([{ type: 'text-delta', index: 0, text: 'llo' }])
    expect(second.state.open?.text).toBe('hello')
  })

  it('closes the open block when the type changes', () => {
    const first = appendDelta(EMPTY_BLOCKS, 'reasoning', 'hm')
    const second = appendDelta(first.state, 'text', 'ok')
    expect(second.chunks).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'hm' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'ok' },
    ])
  })

  it('emits reasoning deltas for reasoning text', () => {
    expect(appendDelta(EMPTY_BLOCKS, 'reasoning', 'hm').chunks[1]).toEqual({
      type: 'reasoning-delta',
      index: 0,
      text: 'hm',
    })
  })

  it('does not mutate the input state', () => {
    const first = appendDelta(EMPTY_BLOCKS, 'text', 'a')
    const snapshot = structuredClone(first.state)
    appendDelta(first.state, 'text', 'b')
    expect(first.state).toEqual(snapshot)
  })
})

describe('closeOpenBlock', () => {
  it('is a no-op with nothing open', () => {
    expect(closeOpenBlock(EMPTY_BLOCKS)).toEqual({ state: EMPTY_BLOCKS, chunks: [] })
  })

  it('emits the assembled block', () => {
    const { state } = appendDelta(EMPTY_BLOCKS, 'text', 'done')
    const closed = closeOpenBlock(state)
    expect(closed.chunks).toEqual([{ type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }])
    expect(closed.state).toEqual({ nextIndex: 1 })
  })
})

describe('toolCallChunks', () => {
  it('closes open text before the tool call and uses the next index', () => {
    const { state } = appendDelta(EMPTY_BLOCKS, 'text', 'running')
    const result = toolCallChunks(state, { id: 'cli-1', name: 'cli_tool', arguments: '{"title":"x"}' })
    expect(result.chunks).toEqual([
      { type: 'block-end', index: 0, block: { type: 'text', text: 'running' } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 1, id: 'cli-1', name: 'cli_tool', argumentsDelta: '{"title":"x"}' },
      {
        type: 'block-end',
        index: 1,
        block: { type: 'tool-call', id: 'cli-1', name: 'cli_tool', arguments: '{"title":"x"}' },
      },
    ])
    expect(result.state).toEqual({ nextIndex: 2 })
  })
})

// Some CLIs (OMP with DeepSeek models) send a lone "." as the message between two
// tool calls; passed through, it splits the harness's tool group around each call.
describe('punctuation-only text', () => {
  it('holds text that has no words yet', () => {
    const held = appendDelta(EMPTY_BLOCKS, 'text', '.')
    expect(held.chunks).toEqual([])
    expect(held.state).toEqual({ nextIndex: 0, held: '.' })
  })

  it('drops held text when a tool call follows', () => {
    const held = appendDelta(EMPTY_BLOCKS, 'text', ' .\n')
    const result = toolCallChunks(held.state, { id: 'cli-1', name: 'cli_tool', arguments: '{}' })
    expect(result.chunks[0]).toEqual({ type: 'block-start', index: 0, blockType: 'tool-call' })
    expect(result.state).toEqual({ nextIndex: 1 })
  })

  it('drops held text when reasoning follows', () => {
    const held = appendDelta(EMPTY_BLOCKS, 'text', '.')
    const result = appendDelta(held.state, 'reasoning', 'hm')
    expect(result.chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'hm' },
    ])
    expect(result.state.held).toBeUndefined()
  })

  it('releases held text once words arrive', () => {
    const held = appendDelta(EMPTY_BLOCKS, 'text', '**')
    const result = appendDelta(held.state, 'text', 'Done')
    expect(result.chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '**Done' },
    ])
    expect(result.state).toEqual({ nextIndex: 1, open: { index: 0, blockType: 'text', text: '**Done' } })
  })

  it('keeps punctuation inside an open text block', () => {
    const open = appendDelta(EMPTY_BLOCKS, 'text', 'Done')
    expect(appendDelta(open.state, 'text', '.').chunks).toEqual([{ type: 'text-delta', index: 0, text: '.' }])
  })

  it('still emits held text when the step ends without a tool call', () => {
    const held = appendDelta(EMPTY_BLOCKS, 'text', '.')
    expect(closeOpenBlock(held.state).chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '.' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '.' } },
    ])
  })
})
