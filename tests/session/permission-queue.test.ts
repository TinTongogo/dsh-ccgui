import type { PermissionOption, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import { describe, expect, it, vi } from 'vitest'
import { CANCELLED, PermissionQueue } from '../../src/session/permission-queue.ts'
import type { PendingPermission } from '../../src/session/permission-queue.ts'

const OPTIONS: readonly PermissionOption[] = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
]

function pending(acpId: string): PendingPermission & { readonly resolve: ReturnType<typeof vi.fn> } {
  return { acpId, options: OPTIONS, resolve: vi.fn<(response: RequestPermissionResponse) => void>() }
}

describe('PermissionQueue', () => {
  it('hands requests out oldest first, each once', () => {
    const queue = new PermissionQueue()
    const first = pending('a')
    const second = pending('b')
    queue.add(first)
    queue.add(second)

    expect(queue.takeNext()).toBe(first)
    expect(queue.takeNext()).toBe(second)
    expect(queue.takeNext()).toBeUndefined()
  })

  it('cancels every open request and empties the queue', () => {
    const queue = new PermissionQueue()
    const requests = [pending('a'), pending('b')]
    for (const request of requests) queue.add(request)

    queue.cancelAll()

    for (const request of requests) expect(request.resolve).toHaveBeenCalledExactlyOnceWith(CANCELLED)
    expect(queue.takeNext()).toBeUndefined()
  })

  it('rejects only the requests of the given call and keeps the others in order', () => {
    const queue = new PermissionQueue()
    const own = [pending('a'), pending('a')]
    const others = [pending('b'), pending('c')]
    queue.add(others[0] ?? pending('x'))
    for (const request of own) queue.add(request)
    queue.add(others[1] ?? pending('x'))

    queue.rejectFor('a')

    for (const request of own) {
      expect(request.resolve).toHaveBeenCalledExactlyOnceWith({ outcome: { outcome: 'selected', optionId: 'deny' } })
    }
    for (const request of others) expect(request.resolve).not.toHaveBeenCalled()
    expect(queue.takeNext()?.acpId).toBe('b')
    expect(queue.takeNext()?.acpId).toBe('c')
    expect(queue.takeNext()).toBeUndefined()
  })

  it('does nothing when the call has no open request', () => {
    const queue = new PermissionQueue()
    const other = pending('b')
    queue.add(other)

    queue.rejectFor('a')

    expect(other.resolve).not.toHaveBeenCalled()
    expect(queue.takeNext()).toBe(other)
  })
})
