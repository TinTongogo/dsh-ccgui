/**
 * The settings page's 更多功能 tab: features that are planned but not ready yet. Each row says
 * what the feature will do and that it is not open yet; nothing here is clickable, so the list
 * only sets expectations and never pretends to be a control.
 * @module dsh-ccgui/client/more-section
 */

import type { ReactElement } from 'react'

/** A feature the page announces without offering a control for it yet. */
export interface UpcomingFeature {
  readonly id: 'autoRename' | 'worktree' | 'gitInfo' | 'promptBoost' | 'accountQuota'
  readonly title: string
  readonly description: string
}

const INTRO = '正在开发的功能，会陆续在这里开放。'
const SOON_LABEL = '即将开放…'
const SOON_CLASS = 'dsh-ccgui-more-soon'

/** In the order the settings page lists them. */
export const UPCOMING_FEATURES: readonly UpcomingFeature[] = [
  { id: 'autoRename', title: '会话自动命名', description: '根据对话内容自动生成会话标题，不用手动改名。' },
  { id: 'worktree', title: 'WorkTree', description: '为每个会话建立独立的 Git 工作树，多个任务互不干扰。' },
  { id: 'gitInfo', title: 'Git 信息自动生成', description: '根据改动自动生成提交信息和变更说明。' },
  { id: 'promptBoost', title: '增强提示词', description: '把一句话扩写成完整的提示词，减少来回补充背景。' },
  {
    id: 'accountQuota',
    title: 'AI 账号限额提示',
    description: '显示各 AI 账号的剩余额度和重置时间，快用完时提前提醒。',
  },
]

export const MORE_SECTION_STYLES = `
.${SOON_CLASS} { flex: 0 0 auto; padding: 2px 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); font-size: 12px; line-height: 18px; }
`

/**
 * @returns the section.
 */
export function MoreSection(): ReactElement {
  return (
    <section>
      <p className="dsh-ccgui-settings-intro">{INTRO}</p>
      <ul className="dsh-ccgui-settings-list">
        {UPCOMING_FEATURES.map((feature) => (
          <li key={feature.id} className="dsh-ccgui-settings-row">
            <div>
              <div className="dsh-ccgui-settings-title">{feature.title}</div>
              <div className="dsh-ccgui-settings-desc">{feature.description}</div>
            </div>
            <span className={SOON_CLASS}>{SOON_LABEL}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
