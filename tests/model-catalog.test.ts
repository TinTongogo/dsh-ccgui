import { describe, expect, it, vi } from 'vitest'
import { CliModelCatalog } from '../src/model-catalog.ts'
import type { CliModelList } from '../src/model-options.ts'

const LIST: CliModelList = {
  configId: 'model',
  current: 'small',
  options: [
    { value: 'small', name: 'Small' },
    { value: 'large', name: 'Large' },
  ],
}

function setup(probe: (provider: string) => Promise<CliModelList | undefined> = () => Promise.resolve(LIST)) {
  const deps = {
    labelFor: vi.fn((_provider: string): string | undefined => 'X CLI'),
    probe: vi.fn(probe),
    onUpdated: vi.fn(),
    warn: vi.fn(),
    save: vi.fn((_lists: ReadonlyMap<string, CliModelList>) => Promise.resolve()),
  }
  return { deps, catalog: new CliModelCatalog(deps) }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('CliModelCatalog', () => {
  // Filling the menu must not run anything: for `npx` commands that would download and
  // execute a package the user never chose.
  it('starts no CLI just to fill the menu', () => {
    const { catalog, deps } = setup()
    expect(catalog.listModels('cli-x')).toEqual([{ provider: 'cli-x', id: 'default', name: 'X CLI' }])
    expect(deps.probe).not.toHaveBeenCalled()
  })

  it('asks in the background when requested, without waiting for the answer', () => {
    const { catalog, deps } = setup(() => new Promise(() => {}))
    catalog.ensureListed('cli-x')
    expect(deps.probe).toHaveBeenCalledWith('cli-x')
    expect(catalog.listModels('cli-x')).toHaveLength(1)
  })

  it('lists the real models once it knows them, naming the active one as default', async () => {
    const { catalog } = setup()
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.listModels('cli-x')).toEqual([
      { provider: 'cli-x', id: 'default', name: 'Small（默认）' },
      { provider: 'cli-x', id: 'small', name: 'Small' },
      { provider: 'cli-x', id: 'large', name: 'Large' },
    ])
  })

  it('tells the UI when the list arrives', async () => {
    const { catalog, deps } = setup()
    catalog.ensureListed('cli-x')
    await settled()
    expect(deps.onUpdated).toHaveBeenCalledWith('cli-x')
  })

  it('asks each CLI only once', async () => {
    const { catalog, deps } = setup()
    catalog.ensureListed('cli-x')
    catalog.ensureListed('cli-x')
    await settled()
    catalog.ensureListed('cli-x')
    expect(deps.probe).toHaveBeenCalledTimes(1)
  })

  // Otherwise the menu would stay on the CLI's name until the harness restarts, even after
  // the user installs it or logs in. Requests come from people choosing it, so this cannot loop.
  it('asks again after a failure, the next time it is requested', async () => {
    const { catalog, deps } = setup()
    deps.probe.mockRejectedValueOnce(new Error('not logged in'))
    catalog.ensureListed('cli-x')
    await settled()
    catalog.ensureListed('cli-x')
    await settled()
    expect(deps.probe).toHaveBeenCalledTimes(2)
    expect(catalog.listModels('cli-x')).toHaveLength(3)
  })

  // An unhandled rejection would take the whole harness down.
  it('reports a failing listener instead of leaving a rejection unhandled', async () => {
    const { catalog, deps } = setup()
    deps.onUpdated.mockImplementation(() => {
      throw new Error('listener broke')
    })
    catalog.ensureListed('cli-x')
    await settled()
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('listener broke'))
    expect(catalog.listModels('cli-x')).toHaveLength(3)
  })

  it('shares what it knows with the sessions that need it', async () => {
    const { catalog } = setup()
    expect(catalog.known('cli-x')).toBeUndefined()
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.known('cli-x')).toEqual(LIST)
  })

  // The harness rejects a catalog with duplicate ids, which would drop the whole CLI.
  it('never produces a duplicate id', async () => {
    const { catalog } = setup(() =>
      Promise.resolve({
        configId: 'model',
        current: 'a',
        options: [
          { value: 'default', name: 'Auto' },
          { value: 'a', name: 'A' },
          { value: 'a', name: 'A again' },
        ],
      }),
    )
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.listModels('cli-x').map((model) => model.id)).toEqual(['default', 'a'])
  })

  it('shows the raw id when the active model has no listed name', async () => {
    const { catalog } = setup(() => Promise.resolve({ ...LIST, current: 'hidden' }))
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.listModels('cli-x')[0]?.name).toBe('hidden（默认）')
  })

  it('stays usable when a CLI cannot be asked', async () => {
    const { catalog, deps } = setup(() => Promise.reject(new Error('not installed')))
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.listModels('cli-x')).toEqual([{ provider: 'cli-x', id: 'default', name: 'X CLI' }])
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('not installed'))
    expect(deps.onUpdated).not.toHaveBeenCalled()
  })

  it('stays usable when a CLI lists nothing', async () => {
    const { catalog, deps } = setup(() => Promise.resolve(undefined))
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.listModels('cli-x')).toHaveLength(1)
    expect(deps.onUpdated).not.toHaveBeenCalled()
  })

  it('falls back to the route for an unknown CLI', () => {
    const { catalog, deps } = setup()
    deps.labelFor.mockReturnValue(undefined)
    expect(catalog.listModels('cli-y')[0]?.name).toBe('cli-y')
  })

  it('names models', async () => {
    const { catalog } = setup()
    expect(catalog.modelName('cli-x', 'large')).toBe('large')
    catalog.ensureListed('cli-x')
    await settled()
    expect(catalog.modelName('cli-x', 'default')).toBe('Small（默认）')
    expect(catalog.modelName('cli-x', 'large')).toBe('Large')
    expect(catalog.modelName('cli-x', 'gone')).toBe('gone')
  })

  describe('lists kept from an earlier run', () => {
    const OLD: CliModelList = { configId: 'model', current: 'old', options: [{ value: 'old', name: 'Old' }] }

    // A plugin restarted by an update or a hot reload would otherwise show an empty menu until it probes again.
    it('shows them at once and tells the UI', () => {
      const { catalog, deps } = setup()
      catalog.restore(new Map([['cli-x', OLD]]))
      expect(catalog.listModels('cli-x').map((model) => model.name)).toEqual(['Old（默认）', 'Old'])
      expect(catalog.known('cli-x')).toEqual(OLD)
      expect(deps.onUpdated).toHaveBeenCalledWith('cli-x')
    })

    it('ignores CLIs that are no longer configured', () => {
      const { catalog, deps } = setup()
      deps.labelFor.mockImplementation((provider) => (provider === 'cli-x' ? 'X CLI' : undefined))
      catalog.restore(new Map([['cli-gone', OLD]]))
      expect(catalog.known('cli-gone')).toBeUndefined()
      expect(deps.onUpdated).not.toHaveBeenCalled()
    })

    // The kept list may be out of date, so choosing the CLI still asks it.
    it('still asks the CLI, and the answer replaces the kept list', async () => {
      const { catalog, deps } = setup()
      catalog.restore(new Map([['cli-x', OLD]]))
      catalog.ensureListed('cli-x')
      await settled()
      expect(deps.probe).toHaveBeenCalledTimes(1)
      expect(catalog.known('cli-x')).toEqual(LIST)
    })

    it('never replaces a fresher answer', async () => {
      const { catalog, deps } = setup()
      catalog.ensureListed('cli-x')
      await settled()
      deps.onUpdated.mockClear()
      catalog.restore(new Map([['cli-x', OLD]]))
      expect(catalog.known('cli-x')).toEqual(LIST)
      expect(deps.onUpdated).not.toHaveBeenCalled()
    })

    it('asks again after a failure even while it shows a kept list', async () => {
      const { catalog, deps } = setup()
      catalog.restore(new Map([['cli-x', OLD]]))
      deps.probe.mockRejectedValueOnce(new Error('offline'))
      catalog.ensureListed('cli-x')
      await settled()
      expect(catalog.known('cli-x')).toEqual(OLD)
      catalog.ensureListed('cli-x')
      await settled()
      expect(deps.probe).toHaveBeenCalledTimes(2)
      expect(catalog.known('cli-x')).toEqual(LIST)
    })
  })

  describe('saving', () => {
    it('saves every list it knows after each answer', async () => {
      const { catalog, deps } = setup()
      catalog.ensureListed('cli-x')
      catalog.ensureListed('cli-y')
      await settled()
      expect(deps.save).toHaveBeenLastCalledWith(
        new Map([
          ['cli-x', LIST],
          ['cli-y', LIST],
        ]),
      )
    })

    it('does not save a list it only restored', () => {
      const { catalog, deps } = setup()
      catalog.restore(new Map([['cli-x', LIST]]))
      expect(deps.save).not.toHaveBeenCalled()
    })

    it('warns when saving fails, keeping the list in memory', async () => {
      const { catalog, deps } = setup()
      deps.save.mockRejectedValueOnce(new Error('disk full'))
      catalog.ensureListed('cli-x')
      await settled()
      await settled()
      expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('disk full'))
      expect(catalog.known('cli-x')).toEqual(LIST)
    })
  })
})
