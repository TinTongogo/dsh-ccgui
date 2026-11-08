/**
 * Wires the feature settings into the harness's Settings dialog: the page as a section in
 * its navigation (after 插件市场), plus the glyph that navigation row draws, and a gate that
 * keeps each switchable feature's registration in place only while that feature is on.
 * @module dsh-ccgui/client/settings-register
 */

import type { CliPrefs } from './cli-prefs.ts'
import { whileEnabled } from './feature-settings.ts'
import type { FeatureId, FeatureSettings } from './feature-settings.ts'
import { SETTINGS_TITLE, SettingsIcon, SettingsPage } from './settings-page.tsx'

/** What the two root slots used here accept; both are lists keyed by `id`. */
interface SettingsRegistration {
  name: string
  id?: string
  order?: number
  label?: string
  /** Called with a session id in session-scoped slots; these two root slots pass none. */
  inject?(sessionId?: string): unknown
}

/** The parts of the harness's client context the settings page uses. */
export interface SettingsContext {
  slots: {
    inject(name: string, add: () => unknown): void
    register(options: SettingsRegistration, component: unknown): unknown
  }
}

/** A `ctx.inject` of any service set; the gate does not need to know which. */
type Inject<A> = (deps: readonly string[], apply: A) => unknown

/** The part of a Cordis fiber the gate uses to take a feature out again. */
interface Disposable {
  dispose(): Promise<void>
}

/** The section and its navigation icon share this id; the icon slot matches it against sections. */
export const SETTINGS_SECTION_ID = 'dsh-ccgui.settings'
/** After the harness's own sections and 插件市场 (40), which keeps the built-in order intact. */
const SETTINGS_ORDER = 50

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value && typeof value.dispose === 'function'
}

/**
 * Put the settings page into the harness's Settings dialog, with its own navigation glyph.
 * Both registrations inject the slots they use, so a host without them keeps the rest of the
 * plugin; the dialog owns the chrome, scrolling and title, and the section renders only content.
 * @param ctx - the plugin's client context.
 * @param settings - the feature settings the page edits.
 * @param cliPrefs - the CLI switcher preferences the page edits.
 */
export function registerSettingsPage(ctx: SettingsContext, settings: FeatureSettings, cliPrefs: CliPrefs): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_ORDER,
        label: SETTINGS_TITLE,
        inject: () => ({ settings, cliPrefs }),
      },
      SettingsPage,
    ),
  )
  ctx.slots.inject('settings.section.icon', () =>
    ctx.slots.register({ name: 'settings.section.icon', id: SETTINGS_SECTION_ID }, SettingsIcon),
  )
}

/**
 * Wrap `ctx.inject` so that what a feature registers lives only while the feature is on.
 * Each `ctx.inject` makes a child fiber that owns the feature's slot entries and effects, so
 * disposing it takes the whole feature out and injecting again puts it back, with no change
 * to the feature's own module.
 * @param ctx - the plugin's client context; the gate's subscription lives as long as it does.
 * @param settings - the feature settings.
 * @param id - the feature the wrapped registrations belong to.
 * @param inject - calls the context's `inject`.
 * @returns an `inject` with the same signature.
 */
export function gateInject<A>(
  ctx: { effect(run: () => () => void, label?: string): void },
  settings: FeatureSettings,
  id: FeatureId,
  inject: Inject<A>,
): Inject<A> {
  return (deps, apply) => {
    ctx.effect(
      () =>
        whileEnabled(settings, id, () => {
          const fiber = inject(deps, apply)
          return () => {
            if (!isDisposable(fiber)) return
            fiber.dispose().catch((_error: unknown) => {
              // Cordis already reports a failing disposer through its own supervision.
            })
          }
        }),
      `ccgui: ${id} switch`,
    )
    return undefined
  }
}
