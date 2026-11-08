import { spawn } from 'node:child_process'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

function reader(chunks: () => string) {
  return {
    readFrom: (fromByte: number) => {
      const text = chunks().slice(fromByte)
      return { text, nextOffset: fromByte + text.length, lossy: false }
    },
  }
}

/**
 * Stand-in for `ctx.subprocess.spawn` that collects output the way the harness does for a
 * collect-mode stream, so git helpers can run against a real repository in a test.
 * @param spec - the spawn request.
 * @returns a handle whose collected readers hold the whole output.
 */
export function collectingSpawn(spec: SubprocessSpawnSpec): SubprocessHandle {
  const [command, ...args] = spec.argv
  if (command === undefined) throw new Error('empty argv')
  const child = spawn(command, args, { cwd: spec.cwd, env: { ...process.env, ...spec.env } })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (text: string) => (stdout += text))
  child.stderr.setEncoding('utf8').on('data', (text: string) => (stderr += text))
  const input = spec.stdio.stdin
  if (typeof input === 'object') child.stdin.end(input.data)
  else child.stdin.end()
  const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode, signal) => {
      resolve({ exitCode, signal })
    })
  })
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: { stdout: reader(() => stdout), stderr: reader(() => stderr) },
    done,
    terminate: () => child.kill(),
    waitForExit: async () => {
      await done
      return true
    },
  }
}
