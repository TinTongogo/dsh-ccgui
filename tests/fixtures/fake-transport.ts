import type {
  AgentCapabilities,
  ContentBlock,
  InitializeResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionConfigOption,
  SessionUpdate,
  StopReason,
} from '@agentclientprotocol/sdk'
import type { AcpTransport, SessionInfo, TransportHandlers } from '../../src/transport.ts'

/** Script for one `session/prompt`: drive the fake, then return the stop reason. */
export type PromptScript = (fake: FakeTransport) => Promise<StopReason> | StopReason

/** In-memory transport whose prompts are driven by per-test scripts. */
export class FakeTransport implements AcpTransport {
  readonly prompts: (readonly ContentBlock[])[] = []
  readonly promptSessions: string[] = []
  readonly cancelled: string[] = []
  readonly newSessions: string[] = []
  readonly resumed: string[] = []
  readonly loaded: string[] = []
  readonly permissionAnswers: RequestPermissionResponse[] = []
  scripts: PromptScript[] = []
  capabilities: AgentCapabilities = {}
  initializeError: Error | undefined
  resumeError: Error | undefined
  loadReplay: readonly SessionUpdate[] = []
  disposed = false
  disposedForcefully = false
  configOptions: readonly SessionConfigOption[] | undefined
  readonly setConfigCalls: { sessionId: string; configId: string; value: string }[] = []
  setConfigError: Error | undefined
  setConfigResult: readonly SessionConfigOption[] | undefined
  readonly operations: string[] = []
  readonly deletedSessions: string[] = []
  readonly closedSessions: string[] = []
  discardError: Error | undefined
  private handlers!: TransportHandlers
  private abortPrompt: ((error: Error) => void) | undefined

  /**
   * Bind the session's callbacks.
   * @param handlers - callbacks supplied by the session.
   * @returns this transport.
   */
  attach(handlers: TransportHandlers): this {
    this.handlers = handlers
    return this
  }

  initialize(): Promise<InitializeResponse> {
    if (this.initializeError !== undefined) return Promise.reject(this.initializeError)
    return Promise.resolve({ protocolVersion: 1, agentCapabilities: this.capabilities })
  }

  newSession(cwd: string): Promise<SessionInfo> {
    this.newSessions.push(cwd)
    return Promise.resolve({ sessionId: `acp-${this.newSessions.length}`, configOptions: this.configOptions })
  }

  resumeSession(sessionId: string): Promise<readonly SessionConfigOption[] | undefined> {
    this.resumed.push(sessionId)
    return this.resumeError === undefined ? Promise.resolve(this.configOptions) : Promise.reject(this.resumeError)
  }

  async loadSession(sessionId: string): Promise<readonly SessionConfigOption[] | undefined> {
    this.loaded.push(sessionId)
    for (const update of this.loadReplay) this.handlers.onUpdate(update)
    await Promise.resolve()
    return this.configOptions
  }

  setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<readonly SessionConfigOption[] | undefined> {
    this.operations.push(`set:${value}`)
    this.setConfigCalls.push({ sessionId, configId, value })
    return this.setConfigError === undefined
      ? Promise.resolve(this.setConfigResult)
      : Promise.reject(this.setConfigError)
  }

  deleteSession(sessionId: string): Promise<void> {
    this.deletedSessions.push(sessionId)
    return this.discardError === undefined ? Promise.resolve() : Promise.reject(this.discardError)
  }

  closeSession(sessionId: string): Promise<void> {
    this.closedSessions.push(sessionId)
    return this.discardError === undefined ? Promise.resolve() : Promise.reject(this.discardError)
  }

  prompt(sessionId: string, blocks: readonly ContentBlock[]): Promise<StopReason> {
    this.operations.push('prompt')
    this.promptSessions.push(sessionId)
    this.prompts.push(blocks)
    const [script, ...rest] = this.scripts
    this.scripts = rest
    if (script === undefined) throw new Error('FakeTransport: no script for this prompt')
    return new Promise<StopReason>((resolve, reject) => {
      this.abortPrompt = reject
      void Promise.resolve()
        .then(() => script(this))
        .then(resolve, reject)
    })
  }

  cancel(sessionId: string): void {
    this.cancelled.push(sessionId)
  }

  dispose(force = false): Promise<void> {
    this.disposed = true
    this.disposedForcefully ||= force
    this.abortPrompt?.(new Error('transport disposed'))
    return Promise.resolve()
  }

  /**
   * Send one `session/update` to the session.
   * @param update - the update.
   */
  update(update: SessionUpdate): void {
    this.handlers.onUpdate(update)
  }

  /**
   * Send `session/request_permission` and record the answer.
   * @param request - the fields that matter to the test.
   * @returns the answer.
   */
  async askPermission(
    request: Pick<RequestPermissionRequest, 'toolCall' | 'options'>,
  ): Promise<RequestPermissionResponse> {
    const answer = await this.handlers.onPermission({ sessionId: 'acp-1', ...request })
    this.permissionAnswers.push(answer)
    return answer
  }

  /**
   * Report that the process or connection went away.
   * @param error - why.
   */
  close(error: Error): void {
    this.abortPrompt?.(error)
    this.handlers.onClosed(error)
  }
}
