// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Adding a CLI touches three places that must agree:
 *   1. cordis.patch.yml               the `agents` list (id / name / command)
 *   2. src/client/provider-marks.ts   `OWN_MARKS`, mapping `cliRoute(id)` to a mark id
 *   3. src/client/marks.tsx           the drawing for that mark id in `ProviderMark`
 * These tests fail with a message naming the file to edit when one of them is forgotten.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { CLI_ROUTE_PREFIX, cliRoute } from '../src/constants.ts'
import { ProviderMark } from '../src/client/marks.tsx'
import { markOf, ownMarkRoutes } from '../src/client/provider-marks.ts'

// Plain paths: under jsdom the global URL is jsdom's, which node:fs does not accept.
const PATCH_FILE = join(import.meta.dirname, '..', 'cordis.patch.yml')

/**
 * Bundled agents that intentionally draw the generic prompt mark instead of a brand of their own.
 * Empty today: every bundled CLI has its own mark. Add an id here only on purpose.
 */
const GENERIC_MARK_ALLOWED: ReadonlySet<string> = new Set<string>()

interface AgentEntry {
  readonly id: string
  readonly name: string
  readonly command: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : []
}

function toAgent(raw: unknown, index: number): AgentEntry {
  if (!isRecord(raw)) throw new Error(`cordis.patch.yml: agents[${index}] is not a mapping`)
  const { id, name, command } = raw
  if (typeof id !== 'string' || typeof name !== 'string' || typeof command !== 'string')
    throw new Error(`cordis.patch.yml: agents[${index}] needs string id, name and command`)
  return { id, name, command }
}

/** The `agents` list of the dsh-ccgui entry in the patch's `insert` operations. */
function bundledAgents(): readonly AgentEntry[] {
  const patch: unknown = parse(readFileSync(PATCH_FILE, 'utf8'))
  if (!Array.isArray(patch)) throw new Error('cordis.patch.yml: expected a list of patch operations')
  const inserted = listOf(patch).flatMap((operation) => (isRecord(operation) ? listOf(operation.insert) : []))
  const plugin = inserted.find((entry) => isRecord(entry) && entry.name === 'dsh-ccgui')
  const config = isRecord(plugin) ? plugin.config : undefined
  const agents = isRecord(config) ? config.agents : undefined
  if (!Array.isArray(agents)) throw new Error('cordis.patch.yml: no config.agents list under dsh-ccgui')
  return agents.map(toAgent)
}

/** The agent ids `OWN_MARKS` gives a mark of their own. */
function ownMarkIds(): readonly string[] {
  return ownMarkRoutes().map((route) => route.slice(CLI_ROUTE_PREFIX.length))
}

const agents = bundledAgents()
const agentIds = agents.map((agent) => agent.id)

afterEach(() => {
  cleanup()
})

describe('CLI registry consistency', () => {
  it('reads a non-empty agents list from cordis.patch.yml', () => {
    expect(agents.length).toBeGreaterThan(0)
    expect(ownMarkIds().length).toBeGreaterThan(0)
  })

  it('has unique agent ids in cordis.patch.yml', () => {
    const duplicates = agentIds.filter((id, index) => agentIds.indexOf(id) !== index)
    expect(duplicates, `cordis.patch.yml lists these agent ids more than once: ${duplicates.join(', ')}`).toEqual([])
  })

  it.each(agents)('gives agent $id ($name) a mark of its own', ({ id }) => {
    const mark = markOf(cliRoute(id))
    if (GENERIC_MARK_ALLOWED.has(id)) {
      expect(mark, `"${id}" is in GENERIC_MARK_ALLOWED, so it should draw the generic 'cli' mark`).toBe('cli')
      return
    }
    expect(
      mark,
      `Agent "${id}" from cordis.patch.yml has no mark of its own. Add [cliRoute('${id}'), '${id}'] to OWN_MARKS ` +
        `and '${id}' to ProviderMarkId in src/client/provider-marks.ts, then a drawing for it in src/client/marks.tsx ` +
        `(or list it in GENERIC_MARK_ALLOWED in this test if the generic mark is intended).`,
    ).not.toBe('cli')
  })

  it('has no OWN_MARKS entry for a CLI that cordis.patch.yml does not bundle', () => {
    const stale = ownMarkIds().filter((id) => !agentIds.includes(id))
    expect(
      stale,
      `src/client/provider-marks.ts OWN_MARKS lists ${stale.map((id) => `cliRoute('${id}')`).join(', ')}, ` +
        `but cordis.patch.yml has no agent with that id. Remove the entry or add the agent.`,
    ).toEqual([])
  })

  it('agrees on the OWN_MARKS ids and what markOf returns', () => {
    for (const id of ownMarkIds()) {
      expect(markOf(cliRoute(id)), `OWN_MARKS entry for "${id}" is not picked up by markOf`).not.toBe('cli')
    }
  })

  it.each(agents)('draws a mark for agent $id in ProviderMark', ({ id }) => {
    const mark = markOf(cliRoute(id))
    const svg = render(createElement(ProviderMark, { provider: cliRoute(id), size: 14 })).container.querySelector('svg')
    expect(svg, `ProviderMark in src/client/marks.tsx renders nothing for cliRoute('${id}')`).not.toBeNull()
    expect(svg?.getAttribute('data-cli-mark')).toBe(mark)
    // Children only: the wrapper differs by its data-cli-mark even when the drawing is the fallback.
    const generic = render(
      createElement(ProviderMark, { provider: 'cli-no-such-cli', size: 14 }),
    ).container.querySelector('svg')?.innerHTML
    if (mark !== 'cli')
      expect(
        svg?.innerHTML,
        `src/client/marks.tsx has no drawing for mark '${mark ?? ''}' (agent "${id}"): ProviderMark falls back to ` +
          `the generic prompt. Add it to MONOCHROME or COLORED, or give it a component like OmpMark.`,
      ).not.toBe(generic)
  })
})
