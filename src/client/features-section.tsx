/**
 * The settings page's 界面交互 tab: one switch per addition to the harness's interface, so a
 * user who prefers the original interaction can turn that addition off.
 * @module dsh-ccgui/client/features-section
 */

import type { ReactElement } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { FEATURES } from './feature-settings.ts'
import type { FeatureInfo, FeatureSettings } from './feature-settings.ts'
import { useStore } from './store.ts'

const FEATURES_INTRO = 'CC GUI 在 DeepSeek Harness 上加入的交互。关闭某一项即恢复原来的交互，立即生效。'
const PAGE_CLASS = 'dsh-ccgui-settings'

function FeatureRow({
  feature,
  enabled,
  settings,
}: {
  readonly feature: FeatureInfo
  readonly enabled: boolean
  readonly settings: FeatureSettings
}) {
  return (
    <li className={`${PAGE_CLASS}-row`}>
      <div>
        <div className={`${PAGE_CLASS}-title`}>{feature.title}</div>
        <div className={`${PAGE_CLASS}-desc`}>{feature.description}</div>
      </div>
      <Switch
        checked={enabled}
        label={feature.title}
        onChange={(next) => {
          settings.set(feature.id, next)
        }}
      />
    </li>
  )
}

/**
 * @param props.settings - the feature settings the switches read and write.
 * @returns the section.
 */
export function FeaturesSection({ settings }: { readonly settings: FeatureSettings }): ReactElement {
  const flags = useStore(settings)
  return (
    <section>
      <p className={`${PAGE_CLASS}-intro`}>{FEATURES_INTRO}</p>
      <ul className={`${PAGE_CLASS}-list`}>
        {FEATURES.map((feature) => (
          <FeatureRow key={feature.id} feature={feature} enabled={flags[feature.id]} settings={settings} />
        ))}
      </ul>
    </section>
  )
}
