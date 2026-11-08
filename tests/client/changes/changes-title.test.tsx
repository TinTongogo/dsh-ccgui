// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangesTitle } from '../../../src/client/changes/changes-title.tsx'

afterEach(() => {
  cleanup()
})

describe('ChangesTitle', () => {
  it('draws a glyph before the name, so a compact chip has something to show', () => {
    const { container } = render(<ChangesTitle />)
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('svg')
    expect(container.textContent).toBe('变更')
  })
})
