import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const AGENT = /^ {10}- id: (\S+)\n {12}name: (.+)$/gm

describe('the default CLIs', () => {
  // This plugin brings desktop-cc-gui's experience to DSH, so these follow its
  // `CLI_DISPLAY_NAMES` for the names and its `ENGINE_IDS` for the order.
  it('match desktop-cc-gui in name and order', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect([...patch.matchAll(AGENT)].map(([, id, name]) => [id, name])).toEqual([
      ['claude', 'Claude Code'],
      ['codex', 'Codex CLI'],
      ['pi', 'PI CLI'],
      ['omp', 'OMP CLI'],
      ['opencode', 'OpenCode'],
      ['codebuddy', 'CodeBuddy CLI'],
    ])
  })
})
