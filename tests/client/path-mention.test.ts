import { describe, expect, it } from 'vitest'
import { mentionToken } from '../../src/client/path-mention.ts'

describe('mentionToken', () => {
  it('turns a path into an @ mention followed by a space', () => {
    expect(mentionToken('/repo/src/index.ts')).toBe('@/repo/src/index.ts ')
  })

  it('quotes a path that contains whitespace', () => {
    expect(mentionToken('/Users/me/DSH 项目/a.ts')).toBe('@"/Users/me/DSH 项目/a.ts" ')
  })

  it('uses forward slashes for Windows paths', () => {
    expect(mentionToken('C:\\repo\\src\\a.ts')).toBe('@C:/repo/src/a.ts ')
  })

  it('ignores surrounding whitespace', () => {
    expect(mentionToken('  /repo/a.ts\n')).toBe('@/repo/a.ts ')
  })
})
