import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { letCliAsk } from '../src/session/approval-policy.ts'
import type { PolicyHolder } from '../src/session/approval-policy.ts'

interface Recorded {
  readonly type: string
  readonly data: unknown
}

/** A session that only records what gets appended to it. */
function agentWith(events: Recorded[]): Agent {
  const session = {
    append: (type: string, data: unknown) => {
      events.push({ type, data })
    },
  }
  return { session } as unknown as Agent
}

const holder = (policy: 'ask' | 'never' | undefined): PolicyHolder => ({ overrideOf: () => policy })

// DSH's access mode is for sessions the harness runs. A CLI session decides for itself
// whether to ask, and a "never ask" stance would answer its question with a rejection
// without asking anyone.
describe('letCliAsk', () => {
  it('lifts a never-ask stance so the CLI question can be answered', () => {
    const events: Recorded[] = []
    letCliAsk(holder('never'), agentWith(events))
    expect(events).toEqual([{ type: 'approval/policy', data: { policy: 'ask' } }])
  })

  it('leaves a session that already asks alone', () => {
    const events: Recorded[] = []
    letCliAsk(holder('ask'), agentWith(events))
    expect(events).toEqual([])
  })

  it('leaves the harness default alone when the session overrides nothing', () => {
    const events: Recorded[] = []
    letCliAsk(holder(undefined), agentWith(events))
    expect(events).toEqual([])
  })

  it('does nothing on a harness too old to report an override', () => {
    const events: Recorded[] = []
    letCliAsk({}, agentWith(events))
    expect(events).toEqual([])
  })
})
