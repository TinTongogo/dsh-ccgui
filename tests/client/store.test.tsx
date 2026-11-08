// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '../../src/client/store.ts'
import { createStore } from '../fixtures/client-store.ts'

afterEach(() => {
  cleanup()
})

describe('useStore', () => {
  it('reads the current snapshot', () => {
    const store = createStore({ count: 1 })
    const { result } = renderHook(() => useStore(store))
    expect(result.current).toEqual({ count: 1 })
  })

  it('re-renders with each new snapshot', () => {
    const store = createStore({ count: 1 })
    const { result } = renderHook(() => useStore(store))
    store.set({ count: 2 })
    expect(result.current).toEqual({ count: 2 })
  })

  it('subscribes while mounted and unsubscribes on unmount', () => {
    const store = createStore('a')
    const { unmount } = renderHook(() => useStore(store))
    expect(store.listeners()).toBe(1)
    unmount()
    expect(store.listeners()).toBe(0)
  })

  it('follows a different store when given one', () => {
    const first = createStore('first')
    const second = createStore('second')
    const { result, rerender } = renderHook(({ store }) => useStore(store), { initialProps: { store: first } })
    rerender({ store: second })
    expect(result.current).toBe('second')
    second.set('updated')
    expect(result.current).toBe('updated')
  })
})
