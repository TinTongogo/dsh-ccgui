/**
 * Opening the ACP connection to a CLI and getting a session on it: a new one, or the
 * native session an earlier process left behind.
 * @module dsh-ccgui/session/connect
 */

import type { AcpTransport, TransportHandlers } from '../transport.ts'
import type { ModelState } from './model-state.ts'

const MS_PER_SECOND = 1000

/** What opening a session needs. */
export interface OpenSessionRequest {
  readonly openTransport: (handlers: TransportHandlers) => AcpTransport
  readonly handlers: TransportHandlers
  readonly cwd: string
  /** The CLI's own session for this conversation, when an earlier process left one. */
  readonly nativeSessionId: string | undefined
  readonly model: ModelState
  /** Told as soon as the transport exists, so a stop during startup can still close it. */
  readonly onTransport: (transport: AcpTransport) => void
  /** Receives a failed reattach, which falls back to a new session rather than failing. */
  readonly onError?: ((error: unknown) => void) | undefined
}

/** The session the CLI is working in. */
export interface OpenedSession {
  readonly acpSessionId: string
  /** The native session could not be continued, so the CLI starts without the conversation. */
  readonly reattachFailed: boolean
  /** The CLI takes image blocks in a prompt. */
  readonly acceptsImages: boolean
}

type Attached = Omit<OpenedSession, 'acceptsImages'>

/**
 * Connect to the CLI and open or continue its session.
 * @param request - transport factory, handlers and what to continue.
 * @returns the session and whether continuing it failed.
 */
export async function openSession(request: OpenSessionRequest): Promise<OpenedSession> {
  const { openTransport, handlers, cwd, nativeSessionId, model, onTransport } = request
  const transport = openTransport(handlers)
  onTransport(transport)
  const { agentCapabilities } = await transport.initialize()
  const acceptsImages = agentCapabilities?.promptCapabilities?.image === true
  if (nativeSessionId === undefined) {
    const { sessionId, configOptions } = await transport.newSession(cwd)
    model.adopt(configOptions, true)
    return { acpSessionId: sessionId, reattachFailed: false, acceptsImages }
  }
  const attached = await reattach(request, transport, nativeSessionId, {
    resume: agentCapabilities?.sessionCapabilities?.resume != null,
    load: agentCapabilities?.loadSession === true,
  })
  return { ...attached, acceptsImages }
}

async function reattach(
  { cwd, model, onError }: OpenSessionRequest,
  transport: AcpTransport,
  sessionId: string,
  can: { readonly resume: boolean; readonly load: boolean },
): Promise<Attached> {
  try {
    if (can.resume) {
      model.adopt(await transport.resumeSession(sessionId, cwd), false)
      return { acpSessionId: sessionId, reattachFailed: false }
    }
    if (can.load) {
      // session/load replays the conversation as updates. No turn is active yet,
      // so the update handler drops them; the harness already has that history.
      model.adopt(await transport.loadSession(sessionId, cwd), false)
      return { acpSessionId: sessionId, reattachFailed: false }
    }
  } catch (error: unknown) {
    onError?.(error)
  }
  const { sessionId: fresh, configOptions } = await transport.newSession(cwd)
  model.adopt(configOptions, true)
  return { acpSessionId: fresh, reattachFailed: true }
}

/**
 * A stalled `npx` or a CLI waiting for a login would otherwise hang every later message too.
 * @param work - the startup to bound.
 * @param timeoutMs - how long it may take.
 * @returns the startup, rejected with a readable reason once the time is up.
 */
export async function withinStartTimeout(work: () => Promise<void>, timeoutMs: number): Promise<void> {
  const { promise: timedOut, reject } = Promise.withResolvers<never>()
  const seconds = Math.ceil(timeoutMs / MS_PER_SECOND)
  const timer = setTimeout(() => {
    reject(new Error(`等了 ${seconds} 秒没有响应`))
  }, timeoutMs)
  timer.unref()
  try {
    await Promise.race([work(), timedOut])
  } finally {
    clearTimeout(timer)
  }
}
