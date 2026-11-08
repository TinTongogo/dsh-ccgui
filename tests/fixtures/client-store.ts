import { act } from '@testing-library/react'
import type { Store } from '../../src/client/store.ts'

/** A harness-style observable store that tests can push new snapshots into. */
export interface TestStore<T> extends Store<T> {
  /** Replace the snapshot and notify subscribers inside `act`. */
  set(next: T): void
  /** How many subscriptions are live, to check components clean up. */
  listeners(): number
}

export function createStore<T>(initial: T): TestStore<T> {
  let snapshot = initial
  let subscribers: readonly (() => void)[] = []
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      subscribers = [...subscribers, listener]
      return () => {
        subscribers = subscribers.filter((candidate) => candidate !== listener)
      }
    },
    set(next) {
      snapshot = next
      act(() => {
        for (const listener of subscribers) listener()
      })
    },
    listeners: () => subscribers.length,
  }
}
