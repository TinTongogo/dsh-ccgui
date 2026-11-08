/**
 * Reading the harness's observable stores from React.
 * @module dsh-ccgui/client/store
 */

import { useSyncExternalStore } from 'react'

/** An observable value owned by the harness. */
export interface Store<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): T
}

/**
 * Follow a store.
 * @param store - the store to read.
 * @returns its current value.
 */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  )
}
