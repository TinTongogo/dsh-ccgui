/**
 * Gives CLIs the PATH a terminal would give them. On macOS an app started from the Dock gets
 * launchd's PATH, `/usr/bin:/bin:/usr/sbin:/sbin`, and never reads the shell's rc files, so a
 * node installed through nvm, fnm or Volta is out of sight. Every npx-based CLI then dies
 * with exit code 127 from `/usr/bin/env node`, while the same CLI works in a terminal.
 *
 * The login shell is asked for its PATH once, in the background, since rc files can take
 * seconds. Until it answers, or when it fails, the usual install places are appended to the
 * inherited PATH, which already covers the common nvm and Homebrew setups.
 * @module dsh-ccgui/login-path
 */

import { execFile } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** What the lookup needs from the file system; separate so tests need not touch the disk. */
export interface DirProbe {
  readonly isDir: (path: string) => boolean
  readonly list: (path: string) => readonly string[]
}

/** Runs a command and resolves with its stdout. */
export type ShellRunner = (argv: readonly string[], signal: AbortSignal) => Promise<string>

export interface LoginPathOptions {
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly dirs: DirProbe
  readonly run: ShellRunner
  readonly warn: (message: string) => void
}

/** Brackets the value, since rc files are free to print greetings around it. */
const MARKER = '__DSH_CCGUI_PATH__'
/** `printenv` reads the exported value, so it prints the same in sh, zsh, bash and fish. */
const PRINT_PATH = `echo ${MARKER}; printenv PATH; echo ${MARKER}`
const SHELL_TIMEOUT_MS = 5_000
const SHELL_MAX_OUTPUT_BYTES = 1024 * 1024
/** The shell macOS gives new accounts; elsewhere the one every system has. */
const DARWIN_SHELL = '/bin/zsh'
const POSIX_SHELL = '/bin/sh'
const SYSTEM_DIRS: readonly string[] = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin']
const HOME_DIRS: readonly string[] = [
  '.local/bin',
  '.volta/bin',
  '.bun/bin',
  '.cargo/bin',
  '.local/share/mise/shims',
  '.asdf/shims',
  'Library/pnpm',
  '.local/share/pnpm',
]
const NVM_VERSIONS = '.nvm/versions/node'

/**
 * Read the PATH out of the login shell's output.
 * @param stdout - everything the shell printed.
 * @returns the PATH, or undefined when the output does not hold one.
 */
export function parseShellPath(stdout: string): string | undefined {
  const parts = stdout.split(MARKER)
  // The last pair is ours; an rc file that echoes commands adds an earlier one.
  const value = parts.length < 3 ? undefined : parts[parts.length - 2]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/**
 * Join PATH values, keeping the first occurrence of each directory.
 * @param paths - PATH values, in order of precedence.
 * @returns one PATH value.
 */
export function mergePaths(...paths: readonly (string | undefined)[]): string {
  const entries = paths.flatMap((path) => (path ?? '').split(delimiter)).filter((dir) => dir !== '')
  return [...new Set(entries)].join(delimiter)
}

function versionParts(version: string): readonly number[] {
  return (version.match(/\d+/g) ?? []).map(Number)
}

function newestFirst(a: string, b: string): number {
  const [left, right] = [versionParts(a), versionParts(b)]
  const index = left.findIndex((part, i) => part !== right[i])
  return index === -1 ? right.length - left.length : (right[index] ?? 0) - (left[index] ?? 0)
}

/**
 * The usual install places for CLIs and node that exist on this machine.
 * @param home - the user's home directory.
 * @param dirs - the file system.
 * @returns existing directories, newest nvm node first since nvm's default is usually it.
 */
export function knownBinDirs(home: string, dirs: DirProbe): readonly string[] {
  const nvm = join(home, NVM_VERSIONS)
  const nvmBins = [...dirs.list(nvm)].sort(newestFirst).map((version) => join(nvm, version, 'bin'))
  return [...SYSTEM_DIRS, ...HOME_DIRS.map((dir) => join(home, dir)), ...nvmBins].filter((dir) => dirs.isDir(dir))
}

/** The PATH handed to CLIs: the login shell's when known, the inherited one plus fallbacks otherwise. */
export class LoginPath {
  private login: string | undefined

  constructor(private readonly options: LoginPathOptions) {}

  /**
   * Ask the login shell for its PATH. Never rejects: a failure only keeps the fallback.
   * @param signal - ends the shell when the plugin goes away.
   */
  async load(signal: AbortSignal): Promise<void> {
    const { platform, env, run, warn } = this.options
    if (platform === 'win32') return
    const shell = env.SHELL ?? (platform === 'darwin' ? DARWIN_SHELL : POSIX_SHELL)
    try {
      this.login = parseShellPath(await run([shell, '-ilc', PRINT_PATH], signal))
    } catch (error: unknown) {
      if (!signal.aborted) warn(`ccgui: could not read the login shell's PATH: ${String(error)}`)
    }
  }

  /**
   * Give a CLI's environment a full PATH, unless it is configured with one.
   * @param env - the environment configured for the CLI.
   * @returns the environment to start the CLI with.
   */
  apply(env: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const { platform, env: inherited, home, dirs } = this.options
    if (platform === 'win32' || env.PATH !== undefined) return env
    return { ...env, PATH: mergePaths(this.login, inherited.PATH, ...knownBinDirs(home, dirs)) }
  }
}

/**
 * Run a command outside the harness's subprocess service: this is a fact about the machine
 * the plugin runs on, read once, like the npx cache next to it.
 * @param argv - program and arguments.
 * @param signal - ends the command.
 * @returns the command's stdout.
 */
export function runShell(argv: readonly string[], signal: AbortSignal): Promise<string> {
  const [program, ...args] = argv
  return new Promise((resolve, reject) => {
    const child = execFile(
      program ?? POSIX_SHELL,
      args,
      { signal, timeout: SHELL_TIMEOUT_MS, maxBuffer: SHELL_MAX_OUTPUT_BYTES, encoding: 'utf8' },
      (error, stdout) => {
        if (error === null) resolve(stdout)
        else reject(new Error(`${program ?? POSIX_SHELL} failed: ${error.message}`, { cause: error }))
      },
    )
    // An interactive shell must not sit waiting for input nobody will type.
    child.stdin?.end()
  })
}

/** The real file system. */
export const diskDirs: DirProbe = {
  isDir: (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false,
  list: (path) => {
    try {
      return readdirSync(path)
    } catch {
      // No such directory (no nvm installed) simply means nothing to add.
      return []
    }
  },
}
