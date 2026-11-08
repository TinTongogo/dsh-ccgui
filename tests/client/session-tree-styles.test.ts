import { describe, expect, it } from 'vitest'
import { SESSION_TREE_STYLES } from '../../src/client/session-tree-styles.ts'

const rules = (): string[] =>
  SESSION_TREE_STYLES.split('}')
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)

describe('SESSION_TREE_STYLES', () => {
  // The harness renders a flat "in one list" mode too; a tree line there would point at nothing.
  it('only touches sessions listed under a workspace row', () => {
    for (const rule of rules()) expect(rule).toContain(':has(> * > [data-row-key^="workspace:"])')
  })

  // CSS module names carry a per-build hash, so only the prefix-free suffix can be matched.
  it('never depends on a hashed class name', () => {
    expect(SESSION_TREE_STYLES).not.toMatch(/\.[A-Za-z0-9-]+_[A-Za-z]/)
  })

  it('draws an elbow into every session and continues the line only past the last one', () => {
    expect(SESSION_TREE_STYLES).toMatch(
      /:has\(> \[data-row-key\^="session:"\]\)::before \{[^}]*border-bottom-left-radius/,
    )
    expect(SESSION_TREE_STYLES).toContain(
      ':has(> [data-row-key^="session:"]):not(:nth-last-child(1 of :has(> [data-row-key^="session:"])))::after',
    )
  })

  // A nested `:has()` is invalid and would silently drop the whole rule.
  it('never nests :has()', () => {
    expect(SESSION_TREE_STYLES).not.toMatch(/:has\([^)]*:has\(/)
  })

  // The first elbow reaches up to the folder icon instead of starting at its own row.
  it('joins the first session to the workspace folder', () => {
    expect(SESSION_TREE_STYLES).toContain(
      ':has(> [data-row-key^="workspace:"]) + :has(> [data-row-key^="session:"])::before',
    )
  })

  // Nested workspaces shift their folder by this amount, so the line has to follow it.
  it("follows the harness's nested workspace indent", () => {
    expect(SESSION_TREE_STYLES).toContain('var(--dsh-workspace-indent, 0px)')
  })

  it('moves the overflow button in line with the indented rows', () => {
    expect(SESSION_TREE_STYLES).toContain(':has(> * > [data-row-key^="workspace:"]) > button')
  })
})
