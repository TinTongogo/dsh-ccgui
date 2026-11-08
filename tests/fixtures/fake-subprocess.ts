import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** One JSON-RPC message as it crossed the pipe. */
interface RpcMessage {
  readonly id?: number | string
  readonly method?: string
  readonly params?: unknown
}

/** What the scripted agent sends back for one request; `undefined` leaves it unanswered. */
type RpcReply = { readonly result: unknown } | { readonly error: { code: number; message: string } } | undefined

type Responder = (message: RpcMessage) => RpcReply

export interface FakeSubprocessOptions {
  /** Drop a piped stream, as a broken seam implementation would. */
  readonly omit?: 'stdin' | 'stdout'
  /** Whether the child exits by itself once its stdin ends. */
  readonly exitOnEof?: boolean
  /** Make the first `waitForExit` call throw, as a seam that lost track of its range would. */
  readonly failFirstWait?: boolean
  readonly respond?: Responder
}

const DEFAULT_RESULTS: Readonly<Record<string, unknown>> = {
  initialize: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] },
  'session/new': { sessionId: 'fake-1' },
  'session/prompt': { stopReason: 'end_turn' },
}

const defaultResponder: Responder = (message) => ({ result: DEFAULT_RESULTS[message.method ?? ''] ?? {} })

const KILLED: SubprocessOutcome = { exitCode: null, signal: 'SIGKILL' }
const CLEAN_EXIT: SubprocessOutcome = { exitCode: 0, signal: null }

/**
 * In-process stand-in for the harness subprocess seam. The "child" is a scripted
 * ACP agent on a pair of PassThrough pipes, so tests can see exactly what crossed
 * the wire and how teardown was driven.
 */
export class FakeSubprocess {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly received: RpcMessage[] = []
  readonly waitSignals: (AbortSignal | undefined)[] = []
  terminations = 0
  spec: SubprocessSpawnSpec | undefined
  private readonly outcome = Promise.withResolvers<SubprocessOutcome>()
  private settled = false
  private waits = 0

  constructor(private readonly options: FakeSubprocessOptions = {}) {
    const respond = options.respond ?? defaultResponder
    createInterface({ input: this.stdin })
      .on('error', () => {
        // readline re-emits stdin errors; the transport under test owns their handling.
      })
      .on('line', (line) => {
        const message = JSON.parse(line) as RpcMessage
        this.received.push(message)
        if (message.id === undefined || message.method === undefined) return
        const reply = respond(message)
        if (reply !== undefined) this.send({ id: message.id, ...reply })
      })
    if (options.exitOnEof === true) {
      this.stdin.on('finish', () => {
        this.exitWith(CLEAN_EXIT)
      })
    }
  }

  /** The `spawn` function to hand to the transport. */
  readonly spawn = (spec: SubprocessSpawnSpec): SubprocessHandle => {
    this.spec = spec
    return {
      stdin: this.options.omit === 'stdin' ? undefined : this.stdin,
      stdout: this.options.omit === 'stdout' ? undefined : this.stdout,
      stderr: undefined,
      control: undefined,
      collected: {},
      done: this.outcome.promise,
      terminate: () => {
        this.terminations += 1
        this.exitWith(KILLED)
      },
      waitForExit: (signal) => this.waitForExit(signal),
    }
  }

  /** Report the exit through `done`, then close stdout as a real pipe would. */
  exitWith(outcome: SubprocessOutcome): void {
    if (this.settled) return
    this.settled = true
    this.outcome.resolve(outcome)
    this.stdout.end()
  }

  /** Make `done` reject, as the seam does for a command that cannot start. */
  fail(error: unknown): void {
    if (this.settled) return
    this.settled = true
    this.outcome.reject(error)
  }

  private send(message: object): void {
    this.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }

  private async waitForExit(signal?: AbortSignal): Promise<boolean> {
    this.waitSignals.push(signal)
    this.waits += 1
    if (this.options.failFirstWait === true && this.waits === 1) throw new Error('range lost')
    const aborted = new Promise<boolean>((resolve) => {
      signal?.addEventListener(
        'abort',
        () => {
          resolve(false)
        },
        { once: true },
      )
    })
    const exited = this.outcome.promise.then(
      () => true,
      () => true,
    )
    return Promise.race([exited, aborted])
  }
}
