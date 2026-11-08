/**
 * The tab strip of the settings page: one tab per group of options, so the page stays one
 * screen tall as groups are added. Follows the WAI-ARIA tabs pattern (arrow keys, Home/End,
 * only the selected tab in the tab order) and renders only the selected panel.
 * @module dsh-ccgui/client/settings-tabs
 */

import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'

/** One tab and the panel it shows. */
export interface SettingsTab {
  readonly id: string
  readonly label: string
  readonly render: () => ReactNode
}

const TABS_CLASS = 'dsh-ccgui-tabs'

export const SETTINGS_TABS_STYLES = `
.${TABS_CLASS} { display: flex; gap: 24px; margin: 4px 0 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.${TABS_CLASS}-tab { position: relative; margin: 0 0 -0.5px; padding: 8px 0; border: none; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.${TABS_CLASS}-tab:hover { color: var(--dsw-alias-label-primary); }
.${TABS_CLASS}-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.${TABS_CLASS}-tab[aria-selected="true"]::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 1px; background: var(--dsw-alias-label-primary); }
.${TABS_CLASS}-tab:focus-visible { outline: 2px solid var(--dsw-alias-border-focus, currentColor); outline-offset: 2px; border-radius: 4px; }
`

/** Where a key moves the selection, or undefined for keys the tab strip leaves alone. */
function nextIndex(key: string, index: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}

function TabButton({
  tab,
  prefix,
  active,
  onSelect,
}: {
  readonly tab: SettingsTab
  readonly prefix: string
  readonly active: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`${prefix}-${tab.id}-tab`}
      data-tab={tab.id}
      className={`${TABS_CLASS}-tab`}
      aria-selected={active}
      aria-controls={`${prefix}-${tab.id}-panel`}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
    >
      {tab.label}
    </button>
  )
}

/**
 * @param props.tabs - the tabs, in display order; the first starts selected.
 * @param props.label - names the tab strip for assistive technology.
 * @returns the tab strip and the selected tab's panel.
 */
export function SettingsTabs({
  tabs,
  label,
}: {
  readonly tabs: readonly SettingsTab[]
  readonly label: string
}): ReactElement {
  const [selected, setSelected] = useState(tabs[0]?.id)
  const strip = useRef<HTMLDivElement>(null)
  const prefix = useId()
  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0]
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === current?.id)
    const next = nextIndex(event.key, index, tabs.length)
    const target = next === undefined ? undefined : tabs[next]
    if (target === undefined) return
    event.preventDefault()
    setSelected(target.id)
    strip.current?.querySelector<HTMLElement>(`[data-tab="${target.id}"]`)?.focus()
  }
  return (
    <>
      <div ref={strip} className={TABS_CLASS} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            prefix={prefix}
            active={tab.id === current?.id}
            onSelect={() => {
              setSelected(tab.id)
            }}
          />
        ))}
      </div>
      {current === undefined ? null : (
        <div role="tabpanel" id={`${prefix}-${current.id}-panel`} aria-labelledby={`${prefix}-${current.id}-tab`}>
          {current.render()}
        </div>
      )}
    </>
  )
}
