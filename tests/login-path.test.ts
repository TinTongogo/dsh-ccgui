import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPath, diskDirs, knownBinDirs, mergePaths, parseShellPath, runShell } from '../src/login-path.ts'
import type { DirProbe, LoginPathOptions, ShellRunner } from '../src/login-path.ts'

const HOME = '/Users/me'
const MARK = '__DSH_CCGUI_PATH__'
/** What a GUI app on macOS inherits from launchd. */
const LAUNCHD_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const NVM_BIN = `${HOME}/.nvm/versions/node/v22.22.1/bin`

const dirs = (entries: Readonly<Record<string, readonly string[]>>): DirProbe => ({
  isDir: (path) => path in entries,
  list: (path) => entries[path] ?? [],
})

const options = (overrides: Partial<LoginPathOptions> = {}): LoginPathOptions => ({
  platform: 'darwin',
  env: { PATH: LAUNCHD_PATH, SHELL: '/bin/zsh' },
  home: HOME,
  dirs: dirs({}),
  run: () => Promise.resolve(''),
  warn: () => undefined,
  ...overrides,
})

describe('parseShellPath', () => {
  it('reads the value between the markers, whatever the rc files print around it', () => {
    expect(parseShellPath(`Welcome!\n${MARK}\n/a:/b\n${MARK}\nbye`)).toBe('/a:/b')
  })

  it('takes the last pair, in case an rc file echoes the command', () => {
    expect(parseShellPath(`${MARK}x${MARK}\n${MARK}\n/a\n${MARK}\n`)).toBe('/a')
  })

  it('gives up on output without both markers, or with nothing between them', () => {
    expect(parseShellPath(`${MARK}\n/a`)).toBeUndefined()
    expect(parseShellPath(`${MARK}\n\n${MARK}`)).toBeUndefined()
  })
})

describe('mergePaths', () => {
  it('keeps the first occurrence of each directory, in order, and drops empty entries', () => {
    expect(mergePaths('/a:/b', undefined, '/b::/c', '/a')).toBe('/a:/b:/c')
  })
})

describe('knownBinDirs', () => {
  it('lists the usual install places that exist, newest nvm node first', () => {
    const probe = dirs({
      '/opt/homebrew/bin': [],
      [`${HOME}/.bun/bin`]: [],
      [`${HOME}/.nvm/versions/node`]: ['v9.11.2', 'v22.22.1', 'v18.20.4'],
      [NVM_BIN]: [],
      [`${HOME}/.nvm/versions/node/v18.20.4/bin`]: [],
      [`${HOME}/.nvm/versions/node/v9.11.2/bin`]: [],
    })
    expect(knownBinDirs(HOME, probe)).toEqual([
      '/opt/homebrew/bin',
      `${HOME}/.bun/bin`,
      NVM_BIN,
      `${HOME}/.nvm/versions/node/v18.20.4/bin`,
      `${HOME}/.nvm/versions/node/v9.11.2/bin`,
    ])
  })
})

describe('LoginPath', () => {
  it('finds node under nvm even before, or without, the login shell answering', () => {
    const probe = dirs({ [`${HOME}/.nvm/versions/node`]: ['v22.22.1'], [NVM_BIN]: [] })
    const path = new LoginPath(options({ dirs: probe }))
    expect(path.apply({})).toEqual({ PATH: `${LAUNCHD_PATH}:${NVM_BIN}` })
  })

  it("puts the login shell's PATH first once it has been read", async () => {
    const run = vi.fn<ShellRunner>().mockResolvedValue(`${MARK}\n${NVM_BIN}:/usr/bin\n${MARK}\n`)
    const path = new LoginPath(options({ run }))
    await path.load(new AbortController().signal)
    expect(path.apply({}).PATH).toBe(`${NVM_BIN}:/usr/bin:/bin:/usr/sbin:/sbin`)
    const [argv] = run.mock.calls[0] ?? []
    expect(argv?.slice(0, 2)).toEqual(['/bin/zsh', '-ilc'])
  })

  it('uses the platform default shell when SHELL is not set', async () => {
    const run = vi.fn<ShellRunner>().mockResolvedValue('')
    await new LoginPath(options({ env: {}, run })).load(new AbortController().signal)
    await new LoginPath(options({ platform: 'linux', env: {}, run })).load(new AbortController().signal)
    expect(run.mock.calls.map(([argv]) => argv[0])).toEqual(['/bin/zsh', '/bin/sh'])
  })

  it('warns and keeps the fallback when the login shell fails', async () => {
    const warn = vi.fn()
    const path = new LoginPath(options({ run: () => Promise.reject(new Error('timed out')), warn }))
    await path.load(new AbortController().signal)
    expect(path.apply({}).PATH).toBe(LAUNCHD_PATH)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out'))
  })

  it('stays quiet when the plugin went away while the shell ran', async () => {
    const warn = vi.fn()
    const controller = new AbortController()
    const run: ShellRunner = () => {
      controller.abort()
      return Promise.reject(new Error('aborted'))
    }
    await new LoginPath(options({ run, warn })).load(controller.signal)
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves a PATH the CLI is configured with alone', () => {
    const path = new LoginPath(options())
    const env = { PATH: '/mine', KEY: 'k' }
    expect(path.apply(env)).toBe(env)
  })

  it('does nothing on Windows, which looks programs up by itself', async () => {
    const run = vi.fn<ShellRunner>()
    const path = new LoginPath(options({ platform: 'win32', run }))
    await path.load(new AbortController().signal)
    expect(run).not.toHaveBeenCalled()
    expect(path.apply({ A: 'a' })).toEqual({ A: 'a' })
  })
})

describe('runShell', () => {
  it('returns what the command printed on stdout', async () => {
    await expect(runShell(['/bin/sh', '-c', 'echo hi'], new AbortController().signal)).resolves.toBe('hi\n')
  })

  it('rejects when the command fails', async () => {
    await expect(runShell(['/bin/sh', '-c', 'exit 3'], new AbortController().signal)).rejects.toThrow()
  })
})

describe('diskDirs', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'login-path-'))
    mkdirSync(join(root, 'v1', 'bin'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads directories from the real file system, and an empty list for a missing one', () => {
    expect(diskDirs.isDir(join(root, 'v1', 'bin'))).toBe(true)
    expect(diskDirs.isDir(join(root, 'nope'))).toBe(false)
    expect(diskDirs.list(root)).toEqual(['v1'])
    expect(diskDirs.list(join(root, 'nope'))).toEqual([])
  })
})
