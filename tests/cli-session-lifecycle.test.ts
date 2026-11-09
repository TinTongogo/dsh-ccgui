import { describe, expect, it, vi } from 'vitest'
import type { StopReason } from '@agentclientprotocol/sdk'
import type { RequestMessage } from '@deepseek-ai/dsh-llm'
import { CliSession } from '../src/cli-session.ts'
import { FakeTransport } from './fixtures/fake-transport.ts'
import type { PromptScript } from './fixtures/fake-transport.ts'
import {
  setupWith,
  OPTIONS,
  text,
  toolCall,
  toolUpdate,
  user,
  toolResult,
  assistantWithReplay,
  setup,
  collect,
  textOf,
  finishOf,
  toolCallOf,
  gate,
  allow,
  never,
} from './fixtures/cli-session-helpers.ts'

describe('CliSession resume', () => {
  const history = [assistantWithReplay('acp-old', 'dsh-1'), user('2', 'continue')]

  it('prefers session/resume when the CLI supports it', async () => {
    const { fake, session } = setup(() => 'end_turn')
    fake.capabilities = { loadSession: true, sessionCapabilities: { resume: {} } }
    const chunks = await collect(session.stream({ messages: history }))
    expect(fake.resumed).toEqual(['acp-old'])
    expect(fake.loaded).toEqual([])
    expect(fake.newSessions).toEqual([])
    expect(fake.promptSessions).toEqual(['acp-old'])
    expect(textOf(chunks)).toBe('')
  })

  it('falls back to session/load and drops the replayed history', async () => {
    const { fake, session } = setup((t) => {
      t.update(text('new'))
      return 'end_turn' as const
    })
    fake.capabilities = { loadSession: true }
    fake.loadReplay = [text('old history')]
    const chunks = await collect(session.stream({ messages: history }))
    expect(fake.loaded).toEqual(['acp-old'])
    expect(textOf(chunks)).toBe('new')
  })

  it('starts fresh with a notice when the CLI cannot resume', async () => {
    const { fake, session } = setup((t) => {
      t.update(text('ok'))
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: history }))
    expect(fake.newSessions).toEqual(['/repo'])
    expect(textOf(chunks)).toContain('OpenCode')
    expect(textOf(chunks)).toContain('ok')
  })

  it('starts fresh with a notice when resume fails', async () => {
    const { fake, session } = setup(() => 'end_turn')
    fake.capabilities = { sessionCapabilities: { resume: {} } }
    fake.resumeError = new Error('no such session')
    const chunks = await collect(session.stream({ messages: history }))
    expect(fake.newSessions).toEqual(['/repo'])
    expect(textOf(chunks)).toContain('OpenCode')
  })

  it('never reattaches a fork to its parent CLI session', async () => {
    const { fake, session } = setup(() => 'end_turn')
    fake.capabilities = { sessionCapabilities: { resume: {} } }
    const chunks = await collect(
      session.stream({
        messages: [assistantWithReplay('acp-old', 'parent'), user('2', 'x')],
      }),
    )
    expect(fake.resumed).toEqual([])
    expect(fake.newSessions).toEqual(['/repo'])
    // It inherited a conversation the new CLI session knows nothing about.
    expect(textOf(chunks)).toContain('OpenCode')
  })

  it('warns when a CLI takes over a conversation it has never seen', async () => {
    const { session } = setup(() => 'end_turn' as const)
    const earlier = {
      id: 'a',
      role: 'assistant',
      content: [{ type: 'text', text: 'from another model' }],
      source: { kind: 'model', provider: 'deepseek', model: 'flash' },
    } as unknown as RequestMessage
    const chunks = await collect(session.stream({ messages: [user('1', 'hi'), earlier, user('2', 'now you')] }))
    expect(textOf(chunks)).toContain('OpenCode')
  })
})

describe('CliSession replacement', () => {
  function replacement(...scripts: PromptScript[]): { fake: FakeTransport; session: CliSession } {
    const fake = new FakeTransport()
    fake.scripts = scripts
    const session = new CliSession({
      dshSessionId: 'dsh-1',
      provider: 'cli-x',
      cwd: '/repo',
      label: 'OpenCode',
      openTransport: (handlers) => fake.attach(handlers),
      sentMessageIds: new Set(['1']),
    })
    return { fake, session }
  }

  it('records what it has sent', async () => {
    const { session } = setup(() => 'end_turn')
    await collect(session.stream({ messages: [user('1', 'hi')] }))
    expect([...session.sentMessageIds]).toEqual(['1'])
  })

  // A failed turn leaves its prompt at the end of the history. Sending it again
  // would make a new CLI process repeat an instruction it may already have acted on.
  it('never resends a message an earlier CLI process received', async () => {
    const { fake, session } = replacement(() => 'end_turn')
    await collect(session.stream({ messages: [user('1', 'delete x'), user('2', 'next')] }))
    expect(fake.prompts).toEqual([[{ type: 'text', text: 'next' }]])
  })

  it('tells the user a replacement process starts without the conversation', async () => {
    const { session } = replacement(() => 'end_turn')
    const chunks = await collect(session.stream({ messages: [user('1', 'x'), user('2', 'y')] }))
    expect(textOf(chunks)).toContain('OpenCode')
  })
})

describe('CliSession turn boundaries', () => {
  it('does not send a prompt from an earlier turn', async () => {
    const { fake, session } = setup(() => 'end_turn' as const)
    await collect(
      session.stream({
        messages: [user('old', 'delete x'), user('new', 'next')],
        currentTurnMessageIds: new Set(['new']),
      }),
    )
    expect(fake.prompts).toEqual([[{ type: 'text', text: 'next' }]])
  })

  it('ignores output the CLI sends outside a turn', async () => {
    const { fake, session } = setup(
      () => 'end_turn' as const,
      (t) => {
        t.update(text('fresh'))
        return 'end_turn' as const
      },
    )
    await collect(session.stream({ messages: [user('1', 'go')] }))
    fake.update(text('STALE'))
    fake.update(toolCall('late', { status: 'in_progress' }))
    const chunks = await collect(session.stream({ messages: [user('1', 'go'), user('2', 'new')] }))
    expect(textOf(chunks)).toBe('fresh')
    expect(chunks.some((chunk) => chunk.type === 'tool-call-delta')).toBe(false)
  })

  it('waits for an earlier process to stop before starting', async () => {
    const stopped = gate()
    const fake = new FakeTransport()
    fake.scripts = [() => 'end_turn' as const]
    const session = new CliSession({
      dshSessionId: 'dsh-1',
      provider: 'cli-x',
      cwd: '/repo',
      label: 'OpenCode',
      openTransport: (handlers) => fake.attach(handlers),
      after: stopped.wait,
    })
    const turn = collect(session.stream({ messages: [user('1', 'go')] }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fake.newSessions).toEqual([])
    stopped.open()
    await turn
    expect(fake.newSessions).toEqual(['/repo'])
  })
})

describe('CliSession that never finishes starting', () => {
  // `npx` can stall on the network and a CLI can sit waiting for a login. Without a limit
  // every later message in the session would hang too.
  it('gives up, stops the process, and lets the next message start another', async () => {
    const { fake, session } = setupWith({ startTimeoutMs: 10 })
    fake.initialize = () => new Promise(() => {})
    await expect(collect(session.stream({ messages: [user('1', 'hi')] }))).rejects.toMatchObject({
      code: 'CLI_START_FAILED',
    })
    expect(fake.disposedForcefully).toBe(true)
    expect(session.replaceable).toBe(true)
  })

  it('says how long it waited', async () => {
    const { fake, session } = setupWith({ startTimeoutMs: 1_000 })
    fake.initialize = () => new Promise(() => {})
    await expect(collect(session.stream({ messages: [user('1', 'hi')] }))).rejects.toThrow('1 秒')
  })
})

describe('CliSession stopped while starting', () => {
  it('does not start a CLI when disposed during the wait for an earlier process', async () => {
    const stopped = gate()
    const opened = vi.fn()
    const fake = new FakeTransport()
    const session = new CliSession({
      dshSessionId: 'dsh-1',
      provider: 'cli-x',
      cwd: '/repo',
      label: 'OpenCode',
      openTransport: (handlers) => {
        opened()
        return fake.attach(handlers)
      },
      after: stopped.wait,
    })
    const turn = collect(session.stream({ messages: [user('1', 'go')] }))
    await session.dispose()
    stopped.open()
    await expect(turn).rejects.toThrow('已关闭')
    expect(opened).not.toHaveBeenCalled()
  })

  // A turn cut off by the plugin going away must say so, not look like an ordinary close.
  it('fails a waiting turn with the reason it was stopped', async () => {
    const { session } = setup()
    const turn = collect(session.stream({ messages: [user('1', 'go')] }))
    await session.dispose(false, '插件已重新加载')
    await expect(turn).rejects.toMatchObject({ message: 'OpenCode 已停止：插件已重新加载' })
  })

  it('keeps the install hint when the process dies during startup', async () => {
    const { fake, session } = setup()
    fake.initialize = () => {
      fake.close(new Error('spawn opencode ENOENT'))
      return Promise.reject(new Error('spawn opencode ENOENT'))
    }
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toThrow('请确认它已安装')
  })

  // Reinstalling does not fix a broken npx cache, so the install hint would send the user the wrong way.
  it('names the npx cache to delete when the install there is incomplete', async () => {
    const { fake, session } = setup()
    const died = new Error(
      'exited with code 1: file:///Users/u/.npm/_npx/c51fd8e4/node_modules/@openai/codex/bin/codex.js:107 ' +
        'Error: Missing optional dependency @openai/codex-darwin-arm64.',
    )
    fake.initialize = () => {
      fake.close(died)
      return Promise.reject(died)
    }
    const failure = collect(session.stream({ messages: [user('1', 'x')] }))
    await expect(failure).rejects.toMatchObject({
      code: 'CLI_START_FAILED',
      message: expect.stringContaining('请删除 /Users/u/.npm/_npx/c51fd8e4 后重试') as unknown,
    })
    await expect(failure).rejects.not.toThrow('请确认它已安装')
  })

  it('does not send to a CLI that exits right after starting', async () => {
    const { fake, session } = setup()
    const newSession = fake.newSession.bind(fake)
    fake.newSession = async (cwd) => {
      const id = await newSession(cwd)
      fake.close(new Error('exited at once'))
      return id
    }
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toThrow('exited at once')
    expect(fake.prompts).toEqual([])
    expect(session.sentMessageIds.has('1')).toBe(false)
  })

  // Pushing the notice first would leave a false claim behind if the new session
  // then fails to open, shown as the reply to the user's next message.
  it('announces a fresh session only once it exists', async () => {
    const fake = new FakeTransport()
    fake.newSession = () => Promise.reject(new Error('quota exceeded'))
    const session = new CliSession({
      dshSessionId: 'dsh-1',
      provider: 'cli-x',
      cwd: '/repo',
      label: 'OpenCode',
      openTransport: (handlers) => fake.attach(handlers),
      sentMessageIds: new Set(['1']),
    })
    await expect(collect(session.stream({ messages: [user('2', 'x')] }))).rejects.toThrow('quota exceeded')
    expect(session.replaceable).toBe(true)
  })
})

describe('CliSession dead with output still unread', () => {
  function endedThenDied() {
    const context = setup((t) => {
      t.update(toolCall('a', { status: 'completed' }))
      return 'end_turn' as const
    })
    return { ...context, messages: [user('1', 'go')] }
  }

  // The turn looks finished, so a quiet `stop` would swallow the user's message
  // with nothing on screen to say it never reached the CLI.
  it('fails the step when this request has input the CLI never got', async () => {
    const { fake, session, messages } = endedThenDied()
    const first = await collect(session.stream({ messages }))
    await session.waitForTool(toolCallOf(first).id, never)
    fake.close(new Error('exited'))
    const steered = [...messages, toolResult(), user('2', 'also')]
    await expect(collect(session.stream({ messages: steered }))).rejects.toThrow('exited')
    expect(fake.prompts).toHaveLength(1)
    expect(session.sentMessageIds.has('2')).toBe(false)
    expect(session.replaceable).toBe(true)
  })

  it('finishes normally when nothing was owed', async () => {
    const { fake, session, messages } = endedThenDied()
    const first = await collect(session.stream({ messages }))
    await session.waitForTool(toolCallOf(first).id, never)
    fake.close(new Error('exited'))
    const chunks = await collect(session.stream({ messages: [...messages, toolResult()] }))
    expect(finishOf(chunks)?.reason).toEqual({ kind: 'stop' })
  })

  it('still delivers a tool call read from the queue before failing', async () => {
    const { fake, session } = setup((t) => {
      t.update(toolCall('a', { status: 'completed' }))
      t.update(toolCall('b', { status: 'completed' }))
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    await session.waitForTool(toolCallOf(first).id, never)
    fake.close(new Error('exited'))
    const next = [...messages, toolResult(), user('2', 'also')]
    const second = await collect(session.stream({ messages: next }))
    expect(toolCallOf(second).id).toBe('cli-2')
    await session.waitForTool('cli-2', never)
    await expect(collect(session.stream({ messages: [...next, toolResult()] }))).rejects.toThrow('exited')
  })
})

describe('CliSession queued input', () => {
  // Steering waits for the running turn, and it can be discarded before it goes out.
  // Counting it as sent would stop a replacement CLI from ever receiving it.
  it('counts a message as sent only when it actually goes out', async () => {
    const released = gate()
    const { fake, session } = setup(
      async (t) => {
        t.update(toolCall('a', { status: 'completed' }))
        t.update(toolCall('b', { status: 'in_progress' }))
        await released.wait
        t.update(toolUpdate('b', { status: 'completed' }))
        return 'end_turn' as const
      },
      (t) => {
        t.update(text('steered'))
        return 'end_turn' as const
      },
    )
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    await session.waitForTool(toolCallOf(first).id, never)
    const withSteer = [...messages, toolResult(), user('2', 'also')]
    const second = await collect(session.stream({ messages: withSteer }))
    expect(session.sentMessageIds.has('2')).toBe(false)

    // Asked again in the same state, it must not queue the same message twice.
    released.open()
    await session.waitForTool(toolCallOf(second).id, never)
    const third = await collect(session.stream({ messages: [...withSteer, toolResult()] }))
    expect(textOf(third)).toBe('steered')
    expect(fake.prompts).toEqual([[{ type: 'text', text: 'go' }], [{ type: 'text', text: 'also' }]])
    expect(session.sentMessageIds.has('2')).toBe(true)
  })

  it('does not hang on queued input when the CLI dies', async () => {
    const { fake, session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await new Promise(() => {})
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    const first = await collect(session.stream({ messages }))
    const waiting = session.waitForTool(toolCallOf(first).id, never)
    fake.close(new Error('exited'))
    await waiting
    const steered = [...messages, toolResult(), user('2', 'also')]
    await expect(collect(session.stream({ messages: steered }))).rejects.toThrow('exited')
  })
})

describe('CliSession call asked about after being set aside', () => {
  it('follows a skipped call that later asks for permission through to its result', async () => {
    const released = gate()
    const { session } = setup(async (t) => {
      t.update(toolCall('x', { status: 'in_progress' }))
      await released.wait
      await t.askPermission({ toolCall: { toolCallId: 'x', title: 'retry' }, options: OPTIONS })
      t.update(toolUpdate('x', { status: 'completed', rawOutput: 'done' }))
      await new Promise(() => {})
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    await collect(session.stream({ messages }))
    released.open()
    const second = await collect(session.stream({ messages: [...messages, toolResult()] }))
    const outcome = await session.waitForTool(toolCallOf(second).id, allow)
    expect(outcome).toMatchObject({ text: 'done', failed: false })
  })
})

describe('CliSession failures', () => {
  it('reports a CLI that cannot start and marks the session dead', async () => {
    const { fake, session } = setup()
    fake.initializeError = new Error('spawn opencode ENOENT')
    const stream = session.stream({ messages: [user('1', 'x')] })
    await expect(collect(stream)).rejects.toMatchObject({ code: 'CLI_START_FAILED' })
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toThrow('ENOENT')
    expect(session.dead).toBe(true)
  })

  it('reports a failed prompt and keeps the session usable', async () => {
    const { session } = setup(
      (): StopReason => {
        throw new Error('overloaded')
      },
      (t) => {
        t.update(text('ok'))
        return 'end_turn' as const
      },
    )
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toMatchObject({
      code: 'CLI_PROMPT_FAILED',
    })
    expect(session.dead).toBe(false)
    const chunks = await collect(session.stream({ messages: [user('1', 'x'), user('2', 'y')] }))
    expect(textOf(chunks)).toBe('ok')
  })

  it('fails open tools and marks the session dead when the process exits', async () => {
    const { fake, session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await new Promise(() => {})
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: [user('1', 'go')] }))
    const waiting = session.waitForTool(toolCallOf(chunks).id, never)
    fake.close(new Error('exited with code 1'))
    expect((await waiting).failed).toBe(true)
    expect(session.dead).toBe(true)
  })

  it('marks an idle session dead when the process exits', async () => {
    const { fake, session } = setup(() => 'end_turn')
    await collect(session.stream({ messages: [user('1', 'go')] }))
    fake.close(new Error('exited'))
    expect(session.dead).toBe(true)
    expect(session.replaceable).toBe(true)
  })

  // Replacing the session here would discard the exit reason and report the turn
  // as a clean stop, leaving the user no sign that their CLI crashed.
  it('reports why the CLI died before it can be replaced', async () => {
    const { fake, session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await new Promise(() => {})
      return 'end_turn' as const
    })
    const messages = [user('1', 'go')]
    const chunks = await collect(session.stream({ messages }))
    const waiting = session.waitForTool(toolCallOf(chunks).id, never)
    fake.close(new Error('exit code 137'))
    await waiting
    expect(session.replaceable).toBe(false)
    await expect(collect(session.stream({ messages: [...messages, toolResult()] }))).rejects.toThrow('exit code 137')
    expect(session.replaceable).toBe(true)
  })

  it('stops the process when startup fails', async () => {
    const { fake, session } = setup()
    fake.initializeError = new Error('not logged in')
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toThrow('not logged in')
    expect(fake.disposed).toBe(true)
  })

  it('refuses to stream once disposed', async () => {
    const { fake, session } = setup()
    await session.dispose()
    expect(fake.disposed).toBe(false)
    await expect(collect(session.stream({ messages: [user('1', 'x')] }))).rejects.toMatchObject({
      code: 'CLI_START_FAILED',
    })
  })

  it('disposes the transport and fails a running turn', async () => {
    const { fake, session } = setup(async (t) => {
      t.update(toolCall('a', { status: 'in_progress' }))
      await new Promise(() => {})
      return 'end_turn' as const
    })
    const chunks = await collect(session.stream({ messages: [user('1', 'go')] }))
    const waiting = session.waitForTool(toolCallOf(chunks).id, never)
    await session.dispose()
    expect(fake.disposed).toBe(true)
    expect((await waiting).failed).toBe(true)
    expect(session.dead).toBe(true)
  })
})
