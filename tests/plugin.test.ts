import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { delimiter, join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Message } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, LlmAdapter, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { ToolDefinition, ToolRegistrationOptions, ToolRunContext } from '@deepseek-ai/dsh-tools'
import CliBridge from '../src/index.ts'
import type { CliAgentConfig, Config } from '../src/index.ts'
import { CLI_TOOL_NAME, DEFAULT_MODEL_ID } from '../src/constants.ts'
import { collect, textOf, toolCallOf, user } from './fixtures/cli-session-helpers.ts'
import { NodeSubprocess } from './fixtures/node-subprocess.ts'

// The fallback probe directory lives under the user's home; point it at a scratch
// directory so the suite never writes to the real one.
const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof Os>()
  return { ...actual, homedir: () => home.dir }
})

const FAKE_AGENT = join(import.meta.dirname, 'fixtures', 'fake-acp-agent.mjs')
const WAIT = { timeout: 10_000 }

const FAKE: CliAgentConfig = { id: 'fake', name: 'Fake CLI', command: process.execPath, args: [FAKE_AGENT], env: {} }
/** Never answers, so a probe of it stays in flight until it is aborted. */
const SILENT: CliAgentConfig = {
  id: 'silent',
  name: 'Silent CLI',
  command: process.execPath,
  args: ['-e', 'setInterval(() => {}, 1000)'],
  env: {},
}
/** Exits before speaking ACP, so starting it fails. */
const BROKEN: CliAgentConfig = {
  id: 'broken',
  name: 'Broken CLI',
  command: process.execPath,
  args: ['-e', 'process.exit(2)'],
  env: {},
}

/** Type a partial stand-in for a harness object; only the fields the plugin reads are set. */
const fake = <T>(fields: Partial<T>): T => fields as T
const sid = (id: string): SessionId => id as SessionId

interface Registration {
  readonly definition: ToolDefinition
  readonly options: ToolRegistrationOptions | undefined
}

interface ReviewMock {
  /** Providers the harness advertises besides the CLIs. */
  providers: string[]
  /** Models each of those providers advertises, in order. */
  models: Record<string, string[]>
  /** Providers whose model catalog cannot be read, to exercise the fallback. */
  failModels: string[]
  /** Requests the plugin forwarded to a stateless route. */
  requests: GenerateOptions[]
}

interface Harness {
  readonly root: Context
  readonly subprocess: NodeSubprocess
  readonly adapters: { providers: string[]; adapter: LlmAdapter }[]
  readonly tools: Registration[]
  readonly agents: Map<string, Agent>
  readonly presets: Map<Context, string>
  readonly logs: Message[]
  readonly modelUpdates: string[]
  readonly dshHome: string
  readonly review: ReviewMock
}

const REVIEW_FINISH: StreamChunk = { type: 'finish', reason: { kind: 'stop' } }

interface FakeAgent {
  readonly agent: Agent
  readonly select: ReturnType<typeof vi.fn>
}

function harness({ homePath = true }: { homePath?: boolean } = {}): Harness {
  const root = new Context()
  const subprocess = new NodeSubprocess()
  const adapters: Harness['adapters'] = []
  const tools: Registration[] = []
  const agents = new Map<string, Agent>()
  const presets = new Map<Context, string>()
  const logs: Message[] = []
  const modelUpdates: string[] = []
  const review: ReviewMock = { providers: [], models: {}, failModels: [], requests: [] }
  const dshHome = mkdtempSync(join(tmpdir(), 'ccgui-home-'))
  root.logger.exporter({ export: (message) => logs.push(message) })
  root.on('llm/models-updated', (provider) => modelUpdates.push(provider))
  root.provide('llm', {
    registerAdapter: (providers: string[], adapter: LlmAdapter) => {
      adapters.push({ providers, adapter })
      return () => undefined
    },
    listProviders: () => review.providers.map((id) => ({ id, name: id })),
    listModels: (provider: string) =>
      review.failModels.includes(provider)
        ? Promise.reject(new Error('catalog unavailable'))
        : Promise.resolve((review.models[provider] ?? []).map((id) => ({ provider, id, name: id }))),
    stream: (options: GenerateOptions) => {
      review.requests.push(options)
      return (async function* (): AsyncGenerator<StreamChunk> {
        yield REVIEW_FINISH
      })()
    },
  })
  root.provide('tools', {
    register: (definition: ToolDefinition, options?: ToolRegistrationOptions) => {
      tools.push({ definition, options })
      return () => undefined
    },
  })
  root.provide('agents', { get: (id: string) => agents.get(id) })
  root.provide('subprocess', { spawn: subprocess.spawn.bind(subprocess) })
  root.provide('agentPresets', { composedPreset: (ctx: Context) => presets.get(ctx) })
  if (homePath) root.provide('dshHomePath', (...segments: string[]) => join(dshHome, ...segments))
  return { root, subprocess, adapters, tools, agents, presets, logs, modelUpdates, dshHome, review }
}

function addAgent(
  h: Harness,
  { id = 'dsh-1', preset, cwd }: { id?: string; preset?: string; cwd?: string } = {},
): FakeAgent {
  const agentCtx = fake<Context>({})
  if (preset !== undefined) h.presets.set(agentCtx, preset)
  let current: { provider: string; model: string } | undefined
  const select = vi.fn((selection: { provider: string; model: string }) => {
    current = selection
  })
  const agent = fake<Agent>({
    id: sid(id),
    ctx: agentCtx,
    session: fake<Session>({ header: fake<SessionHeader>({ cwd: cwd ?? mkdtempSync(join(tmpdir(), 'ccgui-')) }) }),
    model: fake<Agent['model']>({ select, current: () => current }),
  })
  h.agents.set(id, agent)
  return { agent, select }
}

const BASE: Config = {
  agents: [FAKE],
  disposeGraceMs: 200,
  disposeEofGraceMs: 500,
  cancelGraceMs: 200,
  startTimeoutMs: 10_000,
  reviewProvider: '',
  reviewModel: '',
}

async function load(h: Harness, config: Partial<Config> = {}) {
  const fiber = h.root.plugin(CliBridge, { ...BASE, ...config })
  await fiber
  return fiber
}

const warnings = (h: Harness): string[] =>
  h.logs.filter((message) => message.type === 'warn').map((message) => String(message.args[0]))

function onlyAdapter(h: Harness): LlmAdapter {
  const [entry] = h.adapters
  if (entry === undefined) throw new Error('no adapter registered')
  return entry.adapter
}

function onlyTool(h: Harness): Registration {
  const [entry] = h.tools
  if (entry === undefined) throw new Error('no tool registered')
  return entry
}

/** This SDK types `purpose` as always undefined; newer hosts do send it. */
type RequestFields = Omit<Partial<GenerateOptions>, 'purpose'> & { purpose?: string }

const request = (fields: RequestFields): GenerateOptions =>
  Object.assign(
    {},
    fake<GenerateOptions>({
      provider: 'cli-fake',
      model: DEFAULT_MODEL_ID,
      messages: [],
      sessionId: sid('dsh-1'),
    }),
    fields,
  )

function emitSessionEvent(h: Harness, sessionId: string, event: { type: string; data?: unknown }): void {
  h.root.emit('session/event', fake<Session>({ id: sid(sessionId) }), event as SessionEvent)
}

/** Mark `ids` as the open turn's new user messages, as the harness log would. */
function openTurn(h: Harness, sessionId: string, ids: readonly string[]): void {
  emitSessionEvent(h, sessionId, { type: 'turn/start' })
  for (const id of ids) emitSessionEvent(h, sessionId, { type: 'user/message', data: { id } })
}

let disposers: (() => Promise<void>)[] = []

beforeEach(() => {
  home.dir = mkdtempSync(join(tmpdir(), 'ccgui-user-'))
})

afterEach(async () => {
  await Promise.all(disposers.map((dispose) => dispose()))
  disposers = []
})

/** Load the plugin and make sure its processes are gone after the test. */
async function start(h: Harness, config: Partial<Config> = {}) {
  const fiber = await load(h, config)
  disposers = [
    ...disposers,
    async () => {
      await fiber.dispose()
      await h.subprocess.allExited()
    },
  ]
  return fiber
}

/** Validate a raw config the way cordis does before constructing the plugin. */
function validate(input: unknown): { value?: unknown; issues?: readonly unknown[] } {
  const result = CliBridge.Config['~standard'].validate(input)
  if (result instanceof Promise) throw new Error('the schema must validate synchronously')
  return result
}

describe('CliBridge.Config', () => {
  it('fills every default for an empty config', () => {
    expect(validate({})).toEqual({
      value: {
        agents: [],
        disposeGraceMs: 3_000,
        disposeEofGraceMs: 6_000,
        cancelGraceMs: 10_000,
        startTimeoutMs: 120_000,
        reviewProvider: '',
        reviewModel: '',
      },
    })
  })

  it('accepts the shipped patch shape and defaults args and env', () => {
    const { value, issues } = validate({
      agents: [
        { id: 'claude', name: 'Claude Code', command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp'] },
        { id: 'omp', name: 'OMP CLI', command: 'omp' },
      ],
    })
    expect(issues).toBeUndefined()
    expect(value).toMatchObject({
      agents: [
        {
          id: 'claude',
          name: 'Claude Code',
          command: 'npx',
          args: ['-y', '@agentclientprotocol/claude-agent-acp'],
          env: {},
        },
        { id: 'omp', name: 'OMP CLI', command: 'omp', args: [], env: {} },
      ],
    })
  })

  it.each([
    ['an agent without id', { agents: [{ name: 'X', command: 'x' }] }],
    ['an agent without name', { agents: [{ id: 'x', command: 'x' }] }],
    ['an agent without command', { agents: [{ id: 'x', name: 'X' }] }],
    ['non-string args', { agents: [{ id: 'x', name: 'X', command: 'x', args: [1] }] }],
    ['non-string env values', { agents: [{ id: 'x', name: 'X', command: 'x', env: { A: 1 } }] }],
    ['a zero grace', { disposeGraceMs: 0 }],
    ['a zero EOF grace', { disposeEofGraceMs: 0 }],
    ['a zero cancel grace', { cancelGraceMs: 0 }],
    ['a zero start timeout', { startTimeoutMs: 0 }],
  ])('rejects %s', (_label, input) => {
    expect(validate(input).issues?.length).toBeGreaterThan(0)
  })

  it('does not start the plugin with an invalid config', async () => {
    const h = harness()
    const fiber = h.root.plugin(
      CliBridge,
      // Deliberately incomplete: the agent has no command.
      fake<Config>({ agents: [fake<CliAgentConfig>({ id: 'x', name: 'X' })] }),
    )
    await fiber.then(
      () => undefined,
      () => undefined,
    )
    expect(h.root.get('cliBridge')).toBeUndefined()
    expect(h.adapters).toEqual([])
    expect(h.tools).toEqual([])
    await fiber.dispose()
  })
})

describe('CliBridge wiring', () => {
  it('waits for every injected service before starting', async () => {
    const root = new Context()
    root.provide('llm', {
      registerAdapter: vi.fn(),
      listProviders: () => [],
      listModels: () => Promise.resolve([]),
      stream: vi.fn(),
    })
    root.provide('agents', { get: () => undefined })
    root.provide('subprocess', { spawn: vi.fn() })
    const fiber = root.plugin(CliBridge, BASE)
    expect(root.get('cliBridge')).toBeUndefined()
    const register = vi.fn(() => () => undefined)
    root.provide('tools', { register })
    await fiber
    expect(root.get('cliBridge')).toBeInstanceOf(CliBridge)
    expect(register).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })

  it('registers one adapter for every configured CLI route', async () => {
    const h = harness()
    await start(h, { agents: [FAKE, SILENT] })
    expect(h.root.get('cliBridge')).toBeInstanceOf(CliBridge)
    expect(h.adapters.map(({ providers }) => providers)).toEqual([['cli-fake', 'cli-silent']])
    const adapter = onlyAdapter(h)
    expect(adapter.providerInfo('cli-silent')).toEqual({ id: 'cli-silent', name: 'Silent CLI' })
    await expect(adapter.listModels('cli-fake')).resolves.toEqual([
      { provider: 'cli-fake', id: DEFAULT_MODEL_ID, name: 'Fake CLI' },
    ])
    await expect(adapter.resolveModel('cli-fake', 'x')).resolves.toMatchObject({ id: 'x', name: 'x' })
  })

  it('registers no adapter without CLIs, but still the mirror tool', async () => {
    const h = harness()
    await start(h, { agents: [] })
    expect(h.adapters).toEqual([])
    expect(onlyTool(h).definition.name).toBe(CLI_TOOL_NAME)
  })

  it('admits the mirror tool only for steps on a CLI route', async () => {
    const h = harness()
    await start(h)
    const { definition, options } = onlyTool(h)
    expect(definition.name).toBe(CLI_TOOL_NAME)
    const when = options?.when
    if (when === undefined) throw new Error('the tool must be conditional')
    const { agent } = addAgent(h)
    const step = (provider: string) =>
      when({ agent, modelSelection: { provider, model: DEFAULT_MODEL_ID }, signal: new AbortController().signal })
    expect(step('cli-fake')).toBe(true)
    expect(step('cli-other')).toBe(false)
    expect(step('deepseek')).toBe(false)
  })

  it('refuses the mirror tool for a session without a CLI', async () => {
    const h = harness()
    await start(h)
    const { agent } = addAgent(h)
    const exec = fake<ToolRunContext>({
      agent,
      callId: fake<ToolRunContext['callId']>('cli-1'),
      signal: AbortSignal.timeout(5_000),
    })
    await expect(onlyTool(h).definition.execute({ title: 't', kind: 'edit' }, exec)).rejects.toThrow(CLI_TOOL_NAME)
  })
})

describe('CliBridge routing and model listing', () => {
  it('selects the CLI a new agent preset stands for and lists its models', async () => {
    const h = harness()
    await start(h)
    const { agent, select } = addAgent(h, { preset: 'cli-fake' })
    await h.root.serial('agent/created', { agent, source: 'startup' })
    expect(select).toHaveBeenCalledWith({ provider: 'cli-fake', model: DEFAULT_MODEL_ID })
    await vi.waitFor(() => expect(h.modelUpdates).toEqual(['cli-fake']), WAIT)
    await expect(onlyAdapter(h).listModels('cli-fake')).resolves.toEqual([
      { provider: 'cli-fake', id: DEFAULT_MODEL_ID, name: 'Fake Small（默认）' },
      { provider: 'cli-fake', id: 'fake-large', name: 'Fake Large' },
    ])
    // The probe runs in a fixed directory under the harness home, started through ctx.subprocess.
    const probeDir = join(h.dshHome, 'ccgui', 'model-probe')
    expect(existsSync(probeDir)).toBe(true)
    expect(h.subprocess.spawned.map(({ spec }) => [spec.argv, spec.cwd])).toEqual([
      [[process.execPath, FAKE_AGENT], probeDir],
    ])
    expect(h.subprocess.spawned[0]?.spec).toMatchObject({ graceMs: 200 })
  })

  it('leaves an agent on a non-CLI preset alone and starts nothing', async () => {
    const h = harness()
    await start(h)
    const { agent, select } = addAgent(h, { preset: 'default' })
    await h.root.serial('agent/created', { agent, source: 'startup' })
    expect(select).not.toHaveBeenCalled()
    expect(h.subprocess.spawned).toEqual([])
  })

  it('probes under ~/.dsh when the harness provides no home path', async () => {
    const h = harness({ homePath: false })
    await start(h)
    const { agent } = addAgent(h, { preset: 'cli-fake' })
    await h.root.serial('agent/created', { agent, source: 'startup' })
    await vi.waitFor(() => expect(h.modelUpdates).toEqual(['cli-fake']), WAIT)
    const probeDir = join(home.dir, '.dsh', 'ccgui', 'model-probe')
    expect(existsSync(probeDir)).toBe(true)
    expect(h.subprocess.spawned[0]?.spec.cwd).toBe(probeDir)
  })

  it('routes again once a preset switch has been published', async () => {
    const h = harness()
    await start(h)
    const { agent, select } = addAgent(h, { preset: 'cli-fake' })
    h.root.emit('agent-preset/selected', agent.id, 'cli-fake')
    // Deferred to a microtask, because the switch is still being published.
    expect(select).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(select).toHaveBeenCalledWith({ provider: 'cli-fake', model: DEFAULT_MODEL_ID })
  })

  it('ignores a preset switch for a session that is already gone', async () => {
    const h = harness()
    await start(h)
    h.root.emit('agent-preset/selected', sid('missing'), 'cli-fake')
    await Promise.resolve()
    expect(warnings(h)).toEqual([])
    expect(h.subprocess.spawned).toEqual([])
  })

  it('logs instead of throwing when a preset switch cannot select the CLI', async () => {
    const h = harness()
    await start(h)
    const { agent, select } = addAgent(h, { preset: 'cli-fake' })
    select.mockImplementation(() => {
      throw new Error('busy')
    })
    h.root.emit('agent-preset/selected', agent.id, 'cli-fake')
    await Promise.resolve()
    expect(warnings(h)).toEqual(['ccgui: could not select the CLI for dsh-1: Error: busy'])
  })

  it('probes when the session log records a CLI model selection', async () => {
    const h = harness()
    await start(h)
    emitSessionEvent(h, 'dsh-1', { type: 'model/selection', data: { provider: 'cli-fake' } })
    await vi.waitFor(() => expect(h.modelUpdates).toEqual(['cli-fake']), WAIT)
  })

  it('warns when a CLI cannot be started to list its models', async () => {
    const h = harness()
    await start(h, { agents: [BROKEN] })
    emitSessionEvent(h, 'dsh-1', { type: 'model/selection', data: { provider: 'cli-broken' } })
    await vi.waitFor(() => expect(warnings(h)).toHaveLength(1), WAIT)
    expect(warnings(h)[0]).toMatch(/^ccgui: could not list models for cli-broken: /)
    expect(h.modelUpdates).toEqual([])
  })

  it('shows the models a previous run found before probing again', async () => {
    const h = harness()
    const first = await load(h)
    emitSessionEvent(h, 'dsh-1', { type: 'model/selection', data: { provider: 'cli-fake' } })
    await vi.waitFor(() => expect(h.modelUpdates).toEqual(['cli-fake']), WAIT)
    await vi.waitFor(() => expect(existsSync(join(h.dshHome, 'ccgui', 'models.json'))).toBe(true), WAIT)
    await first.dispose()
    await h.subprocess.allExited()
    h.adapters.length = 0
    await start(h)
    await vi.waitFor(() => expect(h.modelUpdates).toEqual(['cli-fake', 'cli-fake']), WAIT)
    await expect(onlyAdapter(h).listModels('cli-fake')).resolves.toHaveLength(2)
    expect(h.subprocess.spawned).toHaveLength(1)
  })

  it('warns and starts empty when the saved models cannot be read', async () => {
    const h = harness()
    mkdirSync(join(h.dshHome, 'ccgui', 'models.json'), { recursive: true })
    await start(h)
    await vi.waitFor(() => expect(warnings(h)).toHaveLength(1), WAIT)
    expect(warnings(h)[0]).toMatch(/^ccgui: could not read saved model lists: /)
    await expect(onlyAdapter(h).listModels('cli-fake')).resolves.toHaveLength(1)
  })

  it('drops an unfinished probe silently when the plugin is disposed', async () => {
    const h = harness()
    const fiber = await load(h, { agents: [SILENT] })
    emitSessionEvent(h, 'dsh-1', { type: 'model/selection', data: { provider: 'cli-silent' } })
    await vi.waitFor(() => expect(h.subprocess.spawned).toHaveLength(1), WAIT)
    await fiber.dispose()
    await h.subprocess.allExited()
    // Let the aborted probe settle before checking that it reported nothing.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(warnings(h)).toEqual([])
    expect(h.modelUpdates).toEqual([])
    expect(h.root.get('cliBridge')).toBeUndefined()
  })
})

describe('CliBridge auto-review routing', () => {
  // Reviewer calls arrive stamped with the main agent's CLI route. They must reach
  // a stateless model with the policy intact, never a `session/prompt` in the CLI.
  it('forwards the reviewer to the first non-CLI provider with its request intact', async () => {
    const h = harness()
    h.review.providers = ['cli-fake', 'deepseek']
    h.review.models = { deepseek: ['deepseek-chat'] }
    await start(h)
    const options = request({
      purpose: 'auto-review',
      system: 'REVIEW_POLICY',
      temperature: 0,
      messages: [user('m1', 'history')],
    })
    await expect(collect(onlyAdapter(h).stream(options))).resolves.toEqual([REVIEW_FINISH])
    expect(h.review.requests).toHaveLength(1)
    expect(h.review.requests[0]).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      system: 'REVIEW_POLICY',
      temperature: 0,
      purpose: 'auto-review',
    })
    expect(h.subprocess.spawned).toEqual([])
  })

  it('uses the configured review route instead of discovering one', async () => {
    const h = harness()
    h.review.providers = ['deepseek']
    h.review.models = { deepseek: ['deepseek-chat'] }
    await start(h, { reviewProvider: 'configured', reviewModel: 'reviewer' })
    const options = request({ purpose: 'auto-review' })
    await collect(onlyAdapter(h).stream(options))
    expect(h.review.requests[0]).toMatchObject({ provider: 'configured', model: 'reviewer' })
  })

  // A provider whose catalog cannot be read must not sink the whole discovery loop.
  it('skips a provider whose model catalog cannot be read', async () => {
    const h = harness()
    h.review.providers = ['cli-fake', 'broken', 'deepseek']
    h.review.models = { deepseek: ['deepseek-chat'] }
    h.review.failModels = ['broken']
    await start(h)
    const options = request({ purpose: 'auto-review' })
    await expect(collect(onlyAdapter(h).stream(options))).resolves.toEqual([REVIEW_FINISH])
    expect(h.review.requests[0]).toMatchObject({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(warnings(h).some((text) => text.includes('could not list models for broken'))).toBe(true)
    expect(h.subprocess.spawned).toEqual([])
  })

  it('reports a missing route when the configured provider cannot list models', async () => {
    const h = harness()
    h.review.failModels = ['configured']
    await start(h, { reviewProvider: 'configured' })
    const options = request({ purpose: 'auto-review' })
    await expect(collect(onlyAdapter(h).stream(options))).rejects.toMatchObject({
      code: 'UNSUPPORTED_OPTION',
      message: /审查模型/,
    })
    expect(warnings(h).some((text) => text.includes('could not list models for configured'))).toBe(true)
    expect(h.subprocess.spawned).toEqual([])
  })

  it('reports a missing review route instead of sending it to the CLI', async () => {
    const h = harness()
    await start(h)
    const options = request({ purpose: 'auto-review' })
    await expect(collect(onlyAdapter(h).stream(options))).rejects.toMatchObject({
      code: 'UNSUPPORTED_OPTION',
      message: /审查模型/,
    })
    expect(h.subprocess.spawned).toEqual([])
  })

  // A harness permission preset is not a CLI mode: the CLI still starts and runs its
  // own turn, and its native modes decide whether it asks for permission at all.
  it.each(['auto', 'danger-full-access'])('runs a CLI turn after a %s preset event', async (preset) => {
    const h = harness()
    h.review.providers = ['deepseek']
    h.review.models = { deepseek: ['deepseek-chat'] }
    await start(h)
    addAgent(h)
    emitSessionEvent(h, 'dsh-1', { type: 'permission/preset', data: { preset } })
    openTurn(h, 'dsh-1', ['m1'])
    await expect(collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))).resolves.toBeDefined()
    expect(h.subprocess.spawned).toHaveLength(1)
  })
})

describe('CliBridge sessions', () => {
  it('runs a turn on the CLI in the session directory, with the turn read from the log', async () => {
    const h = harness()
    await start(h)
    const cwd = mkdtempSync(join(tmpdir(), 'ccgui-cwd-'))
    addAgent(h, { cwd })
    openTurn(h, 'dsh-1', ['m1'])
    const chunks = await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))
    expect(textOf(chunks)).toBe('echo: hello')
    expect(h.subprocess.spawned.map(({ spec }) => [spec.argv, spec.cwd])).toEqual([
      [[process.execPath, FAKE_AGENT], cwd],
    ])
    expect(h.subprocess.spawned[0]?.spec).toMatchObject({ graceMs: 200 })
  })

  it('passes the configured environment to the CLI', async () => {
    const h = harness()
    await start(h, { agents: [{ ...FAKE, env: { CLI_TOKEN: 'secret' } }] })
    addAgent(h)
    openTurn(h, 'dsh-1', ['m1'])
    await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))
    expect(h.subprocess.spawned[0]?.spec.env).toMatchObject({ CLI_TOKEN: 'secret' })
  })

  it.runIf(process.platform !== 'win32')(
    'gives the CLI a PATH that keeps what the harness has, for a node found only by the shell',
    async () => {
      const h = harness()
      await start(h, { agents: [FAKE] })
      addAgent(h)
      openTurn(h, 'dsh-1', ['m1'])
      await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))
      const path = h.subprocess.spawned[0]?.spec.env?.PATH?.split(delimiter) ?? []
      expect(path).toEqual(expect.arrayContaining((process.env.PATH ?? '').split(delimiter).filter(Boolean)))
    },
  )

  it('keeps a PATH the CLI is configured with', async () => {
    const h = harness()
    await start(h, { agents: [{ ...FAKE, env: { PATH: '/configured' } }] })
    addAgent(h)
    openTurn(h, 'dsh-1', ['m1'])
    await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))
    expect(h.subprocess.spawned[0]?.spec.env?.PATH).toBe('/configured')
  })

  it('asks the approval service before the CLI may write, and mirrors the result', async () => {
    const h = harness()
    const approval = {
      request: vi.fn((_request: ApprovalRequest) => Promise.resolve('allowed-once' as const)),
    }
    h.root.provide('approval', approval)
    await start(h)
    const cwd = mkdtempSync(join(tmpdir(), 'ccgui-cwd-'))
    const { agent } = addAgent(h, { cwd })
    openTurn(h, 'dsh-1', ['m1'])
    const chunks = await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'WRITE out.txt')] })))
    const call = toolCallOf(chunks)
    expect(call.name).toBe(CLI_TOOL_NAME)
    const signal = AbortSignal.timeout(10_000)
    const exec = fake<ToolRunContext>({ agent, callId: fake<ToolRunContext['callId']>(call.id), signal })
    const result = await onlyTool(h).definition.execute(call.args, exec)
    expect(result).toEqual({
      text: 'Created out.txt',
      diffs: [{ path: join(cwd, 'out.txt'), oldText: null, newText: 'hi\n' }],
    })
    expect(approval.request).toHaveBeenCalledTimes(1)
    const [asked] = approval.request.mock.calls[0] ?? []
    expect(asked).toMatchObject({ agent, toolName: CLI_TOOL_NAME, callId: call.id })
    expect(asked?.reason).toContain(join(cwd, 'out.txt'))
    expect(asked?.signal).toBeInstanceOf(AbortSignal)
    expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('hi\n')
  })

  it('treats a missing approval service as unavailable and does not write', async () => {
    const h = harness()
    await start(h)
    const cwd = mkdtempSync(join(tmpdir(), 'ccgui-cwd-'))
    const { agent } = addAgent(h, { cwd })
    openTurn(h, 'dsh-1', ['m1'])
    const chunks = await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'WRITE out.txt')] })))
    const call = toolCallOf(chunks)
    const exec = fake<ToolRunContext>({
      agent,
      callId: fake<ToolRunContext['callId']>(call.id),
      signal: AbortSignal.timeout(10_000),
    })
    // Nobody could answer, so the CLI is told no and reports the call as failed.
    await expect(onlyTool(h).definition.execute(call.args, exec)).rejects.toThrow('rejected by user')
    expect(existsSync(join(cwd, 'out.txt'))).toBe(false)
  })

  it('stops the CLI when its agent is disposed', async () => {
    const h = harness()
    await start(h)
    const { agent } = addAgent(h)
    openTurn(h, 'dsh-1', ['m1'])
    await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] })))
    const [spawned] = h.subprocess.spawned
    if (spawned === undefined) throw new Error('no CLI started')
    h.root.emit('agent/disposed', { agent })
    await expect(spawned.done).resolves.toBeDefined()
    // A later step starts a fresh process rather than reusing the stopped one.
    openTurn(h, 'dsh-1', ['m2'])
    await collect(onlyAdapter(h).stream(request({ messages: [user('m2', 'again')] })))
    expect(h.subprocess.spawned).toHaveLength(2)
  })

  it('stops every CLI and withdraws the service when the plugin is disposed', async () => {
    const h = harness()
    const fiber = await load(h)
    addAgent(h, { id: 'dsh-1' })
    addAgent(h, { id: 'dsh-2' })
    for (const sessionId of ['dsh-1', 'dsh-2']) {
      openTurn(h, sessionId, [`${sessionId}-m`])
      await collect(
        onlyAdapter(h).stream(request({ sessionId: sid(sessionId), messages: [user(`${sessionId}-m`, 'hi')] })),
      )
    }
    expect(h.subprocess.spawned).toHaveLength(2)
    await fiber.dispose()
    const outcomes = await Promise.all(h.subprocess.spawned.map(({ done }) => done))
    expect(outcomes).toHaveLength(2)
    expect(h.root.get('cliBridge')).toBeUndefined()
    // Listeners went with the plugin: a later event starts nothing.
    const { agent } = addAgent(h, { id: 'dsh-3', preset: 'cli-fake' })
    await h.root.serial('agent/created', { agent, source: 'startup' })
    expect(h.subprocess.spawned).toHaveLength(2)
  })

  // The harness hot-reloads a plugin whose files changed; the running turns must say why they ended.
  it('tells a running turn that the plugin stopped', async () => {
    const h = harness()
    const fiber = await load(h)
    addAgent(h)
    openTurn(h, 'dsh-1', ['m1'])
    const turn = collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'HANG')] })))
    await vi.waitFor(() => expect(h.subprocess.spawned).toHaveLength(1), WAIT)
    await fiber.dispose()
    await expect(turn).rejects.toThrow('Fake CLI 已停止：dsh-ccgui 插件已停止或重新加载')
    await h.subprocess.allExited()
  })

  it('reports a CLI that fails to start as a start failure', async () => {
    const h = harness()
    await start(h, { agents: [BROKEN] })
    addAgent(h)
    openTurn(h, 'dsh-1', ['m1'])
    await expect(
      collect(onlyAdapter(h).stream(request({ provider: 'cli-broken', messages: [user('m1', 'hello')] }))),
    ).rejects.toMatchObject({ code: 'CLI_START_FAILED', message: /Broken CLI/ })
  })
})

const PTC_RUNTIME = { language: 'typescript', programFormat: 'function-body', timeout: { defaultMs: 1, maxMs: 9_000 } }

describe('CliBridge in PTC mode', () => {
  it('sends a CLI call as run_code and runs its mirror under the nested id', async () => {
    const h = harness()
    h.root.provide('approval', { request: () => Promise.resolve('allowed-once' as const) })
    h.root.provide('ptcRuntime', PTC_RUNTIME)
    await start(h)
    const cwd = mkdtempSync(join(tmpdir(), 'ccgui-cwd-'))
    const { agent } = addAgent(h, { cwd, preset: 'ptc' })
    openTurn(h, 'dsh-1', ['m1'])
    const chunks = await collect(onlyAdapter(h).stream(request({ messages: [user('m1', 'WRITE out.txt')] })))
    const call = toolCallOf(chunks)
    expect(call).toMatchObject({ name: 'run_code', args: { timeoutMs: 9_000 } })
    const exec = fake<ToolRunContext>({
      agent,
      callId: fake<ToolRunContext['callId']>(`${call.id}:ptc:1`),
      signal: AbortSignal.timeout(10_000),
    })
    // The arguments the program hands the mirror tool binding.
    const forwarded = /tools\.cli_tool\((.*)\)\)\.text$/s.exec(String(call.args.code))?.[1] ?? '{}'
    const result = onlyTool(h).definition.execute(JSON.parse(forwarded) as Record<string, unknown>, exec)
    await expect(result).resolves.toMatchObject({ text: 'Created out.txt' })
    expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('hi\n')
  })

  it('refuses without starting the CLI when the PTC runtime cannot run the program', async () => {
    const h = harness()
    h.root.provide('ptcRuntime', { ...PTC_RUNTIME, language: 'python' })
    await start(h)
    addAgent(h, { preset: 'ptc' })
    openTurn(h, 'dsh-1', ['m1'])
    const stream = onlyAdapter(h).stream(request({ messages: [user('m1', 'hello')] }))
    await expect(collect(stream)).rejects.toMatchObject({ code: 'CLI_WRONG_PRESET' })
    expect(h.subprocess.spawned).toEqual([])
  })
})

describe('CliBridge mode route', () => {
  interface Route {
    readonly kind: string
    readonly path: string
    handler(req: IncomingMessage, res: ServerResponse): Promise<void>
  }

  function requestOf(body: unknown): IncomingMessage {
    return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
      method: 'POST',
      headers: {},
      url: '/dsh-ccgui/modes',
    }) as unknown as IncomingMessage
  }

  function responseOf(): { res: ServerResponse; answer: () => Record<string, unknown> } {
    let body = ''
    const res = {
      writeHead: () => undefined,
      end: (chunk?: string) => {
        body = chunk ?? ''
      },
    } as unknown as ServerResponse
    return { res, answer: () => JSON.parse(body) as Record<string, unknown> }
  }

  it('serves the CLI mode route beside the git routes, and answers for a CLI with no modes yet', async () => {
    const h = harness()
    const routes: Route[] = []
    const dispose = vi.fn()
    const fiber = await load(h)
    h.root.provide('webServer', {
      register: (route: Route) => {
        routes.push(route)
        return dispose
      },
    })
    h.root.provide('connection', { requestRejection: () => undefined })
    await vi.waitFor(() => {
      expect(routes.map((route) => route.path)).toEqual(['/dsh-ccgui/git', '/dsh-ccgui/modes'])
    })
    const modes = routes[1] as Route

    const read = responseOf()
    await modes.handler(requestOf({ sessionId: 'dsh-1', provider: 'cli-fake' }), read.res)
    expect(read.answer()).toEqual({ success: true, data: { modes: null, pending: null } })

    const write = responseOf()
    await modes.handler(requestOf({ sessionId: 'dsh-1', provider: 'cli-fake', mode: 'plan' }), write.res)
    expect(write.answer()).toEqual({ success: true, data: { modes: null, pending: 'plan' } })

    await fiber.dispose()
    expect(dispose).toHaveBeenCalled()
  })
})

describe('CliBridge git routes', () => {
  it('registers the git routes once the web server and connection are up, and drops them on dispose', async () => {
    const h = harness()
    const dispose = vi.fn()
    const register = vi.fn((_route: { kind: string; path: string }) => dispose)
    const fiber = await load(h)
    expect(register).not.toHaveBeenCalled()
    h.root.provide('webServer', { register })
    h.root.provide('connection', { requestRejection: () => undefined })
    await vi.waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prefix', path: '/dsh-ccgui/git' }))
    })
    await fiber.dispose()
    expect(dispose).toHaveBeenCalled()
  })
})
