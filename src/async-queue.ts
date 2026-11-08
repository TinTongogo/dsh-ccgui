/**
 * Single-reader async queue. CLI output arrives on notification callbacks while
 * the harness pulls it from an async generator, and a step can stop reading with
 * events still buffered for the next step.
 * @module dsh-ccgui/async-queue
 */

interface Waiter<T> {
  readonly resolve: (item: T) => void
  readonly dispose: () => void
}

/** FIFO buffer with one abortable waiting reader. */
export class AsyncQueue<T> {
  private items: readonly T[] = []
  private waiter: Waiter<T> | undefined

  /** Number of buffered items. */
  get size(): number {
    return this.items.length
  }

  /**
   * Hand an item to the waiting reader, or buffer it.
   * @param item - the item to deliver.
   */
  push(item: T): void {
    const waiter = this.waiter
    if (waiter === undefined) {
      this.items = [...this.items, item]
      return
    }
    this.waiter = undefined
    waiter.dispose()
    waiter.resolve(item)
  }

  /**
   * Read the next item, waiting if necessary. Aborting leaves buffered items in place.
   * @param signal - optional cancellation for this read.
   * @returns the next item.
   */
  next(signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason as Error)
    const [first, ...rest] = this.items
    if (this.items.length > 0) {
      this.items = rest
      return Promise.resolve(first as T)
    }
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    const onAbort = (): void => {
      this.waiter = undefined
      reject(signal?.reason as Error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    this.waiter = { resolve, dispose: () => signal?.removeEventListener('abort', onAbort) }
    return promise
  }

  /** Drop all buffered items. */
  clear(): void {
    this.items = []
  }
}
