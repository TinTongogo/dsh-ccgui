import type { ToolCallUpdate } from '@agentclientprotocol/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolMirror } from '../../src/session/tool-mirror.ts'

const SETTLE_MS = 1_000

function setup(): { mirror: ToolMirror; ready: ReturnType<typeof vi.fn<(acpId: string) => void>> } {
  let next = 0
  const ready = vi.fn<(acpId: string) => void>()
  const mirror = new ToolMirror({ mintCallId: () => `cli-${String(++next)}`, settleMs: SETTLE_MS, onReady: ready })
  return { mirror, ready }
}

const pending = (toolCallId: string): ToolCallUpdate => ({ toolCallId, title: 'Edit', status: 'pending' })
const running = (toolCallId: string): ToolCallUpdate => ({ toolCallId, status: 'in_progress' })
const command = (toolCallId: string, text = 'npm test'): ToolCallUpdate => ({
  toolCallId,
  kind: 'execute',
  status: 'pending',
  rawInput: { command: text },
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToolMirror: recording and announcing', () => {
  it('records a call and finds it by its harness call id', () => {
    const { mirror } = setup()
    mirror.apply(pending('a'), false)
    mirror.apply(pending('b'), false)

    expect(mirror.get('a')?.callId).toBe('cli-1')
    expect(mirror.acpIdFor('cli-1')).toBe('a')
    expect(mirror.acpIdFor('cli-2')).toBe('b')
    expect(mirror.acpIdFor('cli-9')).toBeUndefined()
  })

  // In PTC mode the harness runs the mirror tool inside run_code, under a nested id.
  it('finds a call by the nested id PTC gives its mirror', () => {
    const { mirror } = setup()
    mirror.apply(pending('a'), false)

    expect(mirror.acpIdFor('cli-1:ptc:1')).toBe('a')
    expect(mirror.acpIdFor('cli-1:ptc:42')).toBe('a')
    expect(mirror.acpIdFor('cli-9:ptc:1')).toBeUndefined()
    mirror.forget('a')
    expect(mirror.acpIdFor('cli-1:ptc:1')).toBeUndefined()
  })

  it('announces a running call exactly once', () => {
    const { mirror, ready } = setup()
    mirror.apply(pending('a'), false)
    expect(ready).not.toHaveBeenCalled()

    mirror.apply(running('a'), false)
    mirror.apply({ toolCallId: 'a', status: 'completed' }, false)

    expect(ready).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('announces a pending call as soon as it asks for permission', () => {
    const { mirror, ready } = setup()
    mirror.apply(pending('a'), true)

    expect(ready).toHaveBeenCalledExactlyOnceWith('a')
    expect(mirror.get('a')?.permissionRequested).toBe(true)
  })

  it('wakes whoever waits for a change', async () => {
    const { mirror } = setup()
    const changed = mirror.nextChange()
    mirror.apply(pending('a'), false)
    await expect(changed).resolves.toBeUndefined()
  })
})

describe('ToolMirror: pending commands', () => {
  it('announces a pending command once its reports go quiet', () => {
    const { mirror, ready } = setup()
    mirror.apply(command('a'), false)

    vi.advanceTimersByTime(SETTLE_MS - 1)
    expect(ready).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ready).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('restarts the quiet period on every report', () => {
    const { mirror, ready } = setup()
    mirror.apply(command('a'), false)
    vi.advanceTimersByTime(SETTLE_MS - 1)
    mirror.apply(command('a', 'npm test -- --run'), false)

    vi.advanceTimersByTime(SETTLE_MS - 1)
    expect(ready).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ready).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('keeps each command on its own timer', () => {
    const { mirror, ready } = setup()
    mirror.apply(command('a'), false)
    vi.advanceTimersByTime(SETTLE_MS / 2)
    mirror.apply(command('b'), false)

    vi.advanceTimersByTime(SETTLE_MS / 2)
    expect(ready.mock.calls).toEqual([['a']])
    vi.advanceTimersByTime(SETTLE_MS / 2)
    expect(ready.mock.calls).toEqual([['a'], ['b']])
  })

  it('never announces a pending call that is not a command by time alone', () => {
    const { mirror, ready } = setup()
    mirror.apply(pending('a'), false)
    vi.advanceTimersByTime(SETTLE_MS * 10)
    expect(ready).not.toHaveBeenCalled()
  })

  it('does not announce a command again after it started', () => {
    const { mirror, ready } = setup()
    mirror.apply(command('a'), false)
    mirror.apply(running('a'), false)
    mirror.apply(command('a'), false)
    vi.advanceTimersByTime(SETTLE_MS * 2)
    expect(ready).toHaveBeenCalledExactlyOnceWith('a')
  })
})

describe('ToolMirror: hand-off and mirrors', () => {
  it('lists calls handed off whose mirror never started', () => {
    const { mirror } = setup()
    for (const id of ['a', 'b', 'c']) mirror.apply(running(id), false)
    for (const id of ['a', 'b', 'c']) mirror.handOff(id)
    mirror.startMirror('b')

    expect(mirror.skippedMirrors()).toEqual(['a', 'c'])
  })

  it('drops every call without a running mirror and keeps the mirrored one', () => {
    const { mirror } = setup()
    for (const id of ['a', 'b']) mirror.apply(running(id), false)
    mirror.startMirror('a')

    mirror.dropUnmirrored()

    expect(mirror.get('a')).toBeDefined()
    expect(mirror.get('b')).toBeUndefined()
    expect(mirror.isClaimed('b')).toBe(true)
    expect(mirror.isClaimed('a')).toBe(false)
  })
})

describe('ToolMirror: failing open calls', () => {
  it('fails every unfinished call with the interruption note and leaves finished ones alone', () => {
    const { mirror, ready } = setup()
    mirror.apply(pending('open'), false)
    mirror.apply({ toolCallId: 'done', status: 'completed', rawOutput: 'ok' }, false)

    mirror.failOpen()

    expect(mirror.get('open')).toMatchObject({
      status: 'failed',
      rawOutput: 'CLI 在这个工具完成之前结束了本轮。',
      permissionRequested: false,
    })
    expect(mirror.get('done')).toMatchObject({ status: 'completed', rawOutput: 'ok' })
    // The unpublished call is published, so the log shows what the CLI attempted.
    expect(ready).toHaveBeenCalledWith('open')
  })
})

describe('ToolMirror: forgetting a call', () => {
  it('clears every trace of the call and claims it', () => {
    const { mirror, ready } = setup()
    mirror.apply(running('a'), false)
    mirror.handOff('a')
    mirror.startMirror('a')

    mirror.forget('a')

    expect(mirror.get('a')).toBeUndefined()
    expect(mirror.acpIdFor('cli-1')).toBeUndefined()
    expect(mirror.skippedMirrors()).toEqual([])
    expect(mirror.isClaimed('a')).toBe(true)
    // Published state is gone too: the same id reported again is a new call, announced again.
    mirror.apply(running('a'), false)
    expect(ready.mock.calls).toEqual([['a'], ['a']])
    expect(mirror.get('a')?.callId).toBe('cli-2')
  })

  it('leaves the other calls untouched', () => {
    const { mirror } = setup()
    for (const id of ['a', 'b']) mirror.apply(running(id), false)
    for (const id of ['a', 'b']) mirror.handOff(id)
    mirror.startMirror('b')

    mirror.forget('a')

    expect(mirror.get('b')?.callId).toBe('cli-2')
    expect(mirror.acpIdFor('cli-2')).toBe('b')
    expect(mirror.isClaimed('b')).toBe(false)
    // b still has its mirror, so it is not reported as skipped.
    expect(mirror.skippedMirrors()).toEqual([])
    mirror.dropUnmirrored()
    expect(mirror.get('b')).toBeDefined()
  })

  it("keeps the other calls' announcement, hand-off and timers", () => {
    const { mirror, ready } = setup()
    for (const id of ['a', 'b']) mirror.apply(running(id), false)
    for (const id of ['a', 'b']) mirror.handOff(id)
    mirror.apply(command('c'), false)
    mirror.apply(command('d'), false)

    mirror.forget('a')
    mirror.forget('c')

    // b was announced and handed off, and stays so.
    mirror.apply(running('b'), false)
    expect(ready.mock.calls).toEqual([['a'], ['b']])
    expect(mirror.skippedMirrors()).toEqual(['b'])
    // d's timer survives c being forgotten, and can still be cancelled on its own.
    mirror.forget('d')
    vi.advanceTimersByTime(SETTLE_MS * 2)
    expect(ready.mock.calls).toEqual([['a'], ['b']])
  })

  it('ends the mirror of a forgotten call, so handing it off again counts as skipped', () => {
    const { mirror } = setup()
    mirror.apply(running('a'), false)
    mirror.startMirror('a')
    mirror.forget('a')

    mirror.apply(running('a'), false)
    mirror.handOff('a')

    expect(mirror.skippedMirrors()).toEqual(['a'])
  })

  it('cancels a pending command timer', () => {
    const { mirror, ready } = setup()
    mirror.apply(command('a'), false)
    mirror.forget('a')
    vi.advanceTimersByTime(SETTLE_MS * 2)
    expect(ready).not.toHaveBeenCalled()
  })

  it('forgets an unknown call without touching known ones', () => {
    const { mirror } = setup()
    mirror.apply(running('a'), false)
    mirror.forget('missing')
    expect(mirror.acpIdFor('cli-1')).toBe('a')
    expect(mirror.isClaimed('missing')).toBe(true)
  })

  it('reopens only the call the CLI reports again', () => {
    const { mirror } = setup()
    mirror.forget('a')
    mirror.forget('b')

    mirror.reopen('a')

    expect(mirror.isClaimed('a')).toBe(false)
    expect(mirror.isClaimed('b')).toBe(true)
  })
})
