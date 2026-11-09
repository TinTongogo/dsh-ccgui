/**
 * Turns a configured command into one Windows can start without a shell. The harness spawns
 * with CreateProcess and never through `cmd.exe`, which finds only `.exe` and `.com` files by
 * bare name and, since Node's fix for CVE-2024-27980, refuses `.cmd` and `.bat` outright. Yet
 * `npx`, `codebuddy`, `opencode` and most CLIs installed through a package manager are `.cmd`
 * shims on Windows.
 *
 * Wrapping the shim in `cmd.exe /c` is not an option: the spawn seam has no verbatim-argument
 * switch, so Node's quoting of the command line would break cmd's own parsing. Instead, the
 * shim is read for the script it starts, and that script is run with the shim's interpreter
 * directly, the way the shim would have run it. The interpreter is often not node: npm writes
 * `bun` into the shim of a package whose bin has a bun shebang, such as OMP CLI.
 * @module dsh-ccgui/windows-command
 */

import { readFileSync, statSync } from 'node:fs'
import { win32 } from 'node:path'
import type { CliCommand } from './npx-cache.ts'

/** What the lookup needs from the file system; separate so tests need not run on Windows. */
export interface FileProbe {
  readonly isFile: (path: string) => boolean
  readonly read: (path: string) => string | undefined
}

/** Where to look. */
export interface WindowsLookup {
  readonly path: string | undefined
  readonly pathExt: string | undefined
  readonly files: FileProbe
}

/** What Windows itself falls back to when PATHEXT is unset. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'
const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.exe', '.com'])
const BATCH_EXTENSIONS: ReadonlySet<string> = new Set(['.cmd', '.bat'])
const EXE = '.exe'
/** What npm's shim runs when it names no other interpreter. */
const DEFAULT_INTERPRETER = 'node'
/** A shim's interpreter may itself be a shim (bun installed through npm); cycles end here. */
const MAX_SHIM_DEPTH = 4
/** The variable npm's shim keeps its interpreter in. */
const NPM_PROG = '%_prog%'
/**
 * The line npm and pnpm shims start their target on: an optional interpreter, then the
 * target relative to the shim's own folder, then all arguments. Spaces only between the
 * parts, so the interpreter never comes from the line before.
 */
const SHIM_LAUNCH = /(?:("[^"]*"|[^\s"]+)[ \t]+)?"%~?dp0%?\\([^"]*)"[ \t]+%\*/g
const NPM_PROG_VALUE = /SET "_prog=([^"]+)"/g

interface ShimLaunch {
  readonly interpreter: string | undefined
  readonly target: string
}

const unquote = (text: string): string => text.replace(/^"(.*)"$/, '$1')

function extensions(pathExt: string | undefined): readonly string[] {
  return (pathExt ?? DEFAULT_PATHEXT)
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.startsWith('.'))
}

function searchDirs(name: string, path: string | undefined): readonly string[] {
  if (win32.basename(name) !== name) return ['']
  return (path ?? '')
    .split(';')
    .map((dir) => unquote(dir.trim()))
    .filter((dir) => dir !== '')
}

/**
 * Find the file Windows would run for `name`. A file without one of the PATHEXT extensions is
 * skipped even under its exact name: next to each `.cmd`, npm also leaves a `sh` script with
 * no extension, which CreateProcess cannot run.
 */
function locate(name: string, { path, pathExt, files }: WindowsLookup): string | undefined {
  const exts = extensions(pathExt)
  const named = exts.includes(win32.extname(name).toLowerCase())
  const candidates = named ? [name] : exts.map((ext) => `${name}${ext}`)
  for (const dir of searchDirs(name, path)) {
    const found = candidates.map((file) => win32.join(dir, file)).find((file) => files.isFile(file))
    if (found !== undefined) return found
  }
  return undefined
}

function readLaunch(shim: string): ShimLaunch | undefined {
  const [last] = [...shim.matchAll(SHIM_LAUNCH)].slice(-1)
  const target = last?.[2]
  if (last === undefined || target === undefined) return undefined
  const interpreter = last[1] === undefined ? undefined : unquote(last[1])
  if (interpreter?.toLowerCase() !== NPM_PROG) return { interpreter, target }
  // npm picks `<prog>.exe` beside the shim when there is one, otherwise the value without dp0.
  const fallback = [...shim.matchAll(NPM_PROG_VALUE)].map((match) => match[1]).find((value) => !value?.includes('dp0'))
  return { interpreter: fallback ?? DEFAULT_INTERPRETER, target }
}

function unsupported(shim: string): Error {
  return new Error(
    `无法在不经过命令行的情况下启动 ${shim}。请在配置里把这个 CLI 的 command 改成 .exe 或它的 node 脚本的完整路径。`,
  )
}

function missingInterpreter(interpreter: string, shim: string): Error {
  return new Error(
    `找不到 ${interpreter}：启动 ${shim} 需要它。请先安装 ${interpreter} 并加入 PATH，或在配置里把这个 CLI 的 command 改成 .exe 的完整路径。`,
  )
}

/**
 * The argv prefix that starts a shim's interpreter. npm's shims prefer `<name>.exe` beside
 * themselves, then fall back to PATH, where the interpreter may in turn be a shim.
 */
function interpreterArgv(interpreter: string, shim: string, lookup: WindowsLookup, depth: number): readonly string[] {
  const shimDir = win32.dirname(shim)
  const bare = win32.basename(interpreter) === interpreter
  const beside = win32.join(shimDir, win32.extname(interpreter) === '' ? `${interpreter}${EXE}` : interpreter)
  if (bare && lookup.files.isFile(beside)) return [beside]
  const found = locate(interpreter, lookup)
  if (found === undefined) throw missingInterpreter(interpreter, shim)
  const ext = win32.extname(found).toLowerCase()
  if (EXECUTABLE_EXTENSIONS.has(ext)) return [found]
  if (BATCH_EXTENSIONS.has(ext) && depth < MAX_SHIM_DEPTH) return argvForShim(found, [], lookup, depth + 1)
  throw unsupported(shim)
}

function argvForShim(shim: string, args: readonly string[], lookup: WindowsLookup, depth: number): readonly string[] {
  const text = lookup.files.read(shim)
  const launch = text === undefined ? undefined : readLaunch(text)
  if (launch === undefined) throw unsupported(shim)
  const shimDir = win32.dirname(shim)
  const target = win32.resolve(shimDir, launch.target)
  if (launch.interpreter === undefined) {
    if (EXECUTABLE_EXTENSIONS.has(win32.extname(target).toLowerCase())) return [target, ...args]
    throw unsupported(shim)
  }
  return [...interpreterArgv(launch.interpreter, shim, lookup, depth), target, ...args]
}

/**
 * Resolve a command the way a Windows shell would, without the shell.
 * @param command - the command as configured.
 * @param lookup - where to look.
 * @returns the command with a program CreateProcess can start; unchanged when the program is
 *   not found, so the spawn reports it as missing.
 * @throws Error when the program is a batch file that only a shell could run.
 */
export function resolveWindowsCommand(command: CliCommand, lookup: WindowsLookup): CliCommand {
  const [program, ...args] = command.argv
  if (program === undefined) return command
  // The child runs with this PATH, so the shim's interpreter is looked up in it as well.
  const effective = { ...lookup, path: command.env.PATH ?? lookup.path }
  const found = locate(program, effective)
  if (found === undefined) return command
  const ext = win32.extname(found).toLowerCase()
  if (BATCH_EXTENSIONS.has(ext)) return { ...command, argv: argvForShim(found, args, effective, 0) }
  return { ...command, argv: [found, ...args] }
}

const diskFiles: FileProbe = {
  isFile: (path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false,
  read: (path) => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      // An unreadable shim is reported by the caller, with the path, as one it cannot run.
      return undefined
    }
  },
}

/**
 * On Windows, resolve the command against the real file system; elsewhere, leave it alone.
 * @param command - the command as configured.
 * @param platform - the current platform.
 * @param env - the process environment, for PATH and PATHEXT.
 * @returns the command to spawn.
 */
export function startOnWindows(
  command: CliCommand,
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): CliCommand {
  if (platform !== 'win32') return command
  return resolveWindowsCommand(command, { path: env.PATH, pathExt: env.PATHEXT, files: diskFiles })
}
