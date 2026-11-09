import { describe, expect, it } from 'vitest'
import { resolveWindowsCommand, startOnWindows } from '../src/windows-command.ts'
import type { FileProbe } from '../src/windows-command.ts'

const PATH = 'C:\\Windows\\System32;C:\\Users\\me\\AppData\\Roaming\\npm;C:\\Program Files\\nodejs'
const PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.JS'
const NPM_BIN = 'C:\\Users\\me\\AppData\\Roaming\\npm'
const NODE = 'C:\\Program Files\\nodejs\\node.exe'
const OMP_CLI = 'node_modules\\@oh-my-pi\\pi-coding-agent\\dist\\cli.js'

/** The shim `npm install -g` writes for a package bin, here with a `node` or `bun` shebang. */
const npmShim = (target: string, prog = 'node'): string => `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\${prog}.exe" (
  SET "_prog=%dp0%\\${prog}.exe"
) ELSE (
  SET "_prog=${prog}"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*
`

/** The shim pnpm writes for a global bin. */
const pnpmShim = (target: string): string => `@SETLOCAL
@IF NOT DEFINED NODE_PATH (
  @SET "NODE_PATH=C:\\pnpm\\global\\node_modules"
)
@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\${target}" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\${target}" %*
)
`

/** The shim npm writes for a bin with no shebang, run as it is. */
const directShim = (target: string): string => `@ECHO off
SETLOCAL
CALL :find_dp0
"%dp0%\\${target}"   %*
`

/** The `npx.cmd` the Node.js installer puts next to node.exe (npm 10 and later). */
const NODE_INSTALLER_NPX = `:: Created by npm, please don't edit manually.
@ECHO OFF

SETLOCAL

SET "NODE_EXE=%~dp0\\node.exe"
IF NOT EXIST "%NODE_EXE%" (
  SET "NODE_EXE=node"
)

SET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"
SET "NPX_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npx-cli.js"
FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (
  SET "NPM_PREFIX_NPX_CLI_JS=%%F\\node_modules\\npm\\bin\\npx-cli.js"
)
IF EXIST "%NPM_PREFIX_NPX_CLI_JS%" (
  SET "NPX_CLI_JS=%NPM_PREFIX_NPX_CLI_JS%"
)

"%NODE_EXE%" "%NPX_CLI_JS%" %*
`

const files = (entries: Readonly<Record<string, string>>): FileProbe => {
  const byLowerPath = new Map(Object.entries(entries).map(([path, content]) => [path.toLowerCase(), content]))
  return {
    isFile: (path) => byLowerPath.has(path.toLowerCase()),
    read: (path) => byLowerPath.get(path.toLowerCase()),
  }
}

const resolve = (argv: readonly string[], probe: FileProbe, env: Readonly<Record<string, string>> = {}) =>
  resolveWindowsCommand({ argv, env }, { path: PATH, pathExt: PATHEXT, files: probe })

describe('resolveWindowsCommand', () => {
  it('runs the script behind an npm shim with node, since a .cmd cannot start without a shell', () => {
    const probe = files({
      [`${NPM_BIN}\\codebuddy.cmd`]: npmShim('node_modules\\@tencent-ai\\codebuddy-code\\bin\\codebuddy'),
      [NODE]: '',
    })
    expect(resolve(['codebuddy', '--acp'], probe).argv).toEqual([
      NODE,
      `${NPM_BIN}\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\codebuddy`,
      '--acp',
    ])
  })

  it('starts npx the same way, so the npx-based CLIs work too', () => {
    const probe = files({
      'C:\\Program Files\\nodejs\\npx.cmd': npmShim('node_modules\\npm\\bin\\npx-cli.js'),
      [NODE]: '',
    })
    expect(resolve(['npx', '-y', 'pi-acp@0.0.34'], probe).argv).toEqual([
      NODE,
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      '-y',
      'pi-acp@0.0.34',
    ])
  })

  it('starts the npx.cmd the Node.js installer ships, which keeps its paths in variables', () => {
    const probe = files({ 'D:\\nodejs\\npx.cmd': NODE_INSTALLER_NPX, 'D:\\nodejs\\node.exe': '' })
    const result = resolveWindowsCommand(
      { argv: ['npx', '-y', 'pi-acp@0.0.34'], env: {} },
      { path: 'D:\\nodejs', pathExt: PATHEXT, files: probe },
    )
    expect(result.argv).toEqual([
      'D:\\nodejs\\node.exe',
      'D:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      '-y',
      'pi-acp@0.0.34',
    ])
  })

  it('falls back to the node on PATH when the installer npx.cmd has no node.exe beside it', () => {
    const probe = files({ 'D:\\nodejs\\npx.cmd': NODE_INSTALLER_NPX, [NODE]: '' })
    const result = resolveWindowsCommand(
      { argv: ['npx'], env: {} },
      { path: `D:\\nodejs;C:\\Program Files\\nodejs`, pathExt: PATHEXT, files: probe },
    )
    expect(result.argv).toEqual([NODE, 'D:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js'])
  })

  it('refuses a variable launch line whose script is not beside the shim', () => {
    const probe = files({ [`${NPM_BIN}\\odd.cmd`]: '@SET "A=node"\r\n@SET "B=C:\\x.js"\r\n"%A%" "%B%" %*\r\n' })
    expect(() => resolve(['odd'], probe)).toThrow(/odd\.cmd/)
  })

  it('prefers the node.exe next to the shim, as the shim itself does', () => {
    const probe = files({
      [`${NPM_BIN}\\omp.cmd`]: npmShim('node_modules\\omp\\cli.js'),
      [`${NPM_BIN}\\node.exe`]: '',
      [NODE]: '',
    })
    expect(resolve(['omp', 'acp'], probe).argv[0]).toBe(`${NPM_BIN}\\node.exe`)
  })

  it('runs a bun-shebang script with the bun.exe on PATH, as the shim would', () => {
    const probe = files({
      [`${NPM_BIN}\\omp.cmd`]: npmShim(OMP_CLI, 'bun'),
      'C:\\Users\\me\\.bun\\bin\\bun.exe': '',
    })
    const result = resolve(['omp', 'acp'], probe, { PATH: `C:\\Users\\me\\.bun\\bin;${NPM_BIN}` })
    expect(result.argv).toEqual(['C:\\Users\\me\\.bun\\bin\\bun.exe', `${NPM_BIN}\\${OMP_CLI}`, 'acp'])
  })

  it('follows an interpreter that is itself a shim, as with bun installed through npm', () => {
    const probe = files({
      [`${NPM_BIN}\\omp.cmd`]: npmShim(OMP_CLI, 'bun'),
      [`${NPM_BIN}\\bun.cmd`]: directShim('node_modules\\bun\\bin\\bun.exe'),
    })
    expect(resolve(['omp', 'acp'], probe).argv).toEqual([
      `${NPM_BIN}\\node_modules\\bun\\bin\\bun.exe`,
      `${NPM_BIN}\\${OMP_CLI}`,
      'acp',
    ])
  })

  it('prefers the bun.exe next to the shim, as the shim itself does', () => {
    const probe = files({
      [`${NPM_BIN}\\omp.cmd`]: npmShim(OMP_CLI, 'bun'),
      [`${NPM_BIN}\\bun.exe`]: '',
      [`${NPM_BIN}\\bun.cmd`]: directShim('node_modules\\bun\\bin\\bun.exe'),
    })
    expect(resolve(['omp', 'acp'], probe).argv[0]).toBe(`${NPM_BIN}\\bun.exe`)
  })

  it('says which interpreter is missing when a shim needs one that is not installed', () => {
    const probe = files({ [`${NPM_BIN}\\omp.cmd`]: npmShim(OMP_CLI, 'bun') })
    expect(() => resolve(['omp', 'acp'], probe)).toThrow(/bun.*omp\.cmd/)
  })

  it('stops following shims that lead back to themselves', () => {
    const probe = files({ [`${NPM_BIN}\\loop.cmd`]: npmShim('loop.js', 'loop') })
    expect(() => resolve(['loop'], probe)).toThrow(/loop\.cmd/)
  })

  it('understands the shims pnpm writes', () => {
    const probe = files({ [`${NPM_BIN}\\opencode.cmd`]: pnpmShim('..\\opencode-ai\\bin\\opencode'), [NODE]: '' })
    expect(resolve(['opencode', 'acp'], probe).argv).toEqual([
      NODE,
      'C:\\Users\\me\\AppData\\Roaming\\opencode-ai\\bin\\opencode',
      'acp',
    ])
  })

  it('runs an executable behind a shim directly', () => {
    const probe = files({ [`${NPM_BIN}\\opencode.cmd`]: directShim('node_modules\\opencode-ai\\bin\\opencode.exe') })
    expect(resolve(['opencode', 'acp'], probe).argv).toEqual([
      `${NPM_BIN}\\node_modules\\opencode-ai\\bin\\opencode.exe`,
      'acp',
    ])
  })

  it('gives an executable its full path and leaves the arguments alone', () => {
    const probe = files({ [`${NPM_BIN}\\kimi.exe`]: '', [`${NPM_BIN}\\kimi.cmd`]: npmShim('x.js') })
    expect(resolve(['kimi', 'a b', '"q"'], probe).argv).toEqual([`${NPM_BIN}\\kimi.exe`, 'a b', '"q"'])
  })

  it('follows PATHEXT order and matches extensions without regard to case', () => {
    const probe = files({
      [`${NPM_BIN}\\tool.CMD`]: npmShim('t.js'),
      [`${NPM_BIN}\\tool.bat`]: npmShim('b.js'),
      [NODE]: '',
    })
    expect(resolve(['tool'], probe).argv[1]).toBe(`${NPM_BIN}\\b.js`)
  })

  it('looks a configured path up with the extensions too', () => {
    const probe = files({ 'D:\\tools\\cli.cmd': npmShim('cli.js'), 'D:\\tools\\cli': '#!/bin/sh', [NODE]: '' })
    expect(resolve(['D:\\tools\\cli', 'acp'], probe).argv).toEqual([NODE, 'D:\\tools\\cli.js', 'acp'])
  })

  it('takes a configured path with its extension as it is', () => {
    const probe = files({ 'D:\\tools\\cli.exe': '' })
    expect(resolve(['D:\\tools\\cli.exe'], probe).argv).toEqual(['D:\\tools\\cli.exe'])
  })

  it('searches the PATH the CLI is configured with first', () => {
    const probe = files({ 'E:\\bin\\codebuddy.exe': '', [`${NPM_BIN}\\codebuddy.exe`]: '' })
    expect(resolve(['codebuddy'], probe, { PATH: 'E:\\bin' }).argv).toEqual(['E:\\bin\\codebuddy.exe'])
  })

  it('skips empty and quoted PATH entries the way Windows reads them', () => {
    const probe = files({ 'C:\\My Tools\\cli.exe': '' })
    const result = resolveWindowsCommand(
      { argv: ['cli'], env: {} },
      { path: ';"C:\\My Tools";', pathExt: undefined, files: probe },
    )
    expect(result.argv).toEqual(['C:\\My Tools\\cli.exe'])
  })

  it('keeps the environment it was given', () => {
    const probe = files({ [`${NPM_BIN}\\kimi.exe`]: '' })
    expect(resolve(['kimi'], probe, { KIMI_KEY: 'k' }).env).toEqual({ KIMI_KEY: 'k' })
  })

  it('leaves a command it cannot find to the spawn, which reports it as missing', () => {
    expect(resolve(['nowhere', 'acp'], files({})).argv).toEqual(['nowhere', 'acp'])
  })

  it('leaves a command without a program alone', () => {
    expect(resolve([], files({})).argv).toEqual([])
  })

  it('says what to configure when a batch file cannot be run without a shell', () => {
    const probe = files({ [`${NPM_BIN}\\odd.bat`]: '@echo off\r\nbash "%~dp0\\odd.sh" %*\r\n' })
    expect(() => resolve(['odd'], probe)).toThrow(/odd\.bat.*command/)
  })

  it('refuses a shim that starts a script with no interpreter', () => {
    const probe = files({ [`${NPM_BIN}\\odd.cmd`]: directShim('odd.sh') })
    expect(() => resolve(['odd'], probe)).toThrow(/odd\.cmd/)
  })

  it('says so when the node a shim needs is not installed', () => {
    const probe = files({ [`${NPM_BIN}\\codebuddy.cmd`]: npmShim('cb.js') })
    expect(() => resolve(['codebuddy'], probe)).toThrow(/node/)
  })

  it('says so when the shim cannot be read', () => {
    const probe: FileProbe = { isFile: (path) => path.endsWith('.cmd'), read: () => undefined }
    expect(() => resolve(['codebuddy'], probe)).toThrow(/codebuddy\.cmd/)
  })
})

describe('startOnWindows', () => {
  it('changes nothing on other platforms', () => {
    const command = { argv: ['codebuddy', '--acp'], env: {} }
    expect(startOnWindows(command, 'darwin', {})).toBe(command)
    expect(startOnWindows(command, 'linux', {})).toBe(command)
  })

  it('leaves a missing command alone on Windows, reading the real file system', () => {
    const command = { argv: ['dsh-ccgui-no-such-cli', '--acp'], env: {} }
    expect(startOnWindows(command, 'win32', { PATH: 'Z:\\nowhere' }).argv).toEqual(command.argv)
  })
})
