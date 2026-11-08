/**
 * Permission requests from the CLI that are still waiting for an answer.
 * @module dsh-ccgui/session/permission-queue
 */

import type { PermissionOption, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import { CANCELLED, permissionResponse } from '../permission.ts'

export { CANCELLED }

/** One CLI request blocked on a decision. */
export interface PendingPermission {
  readonly acpId: string
  readonly options: readonly PermissionOption[]
  readonly resolve: (response: RequestPermissionResponse) => void
}

/** Open permission requests, answered in the order the CLI asked. */
export class PermissionQueue {
  private open: readonly PendingPermission[] = []

  add(permission: PendingPermission): void {
    this.open = [...this.open, permission]
  }

  /** @returns the oldest open request, removed from the queue. */
  takeNext(): PendingPermission | undefined {
    const [next, ...rest] = this.open
    this.open = rest
    return next
  }

  /** Answer every open request as cancelled. */
  cancelAll(): void {
    const open = this.open
    this.open = []
    for (const permission of open) permission.resolve(CANCELLED)
  }

  /** Refuse the open requests of one call, whose mirror will never ask the harness. */
  rejectFor(acpId: string): void {
    const own = this.open.filter((permission) => permission.acpId === acpId)
    this.open = this.open.filter((permission) => permission.acpId !== acpId)
    for (const permission of own) permission.resolve(permissionResponse('rejected', permission.options))
  }
}
