/**
 * Host plugin: registers each configured CLI as a model provider and wires the
 * session registry to the harness.
 * @module dsh-ccgui
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { CliBridgeAdapter } from './adapter.ts'
import { CliSession } from './cli-session.ts'
import type { PermissionAsk } from './cli-session.ts'
import { createCliTool } from './cli-tool.ts'
import { CLI_TOOL_NAME, cliRoute } from './constants.ts'
import { ModelCacheFile } from './model-cache.ts'
import { CliModelCatalog } from './model-catalog.ts'
import type { CliModelList } from './model-options.ts'
import type { ImageRef } from './prompt-images.ts'
import { probeModels } from './model-probe.ts'
import { npxCacheDir, startFromNpxCache } from './npx-cache.ts'
import { gitHandler, registerGitRoutes } from './git/git-routes.ts'
import type { GitConnection, GitWebServer } from './git/git-routes.ts'
import { CliSessionRegistry } from './session-registry.ts'
import type { CliAgentConfig, SessionStart } from './session-registry.ts'
import { openStdioTransport } from './stdio-transport.ts'
import type { AcpTransport, TransportHandlers } from './transport.ts'

export type { CliAgentConfig } from './session-registry.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    cliBridge: CliBridge
    /** Provided by the harness's boot layer. */
    dshHomePath?: (...segments: string[]) => string
    /**
     * The harness's attachment store (`@deepseek-ai/dsh-attachment`), narrowed to the one
     * call this plugin makes so the package does not have to depend on it.
     */
    attachments?: { readImage(ref: ImageRef, signal?: AbortSignal): Promise<{ data: Uint8Array }> }
    /** The harness's web server and its trust check, narrowed to what the git routes use. */
    webServer: GitWebServer
    connection: GitConnection
  }
}

/**
 * Shown to turns cut off when this plugin stops. Besides shutdown, the harness restarts a
 * plugin whose files changed, which takes every CLI it started down with it.
 */
const PLUGIN_STOPPED_REASON = 'dsh-ccgui 插件已停止或重新加载（例如插件更新后），这条回复没有完成，请重新发送。'
const PLUGIN_HOME = 'ccgui'
const MODEL_CACHE_FILE = 'models.json'
const MODEL_PROBE_DIR = 'model-probe'

/** Plugin configuration. */
export interface Config {
  agents: CliAgentConfig[]
  /** Signal-escalation grace when stopping a CLI, in milliseconds. */
  disposeGraceMs: number
  /** Time after stdin EOF for a CLI to exit by itself, in milliseconds. */
  disposeEofGraceMs: number
  /** Time a cancelled CLI may take to end its turn before it is abandoned, in milliseconds. */
  cancelGraceMs: number
  /** Time a CLI may take to start and accept a session, which must allow for a cold `npx` download. */
  startTimeoutMs: number
}

/** Service behind `ctx.cliBridge`. */
export default class CliBridge extends Service {
  static inject = ['llm', 'agents', 'subprocess', 'tools']

  static Config: z<Config> = z.object({
    agents: z
      .array(
        z.object({
          id: z.string().required(),
          name: z.string().required(),
          command: z.string().required(),
          args: z.array(z.string()).default([]),
          env: z.dict(z.string()).default({}),
        }),
      )
      .default([]),
    disposeGraceMs: z.number().min(1).default(3_000),
    disposeEofGraceMs: z.number().min(1).default(6_000),
    cancelGraceMs: z.number().min(1).default(10_000),
    startTimeoutMs: z.number().min(1).default(120_000),
  })

  private readonly registry: CliSessionRegistry
  private readonly catalog: CliModelCatalog
  /** Ends any model probe still running when this plugin goes away. */
  private readonly probes = new AbortController()

  constructor(
    ctx: Context,
    private readonly config: Config,
  ) {
    super(ctx, 'cliBridge')
    this.registry = new CliSessionRegistry(config.agents, {
      getAgent: (sessionId) => ctx.agents.get(sessionId as SessionId),
      composedPreset: (agent) => ctx.get('agentPresets')?.composedPreset(agent.ctx),
      ask: (agent, request, signal) => this.ask(agent, request, signal),
      warn: (message) => ctx.logger.warn(message),
      onCliSelected: (provider) => this.catalog.ensureListed(provider),
      createSession: (agent, sessionId, cwd, start) => this.createSession(agent, sessionId, cwd, start),
    })
    const modelCache = new ModelCacheFile(this.homePath(PLUGIN_HOME, MODEL_CACHE_FILE))
    this.catalog = new CliModelCatalog({
      labelFor: (provider) => this.registry.labelFor(provider),
      probe: (provider) => this.probeProvider(provider),
      onUpdated: (provider) => {
        ctx.emit('llm/models-updated', provider)
      },
      warn: (message) => ctx.logger.warn(message),
      save: (lists) => modelCache.save(lists),
    })
    this.restoreModels(modelCache)
    this.registerRoutes()
    this.followSessions()
    this.serveGit()
  }

  /** Read in the background: the menu works without it, and fills in once it arrives. */
  private restoreModels(modelCache: ModelCacheFile): void {
    const { ctx, catalog, probes } = this
    modelCache
      .read()
      .then((lists) => {
        if (!probes.signal.aborted) catalog.restore(lists)
      })
      .catch((error: unknown) => {
        ctx.logger.warn(`ccgui: could not read saved model lists: ${String(error)}`)
      })
  }

  /** The harness's home, or `~/.dsh` when it does not say. */
  private homePath(...segments: string[]): string {
    const resolveHome = this.ctx.get('dshHomePath') ?? ((...parts: string[]) => join(homedir(), '.dsh', ...parts))
    return resolveHome(...segments)
  }

  /**
   * The 变更 panel's git routes. Taken as optional dependencies: a harness without a web
   * server (a headless run) still gets the CLIs, just not the panel's backend.
   */
  private serveGit(): void {
    this.ctx.inject(['webServer', 'connection'], (child) => {
      const handler = gitHandler(
        (spec) => child.subprocess.spawn(spec),
        child.connection,
        (message) => child.logger.warn(message),
      )
      child.effect(() => registerGitRoutes(child.webServer, handler), 'ccgui: git routes')
    })
  }

  private registerRoutes(): void {
    const { ctx, registry, catalog } = this
    if (registry.providers.length > 0) {
      ctx.llm.registerAdapter(
        [...registry.providers],
        new CliBridgeAdapter({
          labelFor: (provider) => registry.labelFor(provider),
          resolveSession: (provider, sessionId) => registry.resolveSession(provider, sessionId),
          currentTurnMessageIds: (sessionId) => registry.currentTurnMessageIds(sessionId),
          modelsFor: (provider) => catalog.listModels(provider),
          modelName: (provider, model) => catalog.modelName(provider, model),
        }),
      )
    }
    // Admitted only for steps a CLI runs, so no other model ever sees this tool, and a
    // CLI works from any mode without its calls needing a preset of their own.
    ctx.tools.register(createCliTool({ waitForTool: (exec) => registry.waitForTool(exec) }), {
      when: ({ modelSelection }) => registry.isCliRoute(modelSelection.provider),
    })
  }

  private followSessions(): void {
    const { ctx, registry, probes } = this
    ctx.on('agent/created', ({ agent }) => {
      registry.routeAgent(agent)
      return undefined
    })
    // The Web client creates a session under the default preset and switches it
    // afterwards, so `agent/created` alone would miss the preset the user chose.
    // This event fires while the session is still publishing the preset change,
    // which rejects a nested append; the microtask runs just after, and still
    // before the first turn because the switch has not returned to its caller.
    ctx.on('agent-preset/selected', (sessionId) => {
      queueMicrotask(() => {
        const agent = ctx.agents.get(sessionId)
        if (agent === undefined) return
        try {
          registry.routeAgent(agent)
        } catch (error: unknown) {
          ctx.logger.warn(`ccgui: could not select the CLI for ${sessionId}: ${String(error)}`)
        }
      })
    })
    ctx.on('session/event', (session, event) => registry.observeEvent(session.id, event))
    ctx.on('agent/disposed', ({ agent }) => registry.disposeSession(agent.id))
    ctx.effect(
      () => () => {
        probes.abort()
        registry.disposeAll(PLUGIN_STOPPED_REASON)
      },
      'cliBridge.sessions()',
    )
  }

  private ask(agent: Agent, { reason, callId }: PermissionAsk, signal: AbortSignal): Promise<ApprovalOutcome> {
    const approval = this.ctx.get('approval')
    if (approval === undefined) return Promise.resolve('unavailable')
    return approval.request({
      agent,
      toolName: CLI_TOOL_NAME,
      reason,
      signal,
      ...(callId === undefined ? {} : { callId: callId as ToolRunContext['callId'] }),
    })
  }

  private openTransport(agent: CliAgentConfig, cwd: string, handlers: TransportHandlers): AcpTransport {
    const { argv, env } = startFromNpxCache(
      { argv: [agent.command, ...agent.args], env: agent.env },
      {
        npxCache: npxCacheDir(process.env, homedir(), process.platform),
        path: process.env.PATH,
      },
    )
    return openStdioTransport(
      {
        argv,
        cwd,
        env,
        graceMs: this.config.disposeGraceMs,
        eofGraceMs: this.config.disposeEofGraceMs,
        spawn: (spec) => this.ctx.subprocess.spawn(spec),
      },
      handlers,
    )
  }

  /**
   * The temporary session goes in a directory of its own, away from the user's projects.
   * Some CLIs keep a folder per working directory even for a deleted session, so this one
   * never changes: a new directory on every start would add a folder each time. It is under
   * the harness's home rather than the system temp directory, where on a shared machine
   * another user could plant a project config at a predictable path for a CLI to load.
   */
  private async probeProvider(provider: string): Promise<CliModelList | undefined> {
    const agent = this.registry.configFor(provider)
    if (agent === undefined) return undefined
    const { signal } = this.probes
    const cwd = this.homePath(PLUGIN_HOME, MODEL_PROBE_DIR)
    await mkdir(cwd, { recursive: true })
    try {
      return await probeModels(
        (handlers) => this.openTransport(agent, cwd, handlers),
        cwd,
        this.config.startTimeoutMs,
        signal,
      )
    } catch (error: unknown) {
      if (signal.aborted) return undefined
      throw error
    }
  }

  /** Looked up on each read: the attachment service can come and go while the plugin runs. */
  private async readImage(ref: ImageRef, signal?: AbortSignal): Promise<Uint8Array> {
    const attachments = this.ctx.get('attachments')
    if (attachments === undefined) throw new Error('attachment service is not available')
    const { data } = await attachments.readImage(ref, signal)
    return data
  }

  private createSession(agent: CliAgentConfig, sessionId: string, cwd: string, start: SessionStart): CliSession {
    const provider = cliRoute(agent.id)
    return new CliSession({
      dshSessionId: sessionId,
      provider,
      cwd,
      label: agent.name,
      sentMessageIds: start.sentMessageIds,
      after: start.after,
      cancelGraceMs: this.config.cancelGraceMs,
      startTimeoutMs: this.config.startTimeoutMs,
      knownModels: () => this.catalog.known(provider),
      readImage: (ref, signal) => this.readImage(ref, signal),
      onError: (error) => this.ctx.logger.warn(`ccgui: ${agent.name}: ${String(error)}`),
      openTransport: (handlers) => this.openTransport(agent, cwd, handlers),
    })
  }
}
