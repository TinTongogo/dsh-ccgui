import { describe, expect, it, vi } from 'vitest'
import { createCheckouts } from '../../../src/client/worktree/worktree-checkouts.ts'
import { createExpansion, isOpen, parseExpansion } from '../../../src/client/worktree/worktree-expansion.ts'

describe('parseExpansion', () => {
  it('keeps only boolean choices', () => {
    expect(parseExpansion(JSON.stringify({ groups: { a: true, b: 'yes' }, worktrees: { c: false } }))).toEqual({
      groups: { a: true },
      worktrees: { c: false },
    })
  })

  it('treats anything malformed as no choices', () => {
    for (const raw of [null, 'not json', 'null', '[1]', JSON.stringify({ groups: [true] })]) {
      expect(parseExpansion(raw)).toEqual({ groups: {}, worktrees: {} })
    }
  })
})

describe('createExpansion', () => {
  it('falls back without a choice, and a choice wins over the fallback', () => {
    const expansion = createExpansion({ getItem: () => null, setItem: vi.fn() })
    expect(isOpen(expansion.getSnapshot(), 'groups', 'a', true)).toBe(true)
    expansion.set('groups', 'a', false)
    expect(isOpen(expansion.getSnapshot(), 'groups', 'a', true)).toBe(false)
  })

  it('notifies on change only, and survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const expansion = createExpansion(blocked)
    const listener = vi.fn()
    const unsubscribe = expansion.subscribe(listener)
    expansion.set('worktrees', 'w', true)
    expansion.set('worktrees', 'w', true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expansion.set('worktrees', 'w', false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(expansion.getSnapshot().worktrees).toEqual({ w: false })
  })
})

describe('createCheckouts', () => {
  it('asks once per path, and again for every known path on refresh', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { repo: true, top: '/a', main: '/a', branch: 'x' } })),
      ),
    )
    const checkouts = createCheckouts(fetchFn)
    const listener = vi.fn()
    checkouts.subscribe(listener)
    checkouts.track(['/a', '/a'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(checkouts.getSnapshot().get('/a')).toEqual({ top: '/a', main: '/a', branch: 'x' })
    })
    checkouts.track(['/a'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    checkouts.refresh()
    checkouts.refresh()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2)
    })
  })
})
