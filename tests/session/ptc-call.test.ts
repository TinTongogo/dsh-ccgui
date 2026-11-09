import { describe, expect, it, vi } from 'vitest'
import { mirroredCallId, ptcCall, readPtcWrap } from '../../src/session/ptc-call.ts'
import { mergeToolUpdate, toCliToolArgs } from '../../src/tool-record.ts'
import type { ToolRecord } from '../../src/tool-record.ts'

const runtime = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  language: 'typescript',
  programFormat: 'function-body',
  timeout: { defaultMs: 120_000, maxMs: 600_000 },
  ...fields,
})

function record(fields: Partial<ToolRecord> = {}): ToolRecord {
  return {
    ...mergeToolUpdate(undefined, { toolCallId: 'a', title: 'Edit', status: 'pending' }, () => 'cli-1'),
    ...fields,
  }
}

interface RunCodeArgs {
  readonly code: string
  readonly description: string
  readonly timeoutMs?: number
}

const argsOf = (call: { readonly arguments: string }): RunCodeArgs => JSON.parse(call.arguments) as RunCodeArgs

type Binding = (args: unknown) => Promise<unknown>

/** Run the program the way a TypeScript function-body runtime does. */
function runProgram(code: string, cliTool: Binding): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the generated program is the unit under test
  const body = new Function('tools', `return (async () => {\n${code}\n})()`) as (tools: unknown) => Promise<unknown>
  return body({ cli_tool: cliTool })
}

describe('readPtcWrap', () => {
  it('wraps for a TypeScript function-body runtime, with its longest timeout', () => {
    expect(readPtcWrap(runtime())).toEqual({ timeoutMs: 600_000 })
  })

  it('leaves the timeout out when the runtime has no deadline control', () => {
    expect(readPtcWrap(runtime({ timeout: undefined }))).toEqual({})
    expect(readPtcWrap(runtime({ timeout: { maxMs: 0 } }))).toEqual({})
    expect(readPtcWrap(runtime({ timeout: { maxMs: 'long' } }))).toEqual({})
  })

  // The program is written as a TypeScript function body; another syntax would not run it.
  it.each([
    ['no runtime', undefined],
    ['a non-object', 'typescript'],
    ['Python', runtime({ language: 'python' })],
    ['a TypeScript script', runtime({ programFormat: 'script' })],
  ])('cannot wrap for %s', (_name, value) => {
    expect(readPtcWrap(value)).toBeUndefined()
  })
})

describe('ptcCall', () => {
  it('keeps the call id and sends a run_code call', () => {
    const call = ptcCall(record(), { timeoutMs: 600_000 })
    expect(call.id).toBe('cli-1')
    expect(call.name).toBe('run_code')
    const { code, ...rest } = argsOf(call)
    expect(code).toContain('tools.cli_tool(')
    expect(rest).toEqual({ description: 'Edit', timeoutMs: 600_000 })
  })

  it('passes no timeout when the runtime has none', () => {
    expect(argsOf(ptcCall(record(), {}))).not.toHaveProperty('timeoutMs')
  })

  it('describes a command by the command, and an untitled call generically', () => {
    const command = record({ kind: 'execute', rawInput: { command: 'npm test' } })
    expect(argsOf(ptcCall(command, {})).description).toBe('npm test')
    expect(argsOf(ptcCall(record({ title: '  ' }), {})).description).toBe('CLI 工具调用')
  })

  it('runs a program that hands the mirror tool the same arguments and returns its text', async () => {
    const original = record({ title: 'He said "hi"\n\\ 改动 done', locations: ['/a.ts'] })
    const cliTool = vi.fn<Binding>(() => Promise.resolve({ text: 'edited', diffs: [] }))
    await expect(runProgram(argsOf(ptcCall(original, {})).code, cliTool)).resolves.toBe('edited')
    expect(cliTool).toHaveBeenCalledWith(toCliToolArgs(original))
  })

  // A failed call must fail run_code too, or the card would show it as a success.
  it('lets a failed mirror call fail the program', async () => {
    const cliTool = vi.fn<Binding>(() => Promise.reject(new Error('denied')))
    await expect(runProgram(argsOf(ptcCall(record(), {})).code, cliTool)).rejects.toThrow('denied')
  })
})

describe('mirroredCallId', () => {
  it('reads the outer call id from a nested PTC call id', () => {
    expect(mirroredCallId('cli-1:ptc:1')).toBe('cli-1')
    expect(mirroredCallId('cli-1:ptc:42')).toBe('cli-1')
  })

  it('returns undefined for an id that is not nested', () => {
    expect(mirroredCallId('cli-1')).toBeUndefined()
    expect(mirroredCallId('cli-1:ptc:')).toBeUndefined()
    expect(mirroredCallId('cli-1:ptc:x')).toBeUndefined()
  })
})
