import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { npxCacheDir, startFromNpxCache } from '../src/npx-cache.ts'

const PI_KEY = '07f9806484535e7b'
const PI = 'pi-acp@0.0.34'

let cache: string

interface CachedPackage {
  readonly key?: string
  readonly name?: string
  readonly version?: string
  readonly bin?: unknown
  readonly links?: readonly string[]
  readonly complete?: boolean
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** Lays a package out the way `npx` leaves it. */
function cached({
  key = PI_KEY,
  name = 'pi-acp',
  version = '0.0.34',
  bin = { 'pi-acp': 'dist/index.js' },
  links = ['pi-acp'],
  complete = true,
}: CachedPackage = {}): string {
  const modules = join(cache, key, 'node_modules')
  write(join(modules, name, 'package.json'), JSON.stringify({ name, version, bin }))
  for (const link of links) write(join(modules, '.bin', link), '#!/usr/bin/env node\n')
  if (complete) write(join(modules, '.package-lock.json'), '{}')
  return join(modules, '.bin')
}

const start = (argv: readonly string[], env: Readonly<Record<string, string>> = {}) =>
  startFromNpxCache({ argv, env }, { npxCache: cache, path: '/usr/bin' })

beforeEach(() => {
  cache = mkdtempSync(join(tmpdir(), 'npx-cache-'))
})
afterEach(() => {
  rmSync(cache, { recursive: true, force: true })
})

describe('startFromNpxCache', () => {
  it('starts a pinned package from the copy npx cached', () => {
    const bin = cached()
    expect(start(['npx', '-y', PI]).argv).toEqual([join(bin, 'pi-acp')])
  })

  it('accepts the long form of the flag, and no flag at all', () => {
    const bin = cached()
    expect(start(['npx', '--yes', PI]).argv).toEqual([join(bin, 'pi-acp')])
    expect(start(['npx', PI]).argv).toEqual([join(bin, 'pi-acp')])
  })

  it('passes on the arguments after the package', () => {
    const bin = cached()
    expect(start(['npx', '-y', PI, '--flag', 'value']).argv).toEqual([join(bin, 'pi-acp'), '--flag', 'value'])
  })

  // These two keys were read off a real npx cache: finding the same directory npx would use
  // is what makes this safe.
  it('finds a scoped package under the key npx gives it', () => {
    const name = '@agentclientprotocol/codex-acp'
    const bin = cached({
      key: 'c51fd8e4d04c136d',
      name,
      version: '2.5.0',
      bin: { 'codex-acp': 'bin.js' },
      links: ['codex-acp', 'codex'],
    })
    expect(start(['npx', '-y', `${name}@2.5.0`]).argv).toEqual([join(bin, 'codex-acp')])
  })

  // `npx` puts them there too, and a CLI may start a dependency's command by name.
  it("keeps the package's commands on the path", () => {
    const bin = cached()
    expect(start(['npx', '-y', PI], { TOKEN: 'x' }).env).toEqual({ TOKEN: 'x', PATH: `${bin}${delimiter}/usr/bin` })
  })

  it('builds on a path the configuration sets', () => {
    const bin = cached()
    expect(start(['npx', '-y', PI], { PATH: '/custom' }).env.PATH).toBe(`${bin}${delimiter}/custom`)
  })

  it('copes with no inherited path', () => {
    const bin = cached()
    expect(startFromNpxCache({ argv: ['npx', PI], env: {} }, { npxCache: cache, path: undefined }).env.PATH).toBe(bin)
  })

  it('names a lone string bin after the package, as npm does', () => {
    const bin = cached({ bin: 'dist/index.js' })
    expect(start(['npx', PI]).argv).toEqual([join(bin, 'pi-acp')])
  })

  it('picks the bin named after the package when there are several', () => {
    const bin = cached({ bin: { other: 'a.js', 'pi-acp': 'b.js' }, links: ['other', 'pi-acp'] })
    expect(start(['npx', PI]).argv).toEqual([join(bin, 'pi-acp')])
  })

  it('takes several names for one script as that one command', () => {
    const bin = cached({ bin: { alias: 'a.js', other: 'a.js' }, links: ['alias', 'other'] })
    expect(start(['npx', PI]).argv).toEqual([join(bin, 'alias')])
  })

  describe('leaves the command to npx', () => {
    const untouched = (argv: readonly string[]) => {
      expect(start(argv, { TOKEN: 'x' })).toEqual({ argv, env: { TOKEN: 'x' } })
    }

    it('for any other command', () => {
      cached()
      untouched(['opencode', 'acp'])
      untouched(['/opt/not-npx', PI])
    })

    // Only the registry can say what these mean.
    it('for a version that is not pinned', () => {
      cached()
      untouched(['npx', '-y', 'pi-acp'])
      untouched(['npx', '-y', 'pi-acp@latest'])
      untouched(['npx', '-y', 'pi-acp@^0.0.34'])
    })

    it('for flags it does not know', () => {
      cached()
      untouched(['npx', '-y', '--prefer-offline', PI])
      untouched(['npx', '--package=pi-acp@0.0.34', 'pi-acp'])
      untouched(['npx'])
    })

    it('for a name that could step out of the cache', () => {
      cached()
      untouched(['npx', '../../evil@1.0.0'])
    })

    it('until npx has cached it', () => {
      untouched(['npx', '-y', PI])
    })

    it('after an install that did not finish', () => {
      cached({ complete: false })
      untouched(['npx', '-y', PI])
    })

    it('when the cached copy is another version', () => {
      cached({ version: '0.0.33' })
      untouched(['npx', '-y', PI])
    })

    it('when the manifest cannot be read', () => {
      cached()
      write(join(cache, PI_KEY, 'node_modules/pi-acp/package.json'), 'not json')
      untouched(['npx', '-y', PI])
    })

    it('when the package has no bin', () => {
      cached({ bin: null })
      untouched(['npx', '-y', PI])
    })

    it('when npm could not tell which bin is meant either', () => {
      cached({ bin: { one: 'a.js', two: 'b.js' }, links: ['one', 'two'] })
      untouched(['npx', '-y', PI])
    })

    it('when the bin was not linked', () => {
      cached({ links: [] })
      untouched(['npx', '-y', PI])
    })

    it('when a bin name would step out of the directory', () => {
      cached({ bin: { '../evil': 'a.js' }, links: [] })
      untouched(['npx', '-y', PI])
    })
  })
})

describe('npxCacheDir', () => {
  it('sits under the npm cache in the home directory', () => {
    expect(npxCacheDir({}, '/home/me', 'darwin')).toBe(join('/home/me', '.npm', '_npx'))
  })

  it('follows a cache set in the environment', () => {
    expect(npxCacheDir({ npm_config_cache: '/elsewhere' }, '/home/me', 'linux')).toBe(join('/elsewhere', '_npx'))
  })

  // The links there are `.cmd` shims, which need a shell to start.
  it('has nothing to offer on Windows', () => {
    expect(npxCacheDir({}, 'C:\\Users\\me', 'win32')).toBeUndefined()
  })
})
