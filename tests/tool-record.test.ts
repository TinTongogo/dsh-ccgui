import { describe, expect, it } from 'vitest'
import {
  commandOf,
  isFinished,
  isReadyToPublish,
  mergeToolUpdate,
  permissionReason,
  toCliToolArgs,
  toolOutcome,
} from '../src/tool-record.ts'

const mint = (): string => 'cli-1'

describe('mergeToolUpdate', () => {
  it('creates a pending record from the required ACP fields only', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', title: 'Run tests' }, mint)
    expect(record).toEqual({
      acpId: 'a',
      callId: 'cli-1',
      title: 'Run tests',
      kind: 'other',
      status: 'pending',
      content: [],
      diffs: [],
      locations: [],
      permissionRequested: false,
    })
  })

  // Recorded from OpenCode: the diff appears only on the permission request, and
  // the `completed` update replaces `content` with a text summary.
  it('keeps a diff after a later update replaces the content', () => {
    const diff = { type: 'diff' as const, path: '/repo/a.ts', oldText: null, newText: 'b' }
    const first = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'pending', content: [diff] }, mint)
    const done = mergeToolUpdate(
      first,
      {
        toolCallId: 'a',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'Created file' } }],
      },
      mint,
    )
    expect(toolOutcome(done)).toEqual({
      text: 'Created file',
      failed: false,
      diffs: [{ path: '/repo/a.ts', oldText: null, newText: 'b' }],
    })
  })

  it('falls back to a generic title when the first update has none', () => {
    expect(mergeToolUpdate(undefined, { toolCallId: 'a' }, mint).title).toBe('Tool call')
  })

  it('keeps earlier fields when a later update only carries the changes', () => {
    const first = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        title: 'Edit',
        kind: 'edit',
        rawInput: { path: 'x.ts' },
      },
      mint,
    )
    const second = mergeToolUpdate(first, { toolCallId: 'a', status: 'in_progress' }, mint)
    expect(second).toMatchObject({
      callId: 'cli-1',
      title: 'Edit',
      kind: 'edit',
      status: 'in_progress',
      rawInput: { path: 'x.ts' },
    })
  })

  it('does not mutate the previous record', () => {
    const first = mergeToolUpdate(undefined, { toolCallId: 'a', title: 'Edit' }, mint)
    const snapshot = structuredClone(first)
    mergeToolUpdate(first, { toolCallId: 'a', status: 'completed', title: 'Done' }, mint)
    expect(first).toEqual(snapshot)
  })

  it('only mints a call id once', () => {
    let minted = 0
    const counting = (): string => `cli-${++minted}`
    const first = mergeToolUpdate(undefined, { toolCallId: 'a' }, counting)
    const second = mergeToolUpdate(first, { toolCallId: 'a', status: 'in_progress' }, counting)
    expect(second.callId).toBe('cli-1')
    expect(minted).toBe(1)
  })

  it('keeps earlier input when a later update reports null', () => {
    const first = mergeToolUpdate(undefined, { toolCallId: 'a', rawInput: { command: 'ls' }, rawOutput: 'x' }, mint)
    const second = mergeToolUpdate(first, { toolCallId: 'a', rawInput: null, rawOutput: null }, mint)
    expect(second).toMatchObject({ rawInput: { command: 'ls' }, rawOutput: 'x' })
  })

  it('reads locations down to their paths', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        locations: [{ path: '/repo/a.ts', line: 4 }, { path: '/repo/b.ts' }],
      },
      mint,
    )
    expect(record.locations).toEqual(['/repo/a.ts', '/repo/b.ts'])
  })
})

describe('commandOf', () => {
  const call = (kind: 'execute' | 'edit', rawInput: unknown) =>
    mergeToolUpdate(undefined, { toolCallId: 'a', kind, rawInput }, mint)

  it('reads a command as text or a list of words', () => {
    expect(commandOf(call('execute', { command: 'ls -l' }))).toBe('ls -l')
    expect(commandOf(call('execute', { command: ['ls', '-l'] }))).toBe('ls -l')
  })

  // Recorded from claude-agent-acp: a call opens with an empty object as its input.
  it.each([[undefined], [null], [{}], [{ description: 'list' }]])('finds none in %j', (rawInput) => {
    expect(commandOf(call('execute', rawInput))).toBeUndefined()
  })

  it('finds none on a call that is not a command', () => {
    expect(commandOf(call('edit', { command: 'ls' }))).toBeUndefined()
  })
})

describe('isReadyToPublish', () => {
  // ACP allows a pending tool_call whose input is still streaming, so publishing
  // it immediately would freeze empty arguments into the durable tool/call.
  it('waits while the call is pending without a permission request', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'pending' }, mint)
    expect(isReadyToPublish(record)).toBe(false)
  })

  it.each(['in_progress', 'completed', 'failed'] as const)('publishes once status is %s', (status) => {
    expect(isReadyToPublish(mergeToolUpdate(undefined, { toolCallId: 'a', status }, mint))).toBe(true)
  })

  it('publishes a pending call that is waiting for permission', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a' }, mint)
    expect(isReadyToPublish({ ...record, permissionRequested: true })).toBe(true)
  })
})

describe('isFinished', () => {
  it.each([
    ['pending', false],
    ['in_progress', false],
    ['completed', true],
    ['failed', true],
  ] as const)('%s is finished: %s', (status, expected) => {
    expect(isFinished(mergeToolUpdate(undefined, { toolCallId: 'a', status }, mint))).toBe(expected)
  })
})

describe('toCliToolArgs', () => {
  it('names the shell command for an execute call', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        title: 'bash',
        kind: 'execute',
        rawInput: { command: 'pnpm test' },
      },
      mint,
    )
    expect(toCliToolArgs(record)).toEqual({
      title: 'bash',
      kind: 'execute',
      command: 'pnpm test',
      input: { command: 'pnpm test' },
    })
  })

  it('joins an argv-style command', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        kind: 'execute',
        rawInput: { command: ['git', 'status'] },
      },
      mint,
    )
    expect(toCliToolArgs(record).command).toBe('git status')
  })

  it('ignores a non-execute command field', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        kind: 'read',
        rawInput: { command: 'x' },
      },
      mint,
    )
    expect(toCliToolArgs(record).command).toBeUndefined()
  })

  it('carries the file diffs and locations a call already reported', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        kind: 'edit',
        locations: [{ path: '/repo/a.ts' }],
        content: [{ type: 'diff', path: '/repo/a.ts', oldText: 'a', newText: 'b' }],
      },
      mint,
    )
    expect(toCliToolArgs(record)).toMatchObject({
      diffs: [{ path: '/repo/a.ts', oldText: 'a', newText: 'b' }],
      locations: ['/repo/a.ts'],
    })
  })

  it('drops raw input that is not lossless JSON', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        rawInput: { when: new Date(0), nothing: undefined },
      },
      mint,
    )
    expect(toCliToolArgs(record).input).toEqual({ when: '1970-01-01T00:00:00.000Z' })
  })

  it('omits input that cannot be serialized at all', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', rawInput: cyclic }, mint)
    expect(toCliToolArgs(record).input).toBeUndefined()
  })
})

describe('toolOutcome', () => {
  it('concatenates text content', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        status: 'completed',
        content: [
          { type: 'content', content: { type: 'text', text: 'one' } },
          { type: 'content', content: { type: 'text', text: 'two' } },
        ],
      },
      mint,
    )
    expect(toolOutcome(record)).toEqual({ text: 'one\ntwo', failed: false, diffs: [] })
  })

  it('summarizes a diff when the call reports no text', () => {
    const diff = { type: 'diff' as const, path: '/repo/a.ts', oldText: 'a', newText: 'b' }
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'completed', content: [diff] }, mint)
    expect(toolOutcome(record)).toEqual({
      text: 'Edited /repo/a.ts',
      failed: false,
      diffs: [{ path: '/repo/a.ts', oldText: 'a', newText: 'b' }],
    })
  })

  it('treats a missing oldText as a new file', () => {
    const diff = { type: 'diff' as const, path: '/repo/n.ts', newText: 'b' }
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'completed', content: [diff] }, mint)
    expect(toolOutcome(record).diffs).toEqual([{ path: '/repo/n.ts', oldText: null, newText: 'b' }])
  })

  describe('with output in a Markdown fence', () => {
    const outcomeOf = (text: string, status: 'completed' | 'failed' = 'completed') =>
      toolOutcome(
        mergeToolUpdate(
          undefined,
          {
            toolCallId: 'a',
            status,
            content: [{ type: 'content', content: { type: 'text', text } }],
          },
          mint,
        ),
      )

    // Recorded from claude-agent-acp, whose fences would show up literally in a terminal card.
    it('takes the fence off a command output', () => {
      expect(outcomeOf('```console\nline1\nline2\n```').text).toBe('line1\nline2')
    })

    it('takes the fence off a failure too', () => {
      expect(outcomeOf('```\nUser refused permission to run tool\n```', 'failed')).toMatchObject({
        text: 'User refused permission to run tool',
        failed: true,
      })
    })

    // Recorded from claude-agent-acp: other output holding a fence gets a longer one around it.
    it('keeps a fence the output itself contains', () => {
      expect(outcomeOf('````\n```js\nx\n```\n````').text).toBe('```js\nx\n```')
    })

    // claude-agent-acp's command output always gets three backticks, whatever it holds.
    it('takes the fence off a command output that contains fences', () => {
      expect(outcomeOf('```console\n# Title\n```js\nx\n```\nend\n```').text).toBe('# Title\n```js\nx\n```\nend')
    })

    it('leaves a fence that says what language it holds alone', () => {
      expect(outcomeOf('```js\nconst x = 1\n```').text).toBe('```js\nconst x = 1\n```')
    })

    it('leaves separate blocks alone', () => {
      const blocks = '```\na\n```\n\ntext\n\n```\nb\n```'
      expect(outcomeOf(blocks).text).toBe(blocks)
    })

    it('leaves a fence that only opens alone', () => {
      expect(outcomeOf('```\nnever closed').text).toBe('```\nnever closed')
    })

    it('falls through to the raw output when the fence holds nothing', () => {
      const record = mergeToolUpdate(
        undefined,
        {
          toolCallId: 'a',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: '```\n\n```' } }],
          rawOutput: 'raw',
        },
        mint,
      )
      expect(toolOutcome(record).text).toBe('raw')
    })
  })

  it('falls back to rawOutput', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        status: 'completed',
        rawOutput: { output: 'hello' },
      },
      mint,
    )
    expect(toolOutcome(record).text).toBe('hello')
  })

  it('serializes structured rawOutput', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        status: 'completed',
        rawOutput: { exit: 0 },
      },
      mint,
    )
    expect(toolOutcome(record).text).toBe('{"exit":0}')
  })

  it('accepts a plain string rawOutput', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'completed', rawOutput: 'plain' }, mint)
    expect(toolOutcome(record).text).toBe('plain')
  })

  it('reports no output rather than an empty result', () => {
    const record = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'completed' }, mint)
    expect(toolOutcome(record).text).toBe('(no output)')
  })

  // Recorded from OpenCode: a permission request carries the diff, so a rejected
  // write still has one. Calling that "Edited" would state the opposite of what happened.
  it('reports why a call failed rather than the edit it never made', () => {
    const diff = { type: 'diff' as const, path: '/repo/h.txt', newText: 'hi' }
    const pending = mergeToolUpdate(undefined, { toolCallId: 'a', content: [diff] }, mint)
    const rejected = mergeToolUpdate(
      pending,
      { toolCallId: 'a', status: 'failed', rawOutput: 'rejected by user' },
      mint,
    )
    expect(toolOutcome(rejected)).toMatchObject({ text: 'rejected by user', failed: true })
  })

  it('never reports a failure as an edit, even with no reason', () => {
    const diff = { type: 'diff' as const, path: '/repo/h.txt', newText: 'hi' }
    const failed = mergeToolUpdate(undefined, { toolCallId: 'a', status: 'failed', content: [diff] }, mint)
    expect(toolOutcome(failed).text).toBe('(no output)')
  })

  it('marks a failed call', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'denied' } }],
      },
      mint,
    )
    expect(toolOutcome(record)).toMatchObject({ text: 'denied', failed: true })
  })

  it('ignores terminal content and non-text blocks', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        status: 'completed',
        content: [
          { type: 'terminal', terminalId: 't' },
          { type: 'content', content: { type: 'image', data: 'x', mimeType: 'image/png' } },
        ],
      },
      mint,
    )
    expect(toolOutcome(record).text).toBe('(no output)')
  })
})

describe('permissionReason', () => {
  it('is the title for a plain call', () => {
    expect(permissionReason(mergeToolUpdate(undefined, { toolCallId: 'a', title: 'read a.txt' }, mint))).toBe(
      'read a.txt',
    )
  })

  it('names the command when the title does not', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        title: 'shell',
        kind: 'execute',
        rawInput: { command: 'rm -rf build' },
      },
      mint,
    )
    expect(permissionReason(record)).toContain('rm -rf build')
  })

  // The harness freezes tool arguments before OpenCode reports the diff, so this
  // text is the only place the person approving can see what will be written.
  it('shows what an edit will write', () => {
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        title: 'write',
        content: [{ type: 'diff', path: '/repo/a.txt', newText: 'line one\nline two' }],
      },
      mint,
    )
    const reason = permissionReason(record)
    expect(reason).toContain('/repo/a.txt')
    expect(reason).toContain('line two')
  })

  it('shortens a long edit and says how much is hidden', () => {
    const newText = Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n')
    const record = mergeToolUpdate(
      undefined,
      {
        toolCallId: 'a',
        title: 'write',
        content: [{ type: 'diff', path: '/repo/a.txt', newText }],
      },
      mint,
    )
    const reason = permissionReason(record)
    expect(reason).toContain('line 19')
    expect(reason).not.toContain('line 20')
    expect(reason).toContain('30')
  })
})
