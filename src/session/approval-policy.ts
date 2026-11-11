/**
 * DSH's access mode is the harness's stance on sessions it runs itself. A CLI session
 * decides for itself whether to ask, and the question it asks has to reach a person: under
 * the "never ask" stance the approval service answers it with a rejection without asking
 * anyone, which turns the CLI's own `Always Ask` into a silent failure.
 * @module dsh-ccgui/session/approval-policy
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalPolicy } from '@deepseek-ai/dsh-user-approval'

/** The part of the harness's approval service this needs. */
export interface PolicyHolder {
  /** The policy this agent's session carries right now, if it overrides the default. */
  overrideOf?(session: Agent['session']): ApprovalPolicy | undefined
}

/**
 * Put a CLI session back on "ask" so its own question can be answered.
 *
 * Only a CLI asks through the bridge, so this never touches a session the harness runs.
 * Nothing changes unless a "never ask" stance is in force (the access mode's 完全权限),
 * and the switch happens once per session: the first ask restores the stance, later asks
 * find it already restored. The switch is written as a session event, which is how the
 * harness records every policy change, so the log shows it rather than hiding it.
 * @param approval - the harness's approval service.
 * @param agent - the agent the CLI asks on behalf of.
 */
export function letCliAsk(approval: PolicyHolder, agent: Agent): void {
  // An older harness has no per-session override to read; its default stance is left alone.
  if (approval.overrideOf?.(agent.session) !== 'never') return
  setApprovalPolicy(agent.session, 'ask')
}
