/**
 * Starts a version-pinned `npx` package straight from the copy npx already cached. On every
 * start `npx` first asks the registry about the package, even with that copy at hand, which
 * measured 4 to 26 seconds here and holds up both the model menu and the first message.
 *
 * Its `--prefer-offline` flag skips the question but is not a fix: it fails on a version newer
 * than the cached metadata, and it reaches the CLI as `npm_config_prefer_offline`, so npm
 * commands the agent runs in the user's project would quietly see stale metadata.
 *
 * Everything here rests on npm's cache layout, so whatever is not plainly there goes to `npx`
 * as configured. A change on npm's side can only make a start slower, never wrong.
 * @module dsh-ccgui/npx-cache
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, delimiter, join } from 'node:path'

/** How to start one CLI. */
export interface CliCommand {
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Where to look, and what to build the child's path on. */
export interface NpxCacheOptions {
  /** npm's `_npx` directory, or undefined where this cannot work. */
  readonly npxCache: string | undefined
  readonly path: string | undefined
}

interface PinnedPackage {
  readonly spec: string
  readonly name: string
  readonly version: string
  readonly args: readonly string[]
}

interface CachedBin {
  readonly dir: string
  readonly file: string
}

const NPX = 'npx'
const YES_FLAGS: ReadonlySet<string> = new Set(['-y', '--yes'])
const KEY_LENGTH = 16
/** Exact versions only: a tag or range means asking the registry, and the name stays inside the cache. */
const PINNED_SPEC = /^((?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?)$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function readPinned([command, ...args]: readonly string[]): PinnedPackage | undefined {
  if (command !== NPX) return undefined
  const [spec, ...rest] = YES_FLAGS.has(args[0] ?? '') ? args.slice(1) : args
  const match = PINNED_SPEC.exec(spec ?? '')
  if (spec === undefined || match === null) return undefined
  const [, name, version] = match
  return name === undefined || version === undefined ? undefined : { spec, name, version, args: rest }
}

function readManifest(path: string): Record<string, unknown> | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isObject(manifest) ? manifest : undefined
  } catch {
    return undefined
  }
}

/** Follows npm's own choice in `libnpmexec`, so this runs what `npx` would have run. */
function binOf(bin: unknown, name: string): string | undefined {
  const unscoped = name.replace(/^@[^/]+\//, '')
  const bins = typeof bin === 'string' ? { [unscoped]: bin } : isObject(bin) ? bin : {}
  const [first] = Object.keys(bins)
  if (new Set(Object.values(bins)).size === 1) return first
  return unscoped in bins ? unscoped : undefined
}

/** A finished install leaves this lockfile, and only the same version will do. */
function findCachedBin(npxCache: string, { spec, name, version }: PinnedPackage): CachedBin | undefined {
  const key = createHash('sha512').update(spec).digest('hex').slice(0, KEY_LENGTH)
  const modules = join(npxCache, key, 'node_modules')
  if (!existsSync(join(modules, '.package-lock.json'))) return undefined
  const manifest = readManifest(join(modules, name, 'package.json'))
  if (manifest?.version !== version) return undefined
  const bin = binOf(manifest.bin, name)
  if (bin === undefined || basename(bin) !== bin) return undefined
  const dir = join(modules, '.bin')
  return existsSync(join(dir, bin)) ? { dir, file: join(dir, bin) } : undefined
}

/**
 * Point a command at npx's cached copy of its package, when that is safe.
 * @param command - the command as configured.
 * @param options - where to look.
 * @returns the command to run: the same one unless a cached copy can stand in for it.
 */
export function startFromNpxCache(command: CliCommand, { npxCache, path }: NpxCacheOptions): CliCommand {
  if (npxCache === undefined) return command
  const pinned = readPinned(command.argv)
  const found = pinned === undefined ? undefined : findCachedBin(npxCache, pinned)
  if (pinned === undefined || found === undefined) return command
  const inherited = command.env.PATH ?? path
  return {
    argv: [found.file, ...pinned.args],
    // `npx` puts these on the path too, for a CLI that starts a dependency's command by name.
    env: { ...command.env, PATH: inherited === undefined ? found.dir : `${found.dir}${delimiter}${inherited}` },
  }
}

/**
 * Locate npx's cache. A cache moved by `.npmrc` is not found, which only means going by `npx`.
 * @param env - the process environment.
 * @param home - the user's home directory.
 * @param platform - the current platform.
 * @returns the `_npx` directory, or undefined on Windows, whose links need a shell to start.
 */
export function npxCacheDir(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform === 'win32') return undefined
  return join(env.npm_config_cache ?? join(home, '.npm'), '_npx')
}
