/// <reference lib="dom" />

/**
 * Compact tab chips in the right sidebar: a chip whose title carries a glyph shows the glyph
 * alone, and one without keeps its text in a narrower chip. The chips belong to the harness's
 * dockkit, which offers no option for this, so the rules key on the `data-dockkit-*` attributes
 * its markup carries (its class names are hashed). If those change, the chips fall back to the
 * harness's own look rather than breaking. With the text hidden, hovering or focusing a chip
 * shows its name in a small tip drawn by this module instead of in a native `title` tooltip.
 * @module dsh-ccgui/client/compact-tabs
 */

const CHIP = '[data-dockkit-tab]'
const TITLE = '[data-dockkit-tab-title]'
const CLOSE = '[data-dockkit-tab-close]'
const SIDEBAR_TITLE = `${TITLE} > [data-sidebar-right-tab]`
/** Marks the tip element, so this module's own node is the only one it finds again. */
const TIP_ATTR = 'data-dsh-ccgui-tab-tip'
/** Room after the glyph for the harness's close: its 20px button, its 4px inset, a 4px gap. */
const CLOSE_ROOM_PX = 28
/** The harness draws every sidebar tab glyph at 16px; the collapsed title is exactly that wide. */
const GLYPH_PX = 16
/** Distance below the chip, matching the harness's own bottom tooltips. */
const TIP_GAP_PX = 8
/** Smallest distance the tip keeps from the viewport's sides. */
const TIP_MARGIN_PX = 12

// Only right-sidebar chips: their title span is the sidebar's `data-sidebar-right-tab` wrapper.
const SIDEBAR_CHIP = `${CHIP}:has(> ${SIDEBAR_TITLE})`
// A terminal being renamed puts an input in its title, which must stay readable.
const ICON_CHIP = `${SIDEBAR_CHIP}:has(${TITLE} :is(svg, img)):not(:has(${TITLE} input))`

// The harness's close button is a 20px control 4px inside the chip's end, shown on the active
// chip and on hover or focus. Laid over a 28px icon chip it would cover the glyph, so a click
// meant to switch to a chip could land on its close instead. An icon chip therefore never shows
// a close until it is the selected one; then the chip widens to hold the glyph on the left and
// the close on the right. A middle click or the context menu still closes any chip.
// Text is hidden by clipping the title to the glyph's width, not by a zero font size:
// Chromium leaves zero-size text out of the accessible name, so every chip was announced
// only by its close button. Clipped text stays laid out and keeps naming the tab.
export const COMPACT_TABS_STYLES = `
${SIDEBAR_CHIP} { min-width: 0; max-width: 128px; padding: 0 8px; }
${ICON_CHIP} { flex: none; max-width: none; padding: 0 6px; }
${ICON_CHIP}[aria-selected="true"]:has(${CLOSE}) { padding-right: ${String(CLOSE_ROOM_PX)}px; }
${ICON_CHIP} > ${TITLE} {
  flex: none;
  width: ${String(GLYPH_PX)}px;
  overflow: hidden;
  white-space: nowrap;
  mask-image: none;
}
${ICON_CHIP} > ${TITLE} :is(svg, img) { flex: none; }
${ICON_CHIP}:not([aria-selected="true"]) ${CLOSE} { opacity: 0; pointer-events: none; }
[${TIP_ATTR}] {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: max-content;
  max-width: min(50vw, calc(100vw - 24px));
  padding: 3px 7px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-static-neutral-bluish-00);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-line;
  overflow-wrap: break-word;
  pointer-events: none;
  transform: translateX(-50%);
}
`

/** The hover/focus tip: its own node, moved between chips, removed while hidden. */
interface CompactTip {
  readonly hide: () => void
  readonly onPointerOver: (event: Event) => void
  readonly onPointerOut: (event: PointerEvent) => void
  readonly onFocusIn: (event: Event) => void
}

/**
 * Where the tip goes: centered under the chip and held inside the viewport, so a chip near an
 * edge keeps its name readable; the stylesheet's translateX(-50%) turns `left` into that center.
 * @param tip - the tip element, already showing its text.
 * @param chip - the chip the tip describes.
 * @param viewport - the viewport width the tip must stay inside.
 * @returns the tip's fixed-position coordinates.
 */
function tipPlacement(tip: HTMLElement, chip: Element, viewport: number): { left: string; top: string } {
  const rect = chip.getBoundingClientRect()
  const width = tip.getBoundingClientRect().width
  const center = Math.min(
    Math.max(rect.left + rect.width / 2, TIP_MARGIN_PX + width / 2),
    viewport - TIP_MARGIN_PX - width / 2,
  )
  return { left: `${String(center)}px`, top: `${String(rect.bottom + TIP_GAP_PX)}px` }
}

/**
 * Build the tip and the hover/focus handlers that drive it.
 * @param doc - the document the harness renders into.
 * @returns the tip's control surface, shared with the document listeners.
 */
function createCompactTip(doc: Document): CompactTip {
  const tip = doc.createElement('div')
  tip.setAttribute('role', 'tooltip')
  tip.setAttribute(TIP_ATTR, '')
  tip.hidden = true
  let owner: Element | undefined

  const hide = (): void => {
    owner = undefined
    tip.hidden = true
    tip.remove()
  }

  const show = (chip: Element): void => {
    const name = chip.querySelector(TITLE)?.textContent.trim() ?? ''
    if (name === '') {
      hide()
      return
    }
    owner = chip
    tip.textContent = name
    tip.hidden = false
    doc.body.append(tip)
    const { left, top } = tipPlacement(tip, chip, doc.defaultView?.innerWidth ?? 0)
    tip.style.left = left
    tip.style.top = top
  }

  const onPointerOver = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const chip = target.closest(CHIP)
    if (chip?.matches(ICON_CHIP) === true) {
      if (chip !== owner) show(chip)
      return
    }
    // The close button sits inside the chip, so only leaving the chip's own box hides the tip.
    if (!owner?.contains(target)) hide()
  }

  const onPointerOut = (event: PointerEvent): void => {
    if (owner === undefined) return
    const to = event.relatedTarget
    if (to instanceof Node && owner.contains(to)) return
    hide()
  }

  const onFocusIn = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const chip = target.closest(CHIP)
    if (chip?.matches(ICON_CHIP) === true) show(chip)
  }

  return { hide, onPointerOver, onPointerOut, onFocusIn }
}

/**
 * Turn compact chips on.
 * @param doc - the document the harness renders into.
 * @returns turns them off again, restoring the chips' own look.
 */
export function installCompactTabs(doc: Document): () => void {
  const tag = doc.createElement('style')
  tag.dataset.plugin = 'dsh-ccgui.compact-tabs'
  tag.textContent = COMPACT_TABS_STYLES
  doc.head.append(tag)
  const tip = createCompactTip(doc)
  doc.addEventListener('pointerover', tip.onPointerOver, true)
  doc.addEventListener('pointerout', tip.onPointerOut, true)
  doc.addEventListener('focusin', tip.onFocusIn, true)
  doc.addEventListener('focusout', tip.hide, true)
  doc.addEventListener('pointerdown', tip.hide, true)
  doc.addEventListener('scroll', tip.hide, true)
  doc.defaultView?.addEventListener('resize', tip.hide)
  return () => {
    doc.removeEventListener('pointerover', tip.onPointerOver, true)
    doc.removeEventListener('pointerout', tip.onPointerOut, true)
    doc.removeEventListener('focusin', tip.onFocusIn, true)
    doc.removeEventListener('focusout', tip.hide, true)
    doc.removeEventListener('pointerdown', tip.hide, true)
    doc.removeEventListener('scroll', tip.hide, true)
    doc.defaultView?.removeEventListener('resize', tip.hide)
    tip.hide()
    tag.remove()
  }
}
