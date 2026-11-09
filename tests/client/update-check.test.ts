import { describe, expect, it, vi } from 'vitest'
import {
  LATEST_RELEASE_API,
  checkForUpdate,
  createUpdateChecker,
  isNewerVersion,
} from '../../src/client/update-check.ts'
import type { Fetch } from '../../src/client/update-check.ts'

const PAGE = 'https://github.com/zhukunpenglinyutong/dsh-ccgui/releases/tag/v1.0.2'

function respond(body: unknown, status = 200): Fetch {
  return vi.fn<Fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
}

describe('isNewerVersion', () => {
  it.each([
    ['1.0.2', '1.0.1', true],
    ['v1.1.0', '1.0.9', true],
    ['2.0.0', '1.9.9', true],
    ['1.0.1', '1.0.1', false],
    ['1.0.0', '1.0.1', false],
    ['0.9.9', '1.0.0', false],
    ['1.0.2-beta.1', '1.0.1', false],
    ['1.0.2', '开发版', false],
  ])('%s over %s is %s', (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected)
  })
})

describe('checkForUpdate', () => {
  it("reports a newer release with its page, asking GitHub's latest-release API", async () => {
    const fetchFn = respond({ tag_name: 'v1.0.2', html_url: PAGE })
    await expect(checkForUpdate(fetchFn, '1.0.1')).resolves.toEqual({ version: '1.0.2', url: PAGE })
    expect(vi.mocked(fetchFn).mock.calls[0]?.[0]).toBe(LATEST_RELEASE_API)
  })

  it('falls back to the tag page when the link is missing or leaves the repository', async () => {
    const elsewhere = respond({ tag_name: 'v1.0.2', html_url: 'https://evil.example/' })
    await expect(checkForUpdate(elsewhere, '1.0.1')).resolves.toEqual({ version: '1.0.2', url: PAGE })
    await expect(checkForUpdate(respond({ tag_name: 'v1.0.2' }), '1.0.1')).resolves.toEqual({
      version: '1.0.2',
      url: PAGE,
    })
  })

  it('reports nothing when the latest release is not newer', async () => {
    await expect(checkForUpdate(respond({ tag_name: 'v1.0.1', html_url: PAGE }), '1.0.1')).resolves.toBeUndefined()
  })

  it('reports nothing for a failed, malformed or rejected response', async () => {
    await expect(checkForUpdate(respond({ message: 'rate limited' }, 403), '1.0.1')).resolves.toBeUndefined()
    await expect(checkForUpdate(respond(null), '1.0.1')).resolves.toBeUndefined()
    await expect(checkForUpdate(respond({ tag_name: 3 }), '1.0.1')).resolves.toBeUndefined()
    const offline = vi.fn<Fetch>(() => Promise.reject(new TypeError('offline')))
    await expect(checkForUpdate(offline, '1.0.1')).resolves.toBeUndefined()
  })

  it('never asks from a development build', async () => {
    const fetchFn = respond({ tag_name: 'v9.9.9' })
    await expect(checkForUpdate(fetchFn, '开发版')).resolves.toBeUndefined()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('createUpdateChecker', () => {
  it('asks once and shares the answer', async () => {
    const fetchFn = respond({ tag_name: 'v1.0.2', html_url: PAGE })
    const check = createUpdateChecker(fetchFn, '1.0.1')
    const [first, second] = await Promise.all([check(), check()])
    expect(first).toEqual({ version: '1.0.2', url: PAGE })
    expect(second).toBe(first)
    await check()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
