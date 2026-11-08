import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gitHandler, registerGitRoutes } from '../../src/git/git-routes.ts'
import type { GitConnection } from '../../src/git/git-routes.ts'
import { GIT_ROUTE_PREFIX } from '../../src/constants.ts'
import { collectingSpawn } from '../fixtures/collecting-subprocess.ts'

let server: Server
let base = ''
let repo = ''
let rejection: 401 | 403 | undefined
const warn = vi.fn<(message: string) => void>()
const connection: GitConnection = { requestRejection: () => rejection }

beforeEach(async () => {
  rejection = undefined
  warn.mockClear()
  repo = mkdtempSync(join(tmpdir(), 'ccgui-routes-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  server = createServer((req, res) => {
    void gitHandler(collectingSpawn, connection, warn)(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}${GIT_ROUTE_PREFIX}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  rmSync(repo, { recursive: true, force: true })
})

const post = (operation: string, body: unknown): Promise<Response> =>
  fetch(`${base}/${operation}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('git routes', () => {
  it('answers a status request', async () => {
    const response = await post('status', { cwd: repo })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ success: true, data: { repo: true, branch: 'main', staged: [] } })
  })

  it('refuses a request the connection rejects before reading it', async () => {
    rejection = 401
    const response = await post('status', { cwd: repo })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ success: false, error: '未授权' })
  })

  it('accepts only POST and known operations', async () => {
    const get = await fetch(`${base}/status`)
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect((await post('rm', { cwd: repo })).status).toBe(404)
  })

  it('maps bad JSON, bad requests, git refusals and oversized bodies to their statuses', async () => {
    expect((await post('status', '{')).status).toBe(400)
    expect((await post('status', { cwd: 'relative' })).status).toBe(400)
    const refused = await post('stage', { cwd: repo, paths: ['missing.txt'] })
    expect(refused.status).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toContain('暂存失败')
    expect((await post('status', 'x'.repeat(1024 * 1024 + 1))).status).toBe(413)
    expect(warn).not.toHaveBeenCalled()
  })

  it('hides unexpected failures behind a generic message and logs them', async () => {
    const failing = createServer((req, res) => {
      void gitHandler(
        () => {
          throw new Error('spawn exploded')
        },
        connection,
        warn,
      )(req, res)
    })
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve))
    const port = String((failing.address() as AddressInfo).port)
    const response = await fetch(`http://127.0.0.1:${port}${GIT_ROUTE_PREFIX}/status`, {
      method: 'POST',
      body: JSON.stringify({ cwd: repo }),
    })
    await new Promise((resolve) => failing.close(resolve))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ success: false, error: 'Git 操作失败，请查看日志' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('spawn exploded'))
  })

  it('registers one prefix route', () => {
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    const handler = gitHandler(collectingSpawn, connection, warn)
    expect(registerGitRoutes({ register }, handler)).toBe(dispose)
    expect(register).toHaveBeenCalledWith({ kind: 'prefix', path: GIT_ROUTE_PREFIX, handler })
  })
})
