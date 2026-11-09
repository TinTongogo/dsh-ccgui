import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { CliSession } from '../src/cli-session.ts'
import { DEFAULT_MODEL_ID } from '../src/adapter.ts'
import { CliSessionRegistry } from '../src/session-registry.ts'
import type { CliAgentConfig, RegistryDeps } from '../src/session-registry.ts'

const AGENTS: CliAgentConfig[] = [
  { id: 'x', name: 'X CLI', command: 'x', args: ['acp'], env: {} },
  { id: 'y', name: 'Y CLI', command: 'y', args: [], env: {} },
]

function fakeAgent(id = 'dsh-1', cwd: string | null = '/repo'): Agent {
  return {
    id,
    session: { header: cwd === null ? {} : { cwd } },
    model: { select: vi.fn(), current: vi.fn(() => undefined) },
  } as unknown as Agent
}

function fakeSession(fields: Partial<CliSession> = {}): CliSession {
  return {
    dead: false,
    replaceable: false,
    sentMessageIds: new Set<string>(),
    abandonTurn: vi.fn(),
    dispose: vi.fn(() => Promise.resolve()),
    waitForTool: vi.fn(() => Promise.resolve({ text: 'ok', failed: false, diffs: [] })),
    ...fields,
  } as unknown as CliSession
}

function setup(overrides: Partial<RegistryDeps> = {}) {
  const agent = fakeAgent()
  const sessions: CliSession[] = []
  const deps: RegistryDeps = {
    getAgent: (id) => (id === agent.id ? agent : undefined),
    composedPreset: () => undefined,
    ptcWrap: () => ({ timeoutMs: 600_000 }),
    onCliSelected: vi.fn(),
    ask: vi.fn(() => Promise.resolve('allowed-once' as const)),
    warn: vi.fn(),
    createSession: vi.fn(() => {
      const session = fakeSession()
      sessions.push(session)
      return session
    }),
    ...overrides,
  }
  return { agent, sessions, deps, registry: new CliSessionRegistry(AGENTS, deps) }
}

const execFor = (agent: Agent | undefined, callId = 'cli-1'): ToolRunContext =>
  ({
    agent,
    callId,
    signal: new AbortController().signal,
  }) as unknown as ToolRunContext

describe('catalog', () => {
  it('derives a provider route from each agent id', () => {
    expect(setup().registry.providers).toEqual(['cli-x', 'cli-y'])
  })

  it('labels known routes only', () => {
    const { registry } = setup()
    expect(registry.labelFor('cli-x')).toBe('X CLI')
    expect(registry.labelFor('deepseek')).toBeUndefined()
  })
})

describe('isCliRoute', () => {
  it('recognizes configured routes only', () => {
    const { registry } = setup()
    expect(registry.isCliRoute('cli-x')).toBe(true)
    expect(registry.isCliRoute('deepseek-official')).toBe(false)
  })
})

describe('configFor', () => {
  it('finds the agent behind a route', () => {
    const { registry } = setup()
    expect(registry.configFor('cli-y')).toBe(AGENTS[1])
    expect(registry.configFor('nope')).toBeUndefined()
  })
})

// Starting a CLI to read its models is only acceptable once someone has chosen that CLI.
describe('noticing a chosen CLI', () => {
  it('reports a selection of a CLI', () => {
    const { deps, registry } = setup()
    registry.observeEvent('dsh-1', { type: 'model/selection', data: { provider: 'cli-x', model: 'default' } })
    expect(deps.onCliSelected).toHaveBeenCalledWith('cli-x')
  })

  it.each([
    ['another provider', { provider: 'deepseek', model: 'x' }],
    ['no provider', { model: 'x' }],
    ['no data', undefined],
  ])('ignores a selection of %s', (_name, data) => {
    const { deps, registry } = setup()
    registry.observeEvent('dsh-1', { type: 'model/selection', data })
    expect(deps.onCliSelected).not.toHaveBeenCalled()
  })

  it('reports a session that opens on a CLI', () => {
    const { agent, deps, registry } = setup()
    vi.mocked(agent.model.current).mockReturnValue({ provider: 'cli-x', model: 'default' })
    registry.routeAgent(agent)
    expect(deps.onCliSelected).toHaveBeenCalledWith('cli-x')
  })

  it('ignores a session that opens on anything else', () => {
    const { agent, deps, registry } = setup()
    vi.mocked(agent.model.current).mockReturnValue({ provider: 'deepseek', model: 'x' })
    registry.routeAgent(agent)
    expect(deps.onCliSelected).not.toHaveBeenCalled()
  })
})

describe('routeAgent', () => {
  it('selects the CLI for an agent in its preset', () => {
    const { agent, registry } = setup({ composedPreset: () => 'cli-x' })
    registry.routeAgent(agent)
    expect(agent.model.select).toHaveBeenCalledWith({ provider: 'cli-x', model: DEFAULT_MODEL_ID })
  })

  // A resumed session must keep the model the user picked on this CLI.
  it('keeps a model already chosen on this CLI', () => {
    const { agent, registry } = setup({ composedPreset: () => 'cli-x' })
    vi.mocked(agent.model.current).mockReturnValue({ provider: 'cli-x', model: 'large' })
    registry.routeAgent(agent)
    expect(agent.model.select).not.toHaveBeenCalled()
  })

  it('leaves agents in other presets alone', () => {
    const { agent, registry } = setup({ composedPreset: () => 'standard' })
    registry.routeAgent(agent)
    expect(agent.model.select).not.toHaveBeenCalled()
  })

  it('leaves agents with no preset alone', () => {
    const { agent, registry } = setup()
    registry.routeAgent(agent)
    expect(agent.model.select).not.toHaveBeenCalled()
  })
})

describe('resolveSession', () => {
  it('creates a session with the agent config and working directory', () => {
    const { deps, registry, sessions } = setup()
    expect(registry.resolveSession('cli-x', 'dsh-1')).toBe(sessions[0])
    expect(deps.createSession).toHaveBeenCalledWith(
      AGENTS[0],
      'dsh-1',
      '/repo',
      expect.objectContaining({ sentMessageIds: new Set() }),
    )
  })

  it('hands what a dead session sent to its replacement', () => {
    const { registry, deps } = setup({
      createSession: vi
        .fn()
        .mockReturnValueOnce(fakeSession({ replaceable: true, sentMessageIds: new Set(['1']) }))
        .mockReturnValueOnce(fakeSession()),
    })
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-x', 'dsh-1')
    expect(deps.createSession).toHaveBeenLastCalledWith(
      AGENTS[0],
      'dsh-1',
      '/repo',
      expect.objectContaining({ sentMessageIds: new Set(['1']) }),
    )
  })

  it('reuses a live session', () => {
    const { registry } = setup()
    const first = registry.resolveSession('cli-x', 'dsh-1')
    expect(registry.resolveSession('cli-x', 'dsh-1')).toBe(first)
  })

  it('replaces a dead session', () => {
    const { registry, deps } = setup({
      createSession: vi
        .fn()
        .mockReturnValueOnce(fakeSession({ replaceable: true }))
        .mockReturnValueOnce(fakeSession()),
    })
    const first = registry.resolveSession('cli-x', 'dsh-1')
    const second = registry.resolveSession('cli-x', 'dsh-1')
    expect(second).not.toBe(first)
    expect(first.dispose).toHaveBeenCalled()
    expect(deps.createSession).toHaveBeenCalledTimes(2)
  })

  it('stops the old CLI when the session moves to another one', () => {
    const { registry, sessions } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-y', 'dsh-1')
    expect(sessions).toHaveLength(2)
    expect(sessions[0]?.dispose).toHaveBeenCalled()
  })

  it('rejects an unknown route', () => {
    expect(() => setup().registry.resolveSession('nope', 'dsh-1')).toThrow(
      expect.objectContaining({ code: 'CLI_START_FAILED' }),
    )
  })

  it('rejects an unknown session', () => {
    expect(() => setup().registry.resolveSession('cli-x', 'nope')).toThrow(
      expect.objectContaining({ code: 'CLI_START_FAILED' }),
    )
  })

  // The harness runs PTC sessions' mirror calls inside run_code, so the CLI can start there too.
  it('runs in PTC mode', () => {
    const { registry, deps } = setup({ composedPreset: () => 'ptc' })
    registry.resolveSession('cli-x', 'dsh-1')
    expect(deps.createSession).toHaveBeenCalledTimes(1)
  })

  it('runs in any other mode', () => {
    const { registry, deps } = setup({ composedPreset: () => 'standard' })
    registry.resolveSession('cli-x', 'dsh-1')
    expect(deps.createSession).toHaveBeenCalledTimes(1)
  })

  it('rejects a session with no working directory', () => {
    const agent = fakeAgent('dsh-1', null)
    const { registry } = setup({ getAgent: () => agent })
    expect(() => registry.resolveSession('cli-x', 'dsh-1')).toThrow(
      expect.objectContaining({ code: 'CLI_START_FAILED' }),
    )
  })
})

describe('waitForTool', () => {
  it('delegates to the session and asks through the harness', async () => {
    const { agent, deps, registry, sessions } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    const exec = execFor(agent)
    await expect(registry.waitForTool(exec)).resolves.toMatchObject({ text: 'ok' })
    const session = sessions[0] as CliSession
    const [callId, ask, signal] = vi.mocked(session.waitForTool).mock.calls[0] as Parameters<CliSession['waitForTool']>
    expect(callId).toBe('cli-1')
    expect(signal).toBe(exec.signal)
    const askSignal = new AbortController().signal
    await expect(ask({ reason: 'rm x', callId: 'cli-1' }, askSignal)).resolves.toBe('allowed-once')
    expect(deps.ask).toHaveBeenCalledWith(agent, { reason: 'rm x', callId: 'cli-1' }, askSignal)
  })

  it('rejects a call outside a CLI session', async () => {
    const { agent, registry } = setup()
    await expect(registry.waitForTool(execFor(agent))).rejects.toThrow('cli_tool')
  })

  it('rejects a call with no agent', async () => {
    await expect(setup().registry.waitForTool(execFor(undefined))).rejects.toThrow('cli_tool')
  })
})

describe('resolveSession replacement order', () => {
  it('keeps a dead session whose failure has not been read', () => {
    const dying = fakeSession({ dead: true, replaceable: false })
    const { registry } = setup({ createSession: vi.fn(() => dying) })
    expect(registry.resolveSession('cli-x', 'dsh-1')).toBe(dying)
    expect(registry.resolveSession('cli-x', 'dsh-1')).toBe(dying)
  })

  it('makes a replacement wait until the old process has stopped', async () => {
    const stopped = Promise.withResolvers<void>()
    const create = vi
      .fn()
      .mockReturnValueOnce(fakeSession({ replaceable: true, dispose: () => stopped.promise }))
      .mockReturnValueOnce(fakeSession())
    const { registry } = setup({ createSession: create })
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-x', 'dsh-1')
    const { after } = create.mock.calls[1]?.[3] as { after: Promise<void> }
    let settled = false
    void after.then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(settled).toBe(false)
    stopped.resolve()
    await after
    expect(settled).toBe(true)
  })
})

describe('resolveSession consecutive replacements', () => {
  // If each stop overwrote the last, a third CLI could start while the first still
  // runs, with both working on the same directory.
  it('keeps waiting for the oldest process', async () => {
    const stopped = Promise.withResolvers<void>()
    const create = vi
      .fn()
      .mockReturnValueOnce(fakeSession({ replaceable: true, dispose: () => stopped.promise }))
      .mockReturnValueOnce(fakeSession({ replaceable: true }))
      .mockReturnValueOnce(fakeSession())
    const { registry } = setup({ createSession: create })
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-x', 'dsh-1')
    const { after } = create.mock.calls[2]?.[3] as { after: Promise<void> }
    let settled = false
    void after.then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(settled).toBe(false)
    stopped.resolve()
    await after
    expect(settled).toBe(true)
  })
})

describe('turn tracking', () => {
  const message = (id: string) => ({ type: 'user/message', data: { id } })
  const turnStart = { type: 'turn/start', data: { turn: 1 } }
  const turnEnd = { type: 'turn/end', data: { turn: 1 } }

  it('collects the user messages of the open turn', () => {
    const { registry } = setup()
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-1', message('a'))
    registry.observeEvent('dsh-1', message('b'))
    expect(registry.currentTurnMessageIds('dsh-1')).toEqual(new Set(['a', 'b']))
  })

  it('forgets earlier turns when a new one starts', () => {
    const { registry } = setup()
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-1', message('old'))
    registry.observeEvent('dsh-1', turnEnd)
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-1', message('new'))
    expect(registry.currentTurnMessageIds('dsh-1')).toEqual(new Set(['new']))
  })

  it('reports no messages outside a turn', () => {
    expect(setup().registry.currentTurnMessageIds('dsh-1')).toEqual(new Set())
  })

  it('keeps sessions apart', () => {
    const { registry } = setup()
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-2', turnStart)
    registry.observeEvent('dsh-2', message('other'))
    expect(registry.currentTurnMessageIds('dsh-1')).toEqual(new Set())
  })

  it('ignores a user message event with no id', () => {
    const { registry } = setup()
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-1', { type: 'user/message', data: {} })
    expect(registry.currentTurnMessageIds('dsh-1')).toEqual(new Set())
  })

  it('abandons the CLI turn when the harness turn ends', () => {
    const { registry, sessions } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    registry.observeEvent('dsh-1', turnEnd)
    expect(sessions[0]?.abandonTurn).toHaveBeenCalledTimes(1)
  })

  it('ignores the end of a turn in a session with no CLI', () => {
    expect(() => setup().registry.observeEvent('deepseek-session', turnEnd)).not.toThrow()
  })

  it('forgets a disposed session', () => {
    const { registry } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    registry.observeEvent('dsh-1', turnStart)
    registry.observeEvent('dsh-1', message('a'))
    registry.disposeSession('dsh-1')
    expect(registry.currentTurnMessageIds('dsh-1')).toEqual(new Set())
  })
})

describe('disposal', () => {
  it('stops the session and forgets it', () => {
    const { agent, registry, sessions, deps } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    registry.disposeSession('dsh-1')
    expect(sessions[0]?.dispose).toHaveBeenCalled()
    registry.resolveSession('cli-x', agent.id)
    expect(deps.createSession).toHaveBeenCalledTimes(2)
  })

  it('ignores a session it does not know', () => {
    expect(() => setup().registry.disposeSession('nope')).not.toThrow()
  })

  it('stops every session', () => {
    const second = fakeAgent('dsh-2')
    const first = fakeAgent('dsh-1')
    const { registry, sessions } = setup({ getAgent: (id) => (id === 'dsh-1' ? first : second) })
    registry.resolveSession('cli-x', 'dsh-1')
    registry.resolveSession('cli-x', 'dsh-2')
    registry.disposeAll()
    expect(sessions[0]?.dispose).toHaveBeenCalled()
    expect(sessions[1]?.dispose).toHaveBeenCalled()
  })

  it('passes the reason on to every session it stops', () => {
    const { registry, sessions } = setup()
    registry.resolveSession('cli-x', 'dsh-1')
    registry.disposeAll('插件已重新加载')
    expect(sessions[0]?.dispose).toHaveBeenCalledWith(false, '插件已重新加载')
  })

  it('reports a CLI that fails to stop', async () => {
    const { registry, deps } = setup({
      createSession: () => fakeSession({ dispose: () => Promise.reject(new Error('stuck')) }),
    })
    registry.resolveSession('cli-x', 'dsh-1')
    registry.disposeSession('dsh-1')
    await vi.waitFor(() => expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('stuck')))
  })
})

describe('ptcWrapFor', () => {
  it('wraps nothing outside PTC mode', () => {
    const { registry } = setup({ composedPreset: () => 'standard' })
    expect(registry.ptcWrapFor('cli-x', 'dsh-1')).toBeUndefined()
    expect(registry.ptcWrapFor('cli-x', 'nope')).toBeUndefined()
  })

  it('wraps by the PTC runtime in PTC mode', () => {
    const { registry } = setup({ composedPreset: () => 'ptc' })
    expect(registry.ptcWrapFor('cli-x', 'dsh-1')).toEqual({ timeoutMs: 600_000 })
  })

  // Unwrapped, every mirrored call would be refused while the CLI carried on unseen.
  it('refuses a PTC runtime that cannot run the wrapping program', () => {
    const { registry } = setup({ composedPreset: () => 'ptc', ptcWrap: () => undefined })
    const refuse = () => registry.ptcWrapFor('cli-x', 'dsh-1')
    expect(refuse).toThrow(expect.objectContaining({ code: 'CLI_WRONG_PRESET' }))
    expect(refuse).toThrow('X CLI 不支持当前的 PTC 运行时')
  })
})
