import { describe, expect, it, vi } from 'vitest'
import { createGitApi } from '../../../src/client/changes/changes-api.ts'
import type { Fetch } from '../../../src/client/changes/changes-api.ts'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createGitApi', () => {
  it('posts each operation with the working directory and returns its data', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.resolve(json(200, { success: true, data: { repo: false } })))
    const api = createGitApi(fetchFn, '/work')
    expect(await api.status()).toEqual({ repo: false })
    await api.commit({ message: 'm', paths: ['a'] })
    await api.createBranch('topic')
    await api.diff({ path: 'a', side: 'staged' })
    await api.checkout({ branch: 'origin/x', remote: true })
    await api.stage(['a'])
    await api.unstage(['a'])
    await api.discard({ tracked: ['a'], untracked: [] })
    await api.push()
    await api.pull()
    await api.branches()
    const calls = fetchFn.mock.calls.map(([url, init]) => [
      url,
      JSON.parse(typeof init.body === 'string' ? init.body : '') as unknown,
    ])
    expect(calls[0]).toEqual(['/dsh-ccgui/git/status', { cwd: '/work' }])
    expect(calls[1]).toEqual(['/dsh-ccgui/git/commit', { message: 'm', paths: ['a'], cwd: '/work' }])
    expect(calls[2]).toEqual(['/dsh-ccgui/git/create-branch', { branch: 'topic', cwd: '/work' }])
    expect(calls.map(([url]) => url)).toContain('/dsh-ccgui/git/branches')
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
  })

  it('rejects with the server’s message, or the status code when there is none', async () => {
    const refused = createGitApi(
      () => Promise.resolve(json(409, { success: false, error: '推送失败：rejected' })),
      '/w',
    )
    await expect(refused.push()).rejects.toThrow('推送失败：rejected')
    const html = createGitApi(() => Promise.resolve(new Response('<html>', { status: 502 })), '/w')
    await expect(html.status()).rejects.toThrow('请求失败（502）')
  })

  it('reports a network failure in words, keeping the cause', async () => {
    const cause = new TypeError('Failed to fetch')
    const api = createGitApi(() => Promise.reject(cause), '/w')
    const error: unknown = await api.status().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ message: '无法连接到 DSH 服务', cause })
  })
})
