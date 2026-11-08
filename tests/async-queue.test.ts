import { describe, expect, it } from 'vitest'
import { AsyncQueue } from '../src/async-queue.ts'

describe('AsyncQueue', () => {
  it('returns buffered items in order', async () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.push(2)
    expect(await queue.next()).toBe(1)
    expect(await queue.next()).toBe(2)
  })

  it('wakes a waiting reader', async () => {
    const queue = new AsyncQueue<string>()
    const pending = queue.next()
    queue.push('x')
    expect(await pending).toBe('x')
  })

  it('rejects a waiting reader on abort and keeps later items', async () => {
    const queue = new AsyncQueue<string>()
    const controller = new AbortController()
    const pending = queue.next(controller.signal)
    controller.abort(new Error('stop'))
    await expect(pending).rejects.toThrow('stop')
    queue.push('later')
    expect(await queue.next()).toBe('later')
  })

  it('rejects immediately for an already aborted signal', async () => {
    const queue = new AsyncQueue<string>()
    queue.push('x')
    await expect(queue.next(AbortSignal.abort(new Error('gone')))).rejects.toThrow('gone')
    expect(queue.size).toBe(1)
  })

  it('removes the abort listener once an item arrives', async () => {
    const queue = new AsyncQueue<string>()
    const controller = new AbortController()
    const pending = queue.next(controller.signal)
    queue.push('x')
    expect(await pending).toBe('x')
    controller.abort()
    queue.push('y')
    expect(await queue.next()).toBe('y')
  })

  it('clears buffered items', () => {
    const queue = new AsyncQueue<number>()
    queue.push(1)
    queue.clear()
    expect(queue.size).toBe(0)
  })
})
