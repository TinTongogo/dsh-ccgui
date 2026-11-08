/**
 * The body of the mirror tool: wait for the CLI's result of one call, answering the
 * CLI's permission requests along the way.
 * @module dsh-ccgui/session/drive-tool
 */

import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { abortable } from '../abortable.ts'
import { permissionResponse } from '../permission.ts'
import { isFinished, permissionReason, toolOutcome } from '../tool-record.ts'
import type { ToolOutcome, ToolRecord } from '../tool-record.ts'
import type { PendingPermission, PermissionQueue } from './permission-queue.ts'
import type { ToolMirror } from './tool-mirror.ts'

/** A question for the harness about a blocked CLI call. */
export interface PermissionAsk {
  /** What the person deciding needs to know. */
  readonly reason: string
  /** The call's id in the harness log; absent when the call has no card to attach to yet. */
  readonly callId?: string
}

/** Asks the harness whether a blocked CLI call may proceed. */
export type AskPermission = (request: PermissionAsk, signal: AbortSignal) => Promise<ApprovalOutcome>

/** The session state a mirror works against. */
export interface DriveContext {
  readonly tools: ToolMirror
  readonly permissions: PermissionQueue
  /** CLI display name used in user-facing messages. */
  readonly label: string
  /** Aborted when the current CLI turn ends, which withdraws any question still on screen. */
  readonly turnSignal: () => AbortSignal
}

/** One mirrored call. */
export interface DrivenCall {
  readonly acpId: string
  readonly callId: string
}

/**
 * Wait until the call finishes. Every open permission request is answered, not only the
 * call's own: a parent call can be waiting on a child whose mirror cannot start until
 * this one returns.
 * @returns the finished call's outcome.
 */
export async function driveTool(
  context: DriveContext,
  { acpId, callId }: DrivenCall,
  ask: AskPermission,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  for (;;) {
    signal.throwIfAborted()
    const permission = context.permissions.takeNext()
    if (permission !== undefined) {
      const ownCallId = permission.acpId === acpId ? callId : undefined
      await answerPermission(context, permission, { callId: ownCallId, ask, signal })
      continue
    }
    const record = context.tools.get(acpId) as ToolRecord
    if (isFinished(record)) return toolOutcome(record)
    await abortable(context.tools.nextChange(), signal)
  }
}

interface Asking {
  /** The call's id in the harness log when the request is the mirrored call's own. */
  readonly callId: string | undefined
  readonly ask: AskPermission
  readonly signal: AbortSignal
}

async function answerPermission(
  { tools, label, turnSignal }: DriveContext,
  permission: PendingPermission,
  { callId, ask, signal }: Asking,
): Promise<void> {
  const record = tools.get(permission.acpId)
  const reason = record === undefined ? `${label} 请求执行一个操作。` : permissionReason(record)
  const askSignal = AbortSignal.any([signal, turnSignal()])
  // A failing approval service must not leave the CLI blocked; `unavailable` rejects.
  const outcome = await ask({ reason, ...(callId === undefined ? {} : { callId }) }, askSignal).catch(
    (): ApprovalOutcome => 'unavailable',
  )
  permission.resolve(permissionResponse(outcome, permission.options))
}
