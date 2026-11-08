import { describe, expect, it, vi } from 'vitest'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import { probeModels } from '../src/model-probe.ts'
import { FakeTransport } from './fixtures/fake-transport.ts'

const OPTIONS: SessionConfigOption[] = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'a',
    options: [{ value: 'a', name: 'A' }],
  },
]

function setup() {
  const fake = new FakeTransport()
  fake.configOptions = OPTIONS
  fake.capabilities = { sessionCapabilities: { delete: {}, close: {} } }
  return { fake, probe: () => probeModels((handlers) => fake.attach(handlers), '/tmp/x', 1_000) }
}

describe('probeModels', () => {
  it('reports the models and stops the process', async () => {
    const { fake, probe } = setup()
    await expect(probe()).resolves.toMatchObject({ configId: 'model', current: 'a' })
    expect(fake.newSessions).toEqual(['/tmp/x'])
    await vi.waitFor(() => {
      expect(fake.disposed).toBe(true)
    })
  })

  it('never sends a prompt, which would cost the user money', async () => {
    const { fake, probe } = setup()
    await probe()
    expect(fake.prompts).toEqual([])
  })

  // Otherwise every start of the harness leaves an empty session in the CLI's history.
  it('deletes the session it opened', async () => {
    const { fake, probe } = setup()
    await probe()
    await vi.waitFor(() => {
      expect(fake.disposed).toBe(true)
    })
    expect(fake.deletedSessions).toEqual(['acp-1'])
    expect(fake.closedSessions).toEqual([])
  })

  it('closes it when the CLI cannot delete', async () => {
    const { fake, probe } = setup()
    fake.capabilities = { sessionCapabilities: { close: {} } }
    await probe()
    await vi.waitFor(() => {
      expect(fake.closedSessions).toEqual(['acp-1'])
    })
  })

  it('leaves it when the CLI can do neither', async () => {
    const { fake, probe } = setup()
    fake.capabilities = {}
    await expect(probe()).resolves.toBeDefined()
    await vi.waitFor(() => {
      expect(fake.disposed).toBe(true)
    })
    expect(fake.deletedSessions).toEqual([])
    expect(fake.closedSessions).toEqual([])
  })

  it('still reports the models when cleanup fails', async () => {
    const { fake, probe } = setup()
    fake.discardError = new Error('nope')
    await expect(probe()).resolves.toBeDefined()
  })

  it('keeps the models when cleanup hangs', async () => {
    const fake = new FakeTransport()
    fake.configOptions = OPTIONS
    fake.capabilities = { sessionCapabilities: { delete: {} } }
    fake.deleteSession = () => new Promise(() => {})
    await expect(probeModels((handlers) => fake.attach(handlers), '/tmp/x', 40)).resolves.toMatchObject({
      current: 'a',
    })
    await vi.waitFor(() => {
      expect(fake.disposed).toBe(true)
    })
  })

  // Pi takes almost two seconds to delete a session and Codex two to exit, with the user
  // looking at a menu that could already be filled.
  it('hands over the models without waiting for the session to be removed', async () => {
    const { fake, probe } = setup()
    fake.deleteSession = () => new Promise(() => {})
    const stillWaiting = new Promise((resolve) => {
      setTimeout(resolve, 100, 'still waiting')
    })
    await expect(Promise.race([probe(), stillWaiting])).resolves.toMatchObject({ current: 'a' })
  })

  it('hands over the models without waiting for the CLI to exit', async () => {
    const { fake, probe } = setup()
    fake.dispose = () => new Promise(() => {})
    await expect(probe()).resolves.toMatchObject({ current: 'a' })
  })

  it('cleans up in the right order: the session first, then the process', async () => {
    const { fake, probe } = setup()
    const { promise: removed, resolve: finishRemoving } = Promise.withResolvers<undefined>()
    fake.deleteSession = () => removed
    await probe()
    expect(fake.disposed).toBe(false)
    finishRemoving(undefined)
    await vi.waitFor(() => {
      expect(fake.disposed).toBe(true)
    })
  })

  it('stops the process at once when the bridge shuts down during cleanup', async () => {
    const fake = new FakeTransport()
    fake.configOptions = OPTIONS
    fake.capabilities = { sessionCapabilities: { delete: {} } }
    fake.deleteSession = () => new Promise(() => {})
    const controller = new AbortController()
    await probeModels((handlers) => fake.attach(handlers), '/tmp/x', 60_000, controller.signal)
    controller.abort(new Error('shutting down'))
    await vi.waitFor(() => {
      expect(fake.disposedForcefully).toBe(true)
    })
  })

  it('stays quiet when stopping the CLI fails after the answer', async () => {
    const { fake, probe } = setup()
    fake.dispose = () => Promise.reject(new Error('already gone'))
    await expect(probe()).resolves.toBeDefined()
  })

  it('stops the process at once when the bridge is shutting down', async () => {
    const fake = new FakeTransport()
    fake.initialize = () => new Promise(() => {})
    const controller = new AbortController()
    const probing = probeModels((handlers) => fake.attach(handlers), '/tmp/x', 60_000, controller.signal)
    controller.abort(new Error('shutting down'))
    await expect(probing).rejects.toThrow('shutting down')
    expect(fake.disposedForcefully).toBe(true)
  })

  it('reports nothing for a CLI with no model option', async () => {
    const { fake, probe } = setup()
    fake.configOptions = undefined
    await expect(probe()).resolves.toBeUndefined()
  })

  it('fails and stops the process when startup fails', async () => {
    const { fake, probe } = setup()
    fake.initializeError = new Error('not logged in')
    await expect(probe()).rejects.toThrow('not logged in')
    expect(fake.disposed).toBe(true)
  })

  it('gives up on a CLI that never answers', async () => {
    const fake = new FakeTransport()
    fake.initialize = () => new Promise(() => {})
    await expect(probeModels((handlers) => fake.attach(handlers), '/tmp/x', 10)).rejects.toThrow('超时')
    expect(fake.disposedForcefully).toBe(true)
  })

  it('refuses any permission request while probing', async () => {
    const { fake, probe } = setup()
    fake.newSession = async () => {
      const answer = await fake.askPermission({ toolCall: { toolCallId: 'x' }, options: [] })
      expect(answer).toEqual({ outcome: { outcome: 'cancelled' } })
      fake.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ignored' } })
      fake.close(new Error('ignored'))
      return { sessionId: 'acp-1', configOptions: OPTIONS }
    }
    await expect(probe()).resolves.toBeDefined()
  })
})
