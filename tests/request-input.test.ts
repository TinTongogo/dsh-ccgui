import { describe, expect, it } from 'vitest'
import { nativeReplayState, readNativeSession, unseenUserInput } from '../src/request-input.ts'
import type { RequestMessage } from '@deepseek-ai/dsh-llm'

const user = (id: string, text: string, kind = 'user'): RequestMessage =>
  ({
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind },
  }) as unknown as RequestMessage

const assistant = (replayState?: unknown, provider = 'cli-x'): RequestMessage =>
  ({
    id: 'assistant',
    role: 'assistant',
    content: [{ type: 'text', text: 'hi' }],
    source: { kind: 'model', provider, model: 'default', ...(replayState === undefined ? {} : { replayState }) },
  }) as unknown as RequestMessage

const tool = (): RequestMessage =>
  ({
    id: 'tool',
    role: 'tool',
    content: [{ type: 'text', text: 'out' }],
    source: { kind: 'tool' },
  }) as unknown as RequestMessage

describe('unseenUserInput', () => {
  it('takes the trailing user message of a new turn', () => {
    const input = unseenUserInput([user('1', 'hello')], new Set())
    expect(input).toEqual({ ids: ['1'], blocks: [{ type: 'text', text: 'hello' }] })
  })

  it('reports nothing when a step continues after a tool result', () => {
    expect(unseenUserInput([user('1', 'hi'), assistant(), tool()], new Set())).toEqual({ ids: [], blocks: [] })
  })

  it('picks up steering that follows a tool result', () => {
    const input = unseenUserInput([user('1', 'hi'), assistant(), tool(), user('2', 'also')], new Set(['1']))
    expect(input.ids).toEqual(['2'])
    expect(input.blocks).toEqual([{ type: 'text', text: 'also' }])
  })

  it('skips messages already sent to the CLI', () => {
    const input = unseenUserInput([user('1', 'old'), user('2', 'new')], new Set(['1']))
    expect(input.blocks).toEqual([{ type: 'text', text: 'new' }])
  })

  // The harness projects runtime context into the history for its own model.
  // The CLI assembles its own context, so forwarding this would only add noise.
  it('does not forward runtime context', () => {
    const input = unseenUserInput([user('c', 'Current time', 'runtime-context'), user('1', 'hello')], new Set())
    expect(input.blocks).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('keeps conversation order across several trailing messages', () => {
    const input = unseenUserInput([user('1', 'a'), user('2', 'b')], new Set())
    expect(input.blocks).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])
  })

  it('stops at the system prompt', () => {
    const system = {
      id: 's',
      role: 'system',
      content: [{ type: 'text', text: 'sys' }],
      source: { kind: 'system-prompt' },
    } as unknown as RequestMessage
    expect(unseenUserInput([system, user('1', 'x')], new Set()).blocks).toEqual([{ type: 'text', text: 'x' }])
  })

  it('accepts identity-free request input', () => {
    const input = unseenUserInput([{ role: 'user', content: [{ type: 'text', text: 'x' }] }], new Set())
    expect(input).toEqual({ ids: [], blocks: [{ type: 'text', text: 'x' }] })
  })

  // Tool-update notes land after the user message in the same step.
  it('finds user input that a developer message follows', () => {
    const developer = {
      id: 'd',
      role: 'developer',
      content: [{ type: 'text', text: 'tools changed' }],
      source: { kind: 'tool-update' },
    } as unknown as RequestMessage
    expect(unseenUserInput([user('1', 'hello'), developer], new Set()).ids).toEqual(['1'])
  })

  // The harness also writes reminders and instructions as user-role messages. Those
  // are meant for its own model; forwarded, they would start CLI turns nobody asked for.
  it.each(['repeat-tool-reminder', 'agent-instructions', 'future-kind'])('does not forward %s messages', (kind) => {
    expect(unseenUserInput([user('1', 'note', kind)], new Set())).toEqual({ ids: [], blocks: [] })
  })

  it('forwards a scheduled prompt, which the user wrote', () => {
    expect(unseenUserInput([user('1', 'nightly check', 'schedule')], new Set()).blocks).toEqual([
      { type: 'text', text: 'nightly check' },
    ])
  })

  // The harness tells a session about schedule edits with the same source kind as a
  // real reminder, and the text says it needs no action. The prefix is the only way
  // to tell them apart, so this test fails loudly if upstream ever changes it.
  it('does not forward a schedule change notice', () => {
    const notice = user('1', '[SCHEDULE CHANGE]\nTask renamed. This needs no action.', 'schedule')
    expect(unseenUserInput([notice], new Set())).toEqual({ ids: [], blocks: [] })
  })

  // A failed turn leaves its prompt at the end of the history with no reply after
  // it, and it may already have reached the CLI. It must not be sent again.
  it('sends only what belongs to the current turn', () => {
    const input = unseenUserInput([user('old', 'delete x'), user('new', 'next')], new Set(), new Set(['new']))
    expect(input).toEqual({ ids: ['new'], blocks: [{ type: 'text', text: 'next' }] })
  })

  it('sends nothing when the current turn has no user message', () => {
    expect(unseenUserInput([user('old', 'x')], new Set(), new Set()).blocks).toEqual([])
  })

  it('keeps image references in place and drops other non-text blocks', () => {
    const ref = { attachmentId: 'img-1', mediaType: 'image/png' }
    const message = {
      id: '1',
      role: 'user',
      content: [
        { type: 'image', attachment: ref },
        { type: 'text', text: 'see' },
        { type: 'image', attachment: ref, offloaded: true },
        { type: 'thinking', text: 'x' },
      ],
      source: { kind: 'user' },
    } as unknown as RequestMessage
    expect(unseenUserInput([message], new Set()).blocks).toEqual([
      { type: 'image', ref, offloaded: false },
      { type: 'text', text: 'see' },
      { type: 'image', ref, offloaded: true },
    ])
  })
})

describe('unseenUserInput image references', () => {
  it('drops an image whose reference is malformed rather than sending garbage', () => {
    const message = {
      id: '1',
      role: 'user',
      content: [
        { type: 'image', attachment: { attachmentId: 1 } },
        { type: 'image', attachment: null },
        { type: 'text', text: 'see' },
      ],
      source: { kind: 'user' },
    } as unknown as RequestMessage
    expect(unseenUserInput([message], new Set()).blocks).toEqual([{ type: 'text', text: 'see' }])
  })
})

describe('nativeReplayState and readNativeSession', () => {
  it('round-trips the native session through assistant replay state', () => {
    const state = nativeReplayState('acp-1', 'dsh-1')
    expect(readNativeSession([user('1', 'x'), assistant(state)], 'dsh-1', 'cli-x')).toBe('acp-1')
  })

  it('uses the most recent assistant message', () => {
    const messages = [assistant(nativeReplayState('old', 'dsh-1')), assistant(nativeReplayState('new', 'dsh-1'))]
    expect(readNativeSession(messages, 'dsh-1', 'cli-x')).toBe('new')
  })

  it('finds nothing without replay state', () => {
    expect(readNativeSession([user('1', 'x'), assistant()], 'dsh-1', 'cli-x')).toBeUndefined()
  })

  // A fork seeds the parent's messages under a new id. Reattaching it to the
  // parent's native session would let two harness sessions write to one CLI session.
  it('refuses a native session recorded by a different harness session', () => {
    expect(readNativeSession([assistant(nativeReplayState('acp-1', 'parent'))], 'fork', 'cli-x')).toBeUndefined()
  })

  // All CLIs share one adapter, so the harness does not strip another route's replay state.
  it('refuses a native session recorded by another CLI', () => {
    expect(
      readNativeSession([assistant(nativeReplayState('acp-1', 'dsh-1'), 'cli-y')], 'dsh-1', 'cli-x'),
    ).toBeUndefined()
  })

  it('stops at an assistant message from another route', () => {
    const messages = [assistant(nativeReplayState('acp-1', 'dsh-1')), assistant(undefined, 'deepseek')]
    expect(readNativeSession(messages, 'dsh-1', 'cli-x')).toBeUndefined()
  })

  it.each([
    ['null', null],
    ['non-object response', { response: 'x' }],
    ['wrong field types', { response: { acpSessionId: 1, dshSessionId: 'dsh-1' } }],
  ])('rejects malformed replay state: %s', (_name, state) => {
    expect(readNativeSession([assistant(state)], 'dsh-1', 'cli-x')).toBeUndefined()
  })
})
