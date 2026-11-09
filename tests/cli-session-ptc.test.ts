import { describe, expect, it, vi } from 'vitest'
import {
  OPTIONS,
  allow,
  collect,
  finishOf,
  setup,
  textOf,
  toolCall,
  toolCallOf,
  toolResult,
  toolUpdate,
  user,
} from './fixtures/cli-session-helpers.ts'

const go = [user('1', 'go')]
const PTC = { timeoutMs: 600_000 }

// The PTC executor only runs run_code, so the mirror call goes out inside a program, and
// the harness runs the mirror tool under the nested id `<call id>:ptc:<n>`.
describe('CliSession in a PTC session', () => {
  it('hands a call over as run_code and finds it again by its nested id', async () => {
    const { fake, session } = setup(async (t) => {
      t.update(toolCall('a', { kind: 'execute', status: 'in_progress', rawInput: { command: 'rm x' } }))
      await t.askPermission({ toolCall: { toolCallId: 'a', status: 'pending', title: 'rm x' }, options: OPTIONS })
      t.update(toolUpdate('a', { status: 'completed', rawOutput: 'removed' }))
      t.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'done' } })
      return 'end_turn' as const
    })

    const first = await collect(session.stream({ messages: go, ptc: PTC }))
    const call = toolCallOf(first)
    expect(call).toMatchObject({ id: 'cli-1', name: 'run_code', args: { description: 'rm x', timeoutMs: 600_000 } })
    expect(finishOf(first)?.reason).toEqual({ kind: 'tool-calls' })

    const ask = vi.fn(allow)
    await expect(session.waitForTool('cli-1:ptc:1', ask)).resolves.toMatchObject({ text: 'removed', failed: false })
    // The approval belongs to the nested call, which is the one the harness shows as waiting.
    expect(ask.mock.calls[0]?.[0]).toEqual({ reason: 'rm x', callId: 'cli-1:ptc:1' })
    expect(fake.permissionAnswers).toHaveLength(1)

    const second = await collect(session.stream({ messages: [...go, toolResult()], ptc: PTC }))
    expect(textOf(second)).toBe('done')
  })

  it('keeps the mirror tool for a step without the PTC option', async () => {
    const { session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: go }))
    expect(toolCallOf(chunks).name).toBe('cli_tool')
    await session.waitForTool('cli-1', allow)
  })
})
