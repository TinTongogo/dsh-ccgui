/**
 * The pills beside the settings page's title: the plugin's version and where to reach the
 * project (its WeChat group and this plugin's repository), as CC GUI's own 社区与反馈 page does.
 * @module dsh-ccgui/client/settings-about
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import wechatGroupQr from './assets/wechat-group.png'

/** Replaced with package.json's version by scripts/build-client.mjs; undefined when run from source. */
declare const __DSH_CCGUI_VERSION__: string | undefined

export const PLUGIN_VERSION: string = typeof __DSH_CCGUI_VERSION__ === 'string' ? __DSH_CCGUI_VERSION__ : '开发版'

// This plugin's own repository, matching package.json's `repository` (a test keeps them in step).
const REPO_URL = 'https://github.com/zhukunpenglinyutong/dsh-ccgui'
const VERSION_LABEL = '版本'
// A release reads as v0.3.0, like the harness's own 新版本 chip; the source run keeps its word.
const VERSION_VALUE = /^\d/.test(PLUGIN_VERSION) ? `v${PLUGIN_VERSION}` : PLUGIN_VERSION
const WECHAT_LABEL = '微信交流群'
const WECHAT_DESC = '扫描作者个人公众号二维码，获取微信交流群二维码，加群获得最新资讯和技术支持'
const WECHAT_TIP = '使用微信扫一扫'
const WECHAT_QR_ALT = '官方微信交流群二维码'
const QR_SIZE = 160
const ABOUT_CLASS = 'dsh-ccgui-about'

// Pills like the harness's own header chips (插件设置, DeepSeek 余额): a hairline border on a
// faint fill, label in the secondary color and the value it names in the primary one.
export const SETTINGS_ABOUT_STYLES = `
.${ABOUT_CLASS} { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; }
.${ABOUT_CLASS}-pill { position: relative; display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.08)); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; text-decoration: none; white-space: nowrap; }
.${ABOUT_CLASS}-value { color: var(--dsw-alias-label-primary); font-weight: 500; }
button.${ABOUT_CLASS}-pill, a.${ABOUT_CLASS}-pill { cursor: pointer; }
button.${ABOUT_CLASS}-pill:hover, a.${ABOUT_CLASS}-pill:hover, .${ABOUT_CLASS}-pill[aria-expanded="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.${ABOUT_CLASS}-anchor { position: relative; }
.${ABOUT_CLASS}-qr { position: absolute; top: calc(100% + 8px); left: 0; z-index: 10; width: 240px; padding: 16px; border: 0; border-radius: 12px; background: var(--dsw-alias-bg-layer-1); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-panel); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-align: center; }
.${ABOUT_CLASS}-qr p { margin: 0; }
.${ABOUT_CLASS}-qr img { display: block; margin: 12px auto 8px; padding: 8px; border-radius: 8px; background: #fff; }
`

function useEscape(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [active, close])
}

function WechatGroup(): ReactElement {
  const [open, setOpen] = useState(false)
  useEscape(open, () => {
    setOpen(false)
  })
  return (
    <span className={`${ABOUT_CLASS}-anchor`}>
      <button
        type="button"
        className={`${ABOUT_CLASS}-pill`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        {WECHAT_LABEL}
      </button>
      {open ? (
        <div className={`${ABOUT_CLASS}-qr`}>
          <p>{WECHAT_DESC}</p>
          <img src={wechatGroupQr} alt={WECHAT_QR_ALT} width={QR_SIZE} height={QR_SIZE} />
          <p>{WECHAT_TIP}</p>
        </div>
      ) : null}
    </span>
  )
}

/** @returns the version and contact pills. */
export function SettingsAbout(): ReactElement {
  return (
    <div className={ABOUT_CLASS}>
      <span className={`${ABOUT_CLASS}-pill`}>
        {VERSION_LABEL}
        <span className={`${ABOUT_CLASS}-value`}>{VERSION_VALUE}</span>
      </span>
      <WechatGroup />
      <a className={`${ABOUT_CLASS}-pill`} href={REPO_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </div>
  )
}
