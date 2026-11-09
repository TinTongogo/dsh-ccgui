/**
 * The plugin's section inside the harness's Settings dialog: a header with the version and
 * contact pills, then one tab per group of options: the CLI switcher's order and choice of
 * providers (cli-prefs-section.tsx), the switches for the plugin's interface additions
 * (features-section.tsx), the features that are not open yet (more-section.tsx) and the
 * release notes paged by version (release-notes-section.tsx).
 * The dialog owns the chrome, title and scrolling; this renders content only.
 * @module dsh-ccgui/client/settings-page
 */

import type { ReactElement } from 'react'
import { IconSlidersTwoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CliPrefs } from './cli-prefs.ts'
import { CLI_PREFS_STYLES, CliPrefsSection } from './cli-prefs-section.tsx'
import type { FeatureSettings } from './feature-settings.ts'
import { FeaturesSection } from './features-section.tsx'
import { MORE_SECTION_STYLES, MoreSection } from './more-section.tsx'
import { RELEASE_NOTES_STYLES, ReleaseNotesSection } from './release-notes-section.tsx'
import { SETTINGS_ABOUT_STYLES, SettingsAbout } from './settings-about.tsx'
import { SETTINGS_TABS_STYLES, SettingsTabs } from './settings-tabs.tsx'
import type { SettingsTab } from './settings-tabs.tsx'

export const SETTINGS_TITLE = 'CC GUI 设置'
const CLI_TAB_LABEL = 'CLI 列表'
const FEATURES_TAB_LABEL = '界面交互'
const MORE_TAB_LABEL = '更多功能'
const NOTES_TAB_LABEL = '版本记录'
const PAGE_CLASS = 'dsh-ccgui-settings'

// Type sizes and colors follow the harness's own settings sections (e.g. ModelsSection): a
// 16px section heading, 14px intro, and rows sized like the neighbouring fields. The options
// column already pads 24px and scrolls, so the section must not add page chrome of its own.
export const SETTINGS_PAGE_STYLES = `
.${PAGE_CLASS} { display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; max-width: 720px; color: var(--dsw-alias-label-primary); }
.${PAGE_CLASS}-header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
.${PAGE_CLASS} h1 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 16px; line-height: 24px; font-weight: 500; }
.${PAGE_CLASS}-intro { margin: 0 0 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.${PAGE_CLASS}-list { margin: 0; padding: 0; list-style: none; }
/* The host paints an on switch with the brand color, which is near-white in the dark theme;
   a green track (with a white thumb) reads as "on" at a glance in both themes. */
.${PAGE_CLASS} [role="switch"][aria-checked="true"] { background: var(--dsw-alias-state-success-primary, #2da44e); }
.${PAGE_CLASS} [role="switch"][aria-checked="true"] > span { background: #fff; }
.${PAGE_CLASS}-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; }
.${PAGE_CLASS}-row + .${PAGE_CLASS}-row { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.${PAGE_CLASS}-title { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; line-height: 20px; }
.${PAGE_CLASS}-desc { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
${SETTINGS_TABS_STYLES}${CLI_PREFS_STYLES}${SETTINGS_ABOUT_STYLES}${MORE_SECTION_STYLES}${RELEASE_NOTES_STYLES}`

/**
 * @param props.settings - the feature settings the switches read and write.
 * @param props.cliPrefs - the CLI switcher preferences the CLI list reads and writes.
 * @returns the settings page.
 */
export function SettingsPage({
  settings,
  cliPrefs,
}: {
  readonly settings: FeatureSettings
  readonly cliPrefs: CliPrefs
}): ReactElement {
  const tabs: readonly SettingsTab[] = [
    { id: 'cli', label: CLI_TAB_LABEL, render: () => <CliPrefsSection prefs={cliPrefs} /> },
    { id: 'features', label: FEATURES_TAB_LABEL, render: () => <FeaturesSection settings={settings} /> },
    { id: 'more', label: MORE_TAB_LABEL, render: () => <MoreSection /> },
    { id: 'notes', label: NOTES_TAB_LABEL, render: () => <ReleaseNotesSection /> },
  ]
  return (
    <div className={PAGE_CLASS}>
      <div className={`${PAGE_CLASS}-header`}>
        <h1>{SETTINGS_TITLE}</h1>
        <SettingsAbout />
      </div>
      <SettingsTabs tabs={tabs} label={SETTINGS_TITLE} />
    </div>
  )
}

/**
 * The glyph of the settings navigation row; the dialog draws the row and its label around it.
 * @param props.size - the edge the settings navigation asks for.
 * @returns the icon.
 */
export function SettingsIcon({ size }: { readonly size?: number }): ReactElement {
  return <IconSlidersTwoOutlineRegular size={size} />
}
