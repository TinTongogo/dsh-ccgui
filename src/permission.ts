/**
 * Maps a harness approval decision onto the options a CLI offered.
 * @module dsh-ccgui/permission
 */

import type { PermissionOption, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'

/** The answer for a request nobody will decide on. */
export const CANCELLED: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }

function selectFirst(
  options: readonly PermissionOption[],
  kinds: readonly PermissionOption['kind'][],
): RequestPermissionResponse | undefined {
  for (const kind of kinds) {
    const match = options.find((option) => option.kind === kind)
    if (match !== undefined) return { outcome: { outcome: 'selected', optionId: match.optionId } }
  }
  return undefined
}

/**
 * Answer a CLI permission request. A harness approval covers one operation, so it
 * never selects `allow_always`: with no one-time option on offer, the safe answer is
 * no. `unavailable` means nobody could answer and is also a no, which fails closed.
 * @param outcome - the harness approval decision.
 * @param options - the options the CLI offered.
 * @returns the ACP response.
 */
export function permissionResponse(
  outcome: ApprovalOutcome,
  options: readonly PermissionOption[],
): RequestPermissionResponse {
  const reject = selectFirst(options, ['reject_once', 'reject_always']) ?? CANCELLED
  switch (outcome) {
    case 'allowed-once':
      return selectFirst(options, ['allow_once']) ?? reject
    case 'rejected':
    case 'unavailable':
      return reject
    case 'cancelled':
      return CANCELLED
  }
}
