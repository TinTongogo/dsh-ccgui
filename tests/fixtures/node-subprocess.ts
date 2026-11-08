import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** One process started through {@link NodeSubprocess}. */
export interface SpawnedProcess {
  readonly spec: SubprocessSpawnSpec
  readonly child: ChildProcess
  readonly done: Promise<SubprocessOutcome>
}

/**
 * Stand-in for the harness's `ctx.subprocess` seam over `node:child_process`, so a
 * test can run a real ACP process and see every spec the plugin asked for.
 */
export class NodeSubprocess {
  spawned: readonly SpawnedProcess[] = []

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const [command, ...args] = spec.argv
    if (command === undefined) throw new Error('empty argv')
    const child = spawn(command, args, { cwd: spec.cwd, env: spec.env, stdio: ['pipe', 'pipe', 'ignore'] })
    const done = new Promise<SubprocessOutcome>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode, signal) => {
        resolve({ exitCode, signal })
      })
    })
    this.spawned = [...this.spawned, { spec, child, done }]
    const exited = done.then(
      () => true,
      () => true,
    )
    return {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: undefined,
      control: undefined,
      collected: {},
      done,
      terminate: () => {
        child.kill('SIGKILL')
      },
      waitForExit: (signal?: AbortSignal) =>
        Promise.race([
          exited,
          new Promise<boolean>((resolve) => {
            signal?.addEventListener(
              'abort',
              () => {
                resolve(false)
              },
              { once: true },
            )
          }),
        ]),
    }
  }

  /** Settles once every process started so far has exited. */
  async allExited(): Promise<void> {
    await Promise.allSettled(this.spawned.map(({ done }) => done))
  }
}
