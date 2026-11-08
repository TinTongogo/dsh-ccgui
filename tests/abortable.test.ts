import { describe, expect, it, vi } from 'vitest'
import { abortable } from '../src/abortable.ts'

const never = new Promise<never>(() => {})

/** Fails fast instead of letting a wait that should have ended hang until the test timeout. */
const DEADLINE_MS = 200
function within<T>(promise: Promise<T>): Promise<T> {
  const deadline = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error('still pending'))
    }, DEADLINE_MS).unref()
  })
  return Promise.race([promise, deadline])
}

describe('abortable', () => {
  it('resolves with the value when no signal is given', async () => {
    await expect(abortable(Promise.resolve(1))).resolves.toBe(1)
  })

  it('resolves with the value while the signal stays live', async () => {
    await expect(abortable(Promise.resolve('ok'), new AbortController().signal)).resolves.toBe('ok')
  })

  it('passes the work rejection through', async () => {
    const failure = new Error('work failed')
    await expect(abortable(Promise.reject(failure), new AbortController().signal)).rejects.toBe(failure)
  })

  it('rejects with the abort reason when the signal fires mid-wait', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const wait = abortable(never, controller.signal)
    controller.abort(reason)
    await expect(within(wait)).rejects.toBe(reason)
  })

  // An already-aborted signal never fires `abort` again, so only the upfront check can end the wait.
  it('rejects at once for a signal that has already aborted', async () => {
    const reason = new Error('too late')
    await expect(within(abortable(never, AbortSignal.abort(reason)))).rejects.toBe(reason)
  })

  it.each([
    ['resolves', () => Promise.resolve(1)],
    ['rejects', () => Promise.reject(new Error('failed'))],
  ])('removes its abort listener once the work %s', async (_label, work) => {
    const { signal } = new AbortController()
    const add = vi.spyOn(signal, 'addEventListener')
    const remove = vi.spyOn(signal, 'removeEventListener')
    await abortable(work(), signal).catch(() => undefined)
    const listener = add.mock.calls[0]?.[1]
    expect(listener).toBeTypeOf('function')
    expect(remove).toHaveBeenCalledWith('abort', listener)
  })

  it('removes its abort listener once the signal fires', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const wait = abortable(never, controller.signal)
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(within(wait)).rejects.toBe(reason)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
