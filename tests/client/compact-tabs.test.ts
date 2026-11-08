// @vitest-environment jsdom
/// <reference lib="dom" />

import { afterEach, describe, expect, it } from 'vitest'
import { COMPACT_TABS_STYLES, installCompactTabs } from '../../src/client/compact-tabs.ts'

const TIP = '[data-dsh-ccgui-tab-tip]'

const SIDEBAR_CHIP = `
  <div data-dockkit-tab="t1" id="chip">
    <span data-dockkit-tab-title><span data-sidebar-right-tab="t1"><svg></svg> 工作区文件 </span></span>
    <button data-dockkit-tab-close="t1" id="close"><svg></svg></button>
  </div>
  <div data-dockkit-tab="t2" id="other"><span data-dockkit-tab-title>别处的页签</span></div>
  <div data-dockkit-tab="t3" id="owned">
    <span data-dockkit-tab-title><span data-sidebar-right-tab="t3">终端</span></span>
  </div>
`

/** One split rule of the stylesheet, by the piece of its selector it must contain. */
function rule(fragment: string): string {
  const found = COMPACT_TABS_STYLES.split('}').find((part) => part.includes(fragment))
  if (found === undefined) throw new Error(`no rule containing ${fragment}`)
  return found
}

const tip = (): HTMLElement | null => document.querySelector(TIP)

function hover(id: string): void {
  document.getElementById(id)?.dispatchEvent(new Event('pointerover', { bubbles: true }))
}

let installed: readonly (() => void)[] = []

function install(): () => void {
  const uninstall = installCompactTabs(document)
  installed = [...installed, uninstall]
  return uninstall
}

afterEach(() => {
  for (const uninstall of installed) uninstall()
  installed = []
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('installCompactTabs', () => {
  it('adds the stylesheet while installed and removes it after', () => {
    const uninstall = install()
    const tag = document.head.querySelector('style[data-plugin="dsh-ccgui.compact-tabs"]')
    expect(tag?.textContent).toBe(COMPACT_TABS_STYLES)
    uninstall()
    expect(tag?.isConnected).toBe(false)
  })

  it('shows the close only on the selected icon chip, which widens to hold it', () => {
    document.body.innerHTML = `
      <div data-dockkit-tab="a" aria-selected="true" id="on">
        <span data-dockkit-tab-title><span data-sidebar-right-tab="a"><svg></svg>变更</span></span>
        <button data-dockkit-tab-close="a" id="on-close"></button>
      </div>
      <div data-dockkit-tab="b" aria-selected="false" id="off">
        <span data-dockkit-tab-title><span data-sidebar-right-tab="b"><svg></svg>终端</span></span>
        <button data-dockkit-tab-close="b" id="off-close"></button>
      </div>`
    install()
    const rules = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    const matching = (id: string, property: string): readonly string[] =>
      rules
        .filter((rule) => document.getElementById(id)?.matches(rule.selectorText) === true)
        .map((rule) => rule.style.getPropertyValue(property))
        .filter((value) => value !== '')
    expect(matching('off-close', 'opacity')).toEqual(['0'])
    expect(matching('on-close', 'opacity')).toEqual([])
    // The later, more specific rule wins over the base chip padding.
    expect(matching('on', 'padding-right').at(-1)).toBe('28px')
    expect(matching('off', 'padding-right').at(-1)).toBe('6px')
  })

  // The tip is the only hover affordance: hovering must not resize or reflow the chip.
  it('keeps the chip itself unchanged on hover', () => {
    expect(COMPACT_TABS_STYLES).not.toContain(':hover')
    expect(COMPACT_TABS_STYLES).not.toContain(':focus-within')
  })

  it("draws a hovered icon chip's name in a small tip under the chip", () => {
    document.body.innerHTML = SIDEBAR_CHIP
    install()
    hover('chip')
    expect(tip()?.textContent).toBe('工作区文件')
    expect(tip()?.hidden).toBe(false)
    expect(tip()?.parentElement).toBe(document.body)
    expect(tip()?.style.top).toMatch(/px$/)
    expect(tip()?.style.left).toMatch(/px$/)
  })

  // Moving onto the close stays inside the chip, so the tip must survive that step.
  it('keeps the tip while the pointer stays on the chip and takes it away when it leaves', () => {
    document.body.innerHTML = SIDEBAR_CHIP
    install()
    hover('chip')
    document
      .getElementById('chip')
      ?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.getElementById('close') }))
    expect(tip()?.hidden).toBe(false)
    document
      .getElementById('chip')
      ?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
    expect(tip()).toBeNull()
  })

  it('tips only sidebar chips whose name gave way to a glyph', () => {
    document.body.innerHTML = `${SIDEBAR_CHIP}
      <div data-dockkit-tab="t4" id="text-only">
        <span data-dockkit-tab-title><span data-sidebar-right-tab="t4">浏览器</span></span>
      </div>`
    install()
    hover('owned')
    hover('text-only')
    hover('other')
    expect(tip()).toBeNull()
  })

  it('shows the tip for keyboard focus too', () => {
    document.body.innerHTML = SIDEBAR_CHIP
    install()
    document.getElementById('chip')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(tip()?.textContent).toBe('工作区文件')
    document.getElementById('chip')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(tip()).toBeNull()
  })

  it('takes the tip away on a click, a scroll, or uninstall', () => {
    document.body.innerHTML = SIDEBAR_CHIP
    const uninstall = install()
    hover('chip')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(tip()).toBeNull()
    hover('chip')
    document.dispatchEvent(new Event('scroll'))
    expect(tip()).toBeNull()
    hover('chip')
    uninstall()
    expect(tip()).toBeNull()
    hover('chip')
    expect(tip()).toBeNull()
  })

  // Chromium leaves zero-size text out of an element's accessible name, which left every
  // compact chip announced only by its close button, "关闭". Clipped text keeps its name.
  it('hides the name by clipping it, so the chip keeps its accessible name', () => {
    expect(COMPACT_TABS_STYLES).not.toMatch(/font-size:\s*0/)
    const collapsed = rule('> [data-dockkit-tab-title] {')
    expect(collapsed).toMatch(/overflow:\s*hidden/)
    expect(collapsed).toMatch(/white-space:\s*nowrap/)
    expect(collapsed).toMatch(/width:\s*16px/)
  })

  it('never compacts a chip without a glyph, a chip being renamed, or one outside the right sidebar', () => {
    document.body.innerHTML = `${SIDEBAR_CHIP}
      <div data-dockkit-tab="t5" id="renaming">
        <span data-dockkit-tab-title><span data-sidebar-right-tab="t5"><svg></svg><input></span></span>
      </div>`
    install()
    const collapsed = rule('> [data-dockkit-tab-title] {').split('{')[0]?.trim()
    if (collapsed === undefined) throw new Error('no collapsed-title rule')
    expect(document.querySelector('#chip > [data-dockkit-tab-title]')?.matches(collapsed)).toBe(true)
    expect(document.querySelector('#owned > [data-dockkit-tab-title]')?.matches(collapsed)).toBe(false)
    expect(document.querySelector('#renaming > [data-dockkit-tab-title]')?.matches(collapsed)).toBe(false)
    expect(document.querySelector('#other > [data-dockkit-tab-title]')?.matches(collapsed)).toBe(false)
  })
})
