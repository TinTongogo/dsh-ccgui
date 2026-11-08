import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { CLI_TOOL_NAME } from '../src/constants.ts'
import { createCliTool } from '../src/cli-tool.ts'
import type { ToolOutcome } from '../src/tool-record.ts'

const OK: ToolOutcome = { text: 'output', failed: false, diffs: [] }

function setup(outcome: ToolOutcome = OK) {
  const waitForTool = vi.fn((_exec: ToolRunContext) => Promise.resolve(outcome))
  return { tool: createCliTool({ waitForTool }), waitForTool }
}

const exec = { callId: 'cli-1', signal: new AbortController().signal } as unknown as ToolRunContext

describe('createCliTool', () => {
  it('registers under the reserved name', () => {
    expect(setup().tool.name).toBe(CLI_TOOL_NAME)
  })

  it('returns what the CLI reported', async () => {
    const { tool, waitForTool } = setup({
      ...OK,
      diffs: [{ path: 'a', oldText: null, newText: 'b' }],
    })
    await expect(tool.execute({ title: 't', kind: 'edit' }, exec)).resolves.toEqual({
      text: 'output',
      diffs: [{ path: 'a', oldText: null, newText: 'b' }],
    })
    expect(waitForTool).toHaveBeenCalledWith(exec)
  })

  it('turns a failed call into a tool error', async () => {
    const { tool } = setup({ text: 'denied', failed: true, diffs: [] })
    await expect(tool.execute({ title: 't', kind: 'edit' }, exec)).rejects.toThrow('denied')
  })

  // The harness aborts with a plain object, which would otherwise be logged as
  // "Error: [object Object]" on every stop during a tool.
  it('reports a clean abort when cancelled during the wait', async () => {
    const controller = new AbortController()
    controller.abort({ kind: 'user' })
    const tool = createCliTool({ waitForTool: () => Promise.reject(controller.signal.reason as Error) })
    const aborted = { callId: 'cli-1', signal: controller.signal } as unknown as ToolRunContext
    await expect(tool.execute({ title: 't', kind: 'edit' }, aborted)).rejects.toMatchObject({
      name: 'AbortError',
      code: 'ABORTED',
    })
  })

  it('keeps other failures as they are', async () => {
    const tool = createCliTool({ waitForTool: () => Promise.reject(new Error('session gone')) })
    await expect(tool.execute({ title: 't', kind: 'edit' }, exec)).rejects.toThrow('session gone')
  })

  it('renders the output text for the log', () => {
    const { tool } = setup()
    expect(tool.output.render({ title: 't', kind: 'read' }, { text: 'hello', diffs: [] })).toEqual([
      { type: 'text', text: 'hello' },
    ])
  })

  it('exposes diffs to the result presenter', () => {
    const { tool } = setup()
    const diffs = [{ path: 'a', oldText: null, newText: 'b' }]
    expect(tool.output.presentationMeta?.({ title: 't', kind: 'edit' }, { text: 'x', diffs })).toEqual({ diffs })
  })
})

describe('presentCall', () => {
  const present = (args: object) => setup().tool.presentCall?.(args)

  it('shows a command as a terminal card', () => {
    expect(present({ title: 'list files', kind: 'execute', command: 'ls' })).toEqual({
      card: 'terminal',
      title: 'ls',
      description: 'list files',
    })
  })

  it('omits a description that only repeats the command', () => {
    expect(present({ title: 'ls', kind: 'execute', command: 'ls' })).toEqual({ card: 'terminal', title: 'ls' })
  })

  it('shows reported diffs as a diff card', () => {
    const diffs = [{ path: '/a', oldText: null, newText: 'b' }]
    expect(present({ title: 'write', kind: 'edit', diffs, locations: ['/a'] })).toEqual({
      card: 'diff',
      title: 'write',
      diffs,
      locations: [{ path: '/a' }],
    })
  })

  it('falls back to a generic card with the input', () => {
    expect(present({ title: 'read', kind: 'read', input: { path: '/a' }, locations: ['/a'] })).toEqual({
      card: 'generic',
      title: 'read',
      kind: 'read',
      rawInput: { path: '/a' },
      locations: [{ path: '/a' }],
    })
  })

  it.each(['think', 'switch_mode', 'future_kind'])('maps unknown kind %s to other', (kind) => {
    expect(present({ title: 't', kind })).toEqual({ card: 'generic', title: 't', kind: 'other' })
  })
})

describe('presentResult', () => {
  const present = (args: object, result: object) =>
    setup().tool.presentResult?.(args, { content: [{ type: 'text', text: 'out' }], isError: false, ...result })

  it('puts command output in the terminal card', () => {
    expect(present({ title: 'ls', kind: 'execute', command: 'ls' }, {})).toEqual({ card: 'terminal', output: 'out' })
  })

  it('shows diffs reported by completion time', () => {
    const diffs = [{ path: '/a', oldText: 'x', newText: 'y' }]
    expect(present({ title: 'edit', kind: 'edit' }, { meta: { diffs } })).toEqual({ card: 'diff', diffs })
  })

  it('leaves a plain result to the generic card', () => {
    expect(present({ title: 'read', kind: 'read' }, { meta: { diffs: [] } })).toBeUndefined()
  })

  it('leaves a failed call to the generic card', () => {
    expect(present({ title: 'ls', kind: 'execute', command: 'ls' }, { isError: true })).toBeUndefined()
  })
})
