// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkGlyph, ProviderMark } from '../../src/client/marks.tsx'

afterEach(() => {
  cleanup()
})

function markOn(provider: string, size = 14): SVGSVGElement | null {
  return render(<ProviderMark provider={provider} size={size} />).container.querySelector('svg')
}

describe('ProviderMark', () => {
  it.each([
    // [provider route, mark id, how it is painted]
    ['cli-claude', 'claude', '#D97757'],
    ['deepseek-official', 'deepseek', '#4D6BFE'],
    ['cli-codex', 'codex', 'currentColor'],
    ['cli-pi', 'pi', 'currentColor'],
    ['cli-opencode', 'opencode', 'currentColor'],
    ['cli-omp', 'omp', 'url(#'],
    ['cli-codebuddy', 'codebuddy', 'url(#'],
    ['cli-kimi', 'kimi', 'currentColor'],
    ['cli-someone-elses', 'cli', 'currentColor'],
  ])('draws %s as the %s mark', (provider, mark, paint) => {
    const svg = markOn(provider)
    expect(svg?.getAttribute('data-cli-mark')).toBe(mark)
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(svg?.outerHTML).toContain(paint)
  })

  it('draws at the requested size', () => {
    const svg = markOn('cli-codex', 20)
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
  })

  it('draws nothing for a provider nothing is known about', () => {
    expect(markOn('openrouter')).toBeNull()
  })

  // Several gradient marks on one page must each paint with their own gradient.
  it.each(['cli-omp', 'cli-codebuddy'])('gives each %s mark its own gradient', (provider) => {
    const { container } = render(
      <>
        <ProviderMark provider={provider} size={14} />
        <ProviderMark provider={provider} size={14} />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('linearGradient, radialGradient'), (node) => node.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id).not.toContain(':')
      expect(container.querySelector(`path[fill="url(#${id})"]`)).not.toBeNull()
    }
  })
})

describe('MarkGlyph', () => {
  it('draws a mark by its id', () => {
    const svg = render(<MarkGlyph id="kimi" size={14} />).container.querySelector('svg')
    expect(svg?.getAttribute('data-cli-mark')).toBe('kimi')
  })
})
