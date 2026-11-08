import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  OPTIONS,
  setupWith,
  text,
  toolCall,
  toolUpdate,
  user,
  toolResult,
  collect,
  finishOf,
  textOf,
  toolCallOf,
  gate,
  allow,
  never,
} from './fixtures/cli-session-helpers.ts'

const SETTLE_MS = 100
/** Well inside the settle time, so a slow machine cannot make a gap look like an end. */
const SHORT_GAP_MS = 20
/** Well past the settle time. */
const LONG_GAP_MS = SETTLE_MS * 3

const go = [user('1', 'go')]

// Recorded from claude-agent-acp: a call stays pending until it finishes, its input arrives
// over several updates, and nothing marks the end of the input.
describe('CliSession with a CLI that leaves calls pending', () => {
  it('shows a call that is still running once its reports go quiet', async () => {
    const released = gate()
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { title: 'Terminal' }))
      t.update(toolUpdate('a', { title: 'sleep 9', rawInput: { command: 'sleep 9' } }))
      await released.wait
      t.update(toolUpdate('a', { status: 'completed', rawOutput: 'slept' }))
      t.update(text('done'))
      return 'end_turn' as const
    })
    const first = await collect(session.stream({ messages: go }))
    expect(toolCallOf(first).args).toMatchObject({ title: 'sleep 9', command: 'sleep 9' })
    released.open()
    await expect(session.waitForTool('cli-1', never)).resolves.toMatchObject({ text: 'slept', failed: false })
    const second = await collect(session.stream({ messages: [...go, toolResult()] }))
    expect(textOf(second)).toBe('done')
    expect(finishOf(second)?.reason).toEqual({ kind: 'stop' })
  })

  // The updates span more than the settle time, so only a wait that restarts on each one passes.
  it('waits for all of the input that is still arriving', async () => {
    const released = gate()
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a'))
      for (const timeout of [1, 2, 3, 4, 5, 6, 7, 8]) {
        t.update(toolUpdate('a', { rawInput: { command: 'ls', timeout } }))
        await delay(SHORT_GAP_MS)
      }
      await released.wait
      t.update(toolUpdate('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: go }))
    expect(toolCallOf(chunks).args.input).toEqual({ command: 'ls', timeout: 8 })
    released.open()
    await session.waitForTool('cli-1', never)
  })

  // A write reports its path, then goes quiet for as long as the content takes to generate.
  it('does not show a file write until its content has arrived', async () => {
    const diff = { type: 'diff', path: 'a.ts', oldText: null, newText: 'x' }
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { kind: 'edit', title: 'Write a.ts', rawInput: { file_path: 'a.ts' } }))
      await delay(LONG_GAP_MS)
      t.update(toolUpdate('a', { rawInput: { file_path: 'a.ts', content: 'x' }, content: [diff] }))
      await t.askPermission({ toolCall: { toolCallId: 'a', status: 'pending', title: 'Write a.ts' }, options: OPTIONS })
      t.update(toolUpdate('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: go }))
    expect(toolCallOf(chunks).args).toMatchObject({
      input: { file_path: 'a.ts', content: 'x' },
      diffs: [{ path: 'a.ts', oldText: null, newText: 'x' }],
    })
    await session.waitForTool('cli-1', allow)
  })

  it('never shows a call before it has any input', async () => {
    const released = gate()
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { title: 'Terminal' }))
      await delay(LONG_GAP_MS)
      t.update(toolUpdate('a', { title: 'ls', rawInput: { command: 'ls' } }))
      await released.wait
      t.update(toolUpdate('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: go }))
    expect(toolCallOf(chunks).args).toMatchObject({ title: 'ls', command: 'ls' })
    released.open()
    await session.waitForTool('cli-1', never)
  })

  it('shows a call that finishes first only once', async () => {
    const released = gate()
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { rawInput: { command: 'ls' } }))
      t.update(toolUpdate('a', { status: 'completed', rawOutput: 'out' }))
      await released.wait
      return 'end_turn' as const
    })
    const first = await collect(session.stream({ messages: go }))
    await session.waitForTool(toolCallOf(first).id, never)
    await delay(LONG_GAP_MS)
    released.open()
    const second = await collect(session.stream({ messages: [...go, toolResult()] }))
    expect(finishOf(second)?.reason).toEqual({ kind: 'stop' })
  })

  it('ignores updates arriving after the call is shown', async () => {
    const released = gate()
    const { session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { rawInput: { command: 'ls' } }))
      await delay(LONG_GAP_MS)
      t.update(toolUpdate('a', { rawInput: { command: 'ls', description: 'late' } }))
      await released.wait
      t.update(toolUpdate('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const first = await collect(session.stream({ messages: go }))
    const waiting = session.waitForTool(toolCallOf(first).id, never)
    await delay(LONG_GAP_MS)
    released.open()
    await waiting
    const second = await collect(session.stream({ messages: [...go, toolResult()] }))
    expect(finishOf(second)?.reason).toEqual({ kind: 'stop' })
  })

  it('still routes a permission request that comes after the call is shown', async () => {
    const asked = gate()
    const { fake, session } = setupWith({ toolSettleMs: SETTLE_MS }, async (t) => {
      t.update(toolCall('a', { rawInput: { command: 'rm x' } }))
      await asked.wait
      await t.askPermission({ toolCall: { toolCallId: 'a', status: 'pending', title: 'rm x' }, options: OPTIONS })
      t.update(toolUpdate('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: go }))
    const ask = vi.fn(allow)
    const waiting = session.waitForTool(toolCallOf(chunks).id, ask)
    asked.open()
    await expect(waiting).resolves.toMatchObject({ failed: false })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]?.[0]).toMatchObject({ callId: 'cli-1' })
    expect(fake.permissionAnswers).toHaveLength(1)
  })

  // A wait left running for the abandoned call would mark its id as shown, which would hide
  // the next call to use that id for good.
  it('forgets an abandoned call, so a later turn can reuse its id', async () => {
    const cancelled = gate()
    const { session } = setupWith(
      { toolSettleMs: SETTLE_MS, cancelGraceMs: 5_000 },
      async (t) => {
        t.update(toolCall('a', { rawInput: { command: 'old' } }))
        t.update(text('working'))
        await cancelled.wait
        return 'cancelled' as const
      },
      async (t) => {
        await delay(SHORT_GAP_MS)
        t.update(toolCall('a', { title: 'new', status: 'completed', rawInput: { command: 'new' } }))
        return 'end_turn' as const
      },
    )
    const stop = new AbortController()
    const reading = collect(session.stream({ messages: go, signal: stop.signal }))
    await delay(SHORT_GAP_MS)
    stop.abort(new Error('stop'))
    await expect(reading).rejects.toThrow('stop')
    cancelled.open()
    await delay(LONG_GAP_MS)
    const next = await collect(session.stream({ messages: [...go, user('2', 'next')] }))
    expect(toolCallOf(next).args).toMatchObject({ title: 'new', command: 'new' })
    await session.waitForTool(toolCallOf(next).id, never)
  })
})
