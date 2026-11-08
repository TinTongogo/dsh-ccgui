/**
 * CLI turns for one session: prompts waiting their turn, the turn in flight, and
 * cancelling it. Only one turn runs at a time; steering sent mid-turn waits here and
 * runs as the next turn.
 * @module dsh-ccgui/session/turn-queue
 */

import type { ContentBlock as AcpContentBlock, StopReason } from '@agentclientprotocol/sdk'
import type { AcpTransport } from '../transport.ts'

/** How a CLI turn ended. */
export type TurnEnd =
  { readonly type: 'turn-end'; readonly stopReason: StopReason } | { readonly type: 'failure'; readonly error: Error }

/** User input waiting to be sent as a CLI turn. */
export interface QueuedPrompt {
  readonly ids: readonly string[]
  readonly blocks: readonly AcpContentBlock[]
}

/** Where a turn is sent. */
interface TurnTarget {
  readonly transport: AcpTransport
  readonly acpSessionId: string
}

/** What the queue needs from its session. */
export interface TurnHooks {
  /** @returns where to send a turn, or undefined while the session cannot take one. */
  readonly target: () => TurnTarget | undefined
  /** A prompt is going out; its messages now count as sent. */
  readonly onSend: (prompt: QueuedPrompt) => void
  /** A turn ended. A cancelled turn is not reported to the reader, who already left it. */
  readonly onEnd: (event: TurnEnd, wasCancelling: boolean) => void
  /** A cancelled CLI did not finish its turn within the grace period. */
  readonly onCancelTimeout: () => void
  /** How long a cancelled CLI may take to finish its turn before it is abandoned. */
  readonly cancelGraceMs: number
}

/** The turn state machine of one CLI session. */
export class TurnQueue {
  private pending: readonly QueuedPrompt[] = []
  private running = false
  private stopping = false
  private ended = Promise.withResolvers<void>()
  /** Aborted when the CLI turn ends, which withdraws any question still on screen. */
  private lifetime = new AbortController()
  private cancelTimer: NodeJS.Timeout | undefined

  constructor(private readonly hooks: TurnHooks) {}

  /** Whether a CLI turn is in flight. */
  get active(): boolean {
    return this.running
  }

  /** Whether the turn in flight has been asked to stop. */
  get cancelling(): boolean {
    return this.stopping
  }

  /** Whether a turn is running or waiting. */
  get busy(): boolean {
    return this.running || this.pending.length > 0
  }

  /** Ids of the user messages queued but not sent yet. */
  get queuedIds(): readonly string[] {
    return this.pending.flatMap((prompt) => prompt.ids)
  }

  /** Aborted when the current turn ends. */
  get signal(): AbortSignal {
    return this.lifetime.signal
  }

  /** @returns a promise that settles when the current turn ends. */
  untilEnded(): Promise<void> {
    return this.ended.promise
  }

  enqueue(prompt: QueuedPrompt): void {
    this.pending = [...this.pending, prompt]
    this.pump()
  }

  clearPending(): void {
    this.pending = []
  }

  /** Withdraw anything still asked within the current turn. */
  abortLifetime(): void {
    this.lifetime.abort()
  }

  /**
   * Ask the CLI to stop the turn in flight.
   * @param sendCancel - sends `session/cancel` to the CLI.
   */
  beginCancel(sendCancel: () => void): void {
    this.stopping = true
    sendCancel()
    // A CLI that ignores session/cancel would block every later prompt and may keep
    // changing files, so it is stopped outright once the grace period ends.
    this.cancelTimer = setTimeout(() => {
      this.hooks.onCancelTimeout()
    }, this.hooks.cancelGraceMs)
    this.cancelTimer.unref()
  }

  end(event: TurnEnd): void {
    if (!this.running) return
    this.running = false
    clearTimeout(this.cancelTimer)
    const wasCancelling = this.stopping
    this.stopping = false
    this.lifetime.abort()
    this.hooks.onEnd(event, wasCancelling)
    this.ended.resolve()
    this.pump()
  }

  /** Send the next queued prompt if no turn is running and the session can take one. */
  pump(): void {
    if (this.running) return
    const target = this.hooks.target()
    if (target === undefined) return
    const [next, ...rest] = this.pending
    if (next === undefined) return
    this.pending = rest
    this.hooks.onSend(next)
    this.running = true
    this.ended = Promise.withResolvers<void>()
    this.lifetime = new AbortController()
    target.transport.prompt(target.acpSessionId, next.blocks).then(
      (stopReason) => {
        this.end({ type: 'turn-end', stopReason })
      },
      (error: unknown) => {
        this.end({ type: 'failure', error: error instanceof Error ? error : new Error(String(error)) })
      },
    )
  }
}
