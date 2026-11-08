import { describe, expect, it } from 'vitest'
import { permissionResponse } from '../src/permission.ts'
import type { PermissionOption } from '@agentclientprotocol/sdk'

const option = (optionId: string, kind: PermissionOption['kind']): PermissionOption => ({
  optionId,
  name: optionId,
  kind,
})

const full = [
  option('always', 'allow_always'),
  option('once', 'allow_once'),
  option('never', 'reject_always'),
  option('no', 'reject_once'),
]

const selected = (optionId: string) => ({ outcome: { outcome: 'selected', optionId } })
const cancelled = { outcome: { outcome: 'cancelled' } }

describe('permissionResponse', () => {
  // An approval in the harness is scoped to this one call, so the bridge must
  // never turn it into a standing grant inside the CLI when it has a choice.
  it('prefers allow_once over allow_always', () => {
    expect(permissionResponse('allowed-once', full)).toEqual(selected('once'))
  })

  // A harness approval covers one operation. Taking the only offer here would
  // silently grant the CLI that permission for good.
  it('rejects rather than grant permanently when no one-time option exists', () => {
    expect(permissionResponse('allowed-once', [option('always', 'allow_always'), option('no', 'reject_once')])).toEqual(
      selected('no'),
    )
    expect(permissionResponse('allowed-once', [option('always', 'allow_always')])).toEqual(cancelled)
  })

  it('prefers reject_once for a rejection', () => {
    expect(permissionResponse('rejected', full)).toEqual(selected('no'))
  })

  it('falls back to reject_always', () => {
    expect(permissionResponse('rejected', [option('never', 'reject_always')])).toEqual(selected('never'))
  })

  it('fails closed when no answerer is available', () => {
    expect(permissionResponse('unavailable', full)).toEqual(selected('no'))
  })

  it('answers cancelled for a cancelled question', () => {
    expect(permissionResponse('cancelled', full)).toEqual(cancelled)
  })

  it('answers cancelled when no option matches the decision', () => {
    expect(permissionResponse('rejected', [option('once', 'allow_once')])).toEqual(cancelled)
  })
})
