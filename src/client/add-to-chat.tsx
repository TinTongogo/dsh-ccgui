/// <reference lib="dom" />

/**
 * "添加到对话" in the harness's file and folder context menus: inserts an `@path` mention
 * into the session's composer, like the hover "+" on CC GUI's file tree rows. The harness's
 * tree only takes row accessories from its own caller, so a plugin reaches its rows
 * through the shared context menu instead.
 * @module dsh-ccgui/client/add-to-chat
 */

import { useEffect } from 'react'
import { mentionToken } from './path-mention.ts'

/** The parts of the harness's per-session `inputActions` this module uses. */
export interface ComposerActions {
  captureInsertion(): unknown
  insertText(text: string, span: unknown): boolean
}

/** A file or folder row the user right-clicked, as the harness's file tree reports it. */
export type FileTarget =
  | { readonly kind: 'file'; readonly value: { readonly sessionId: string; readonly path: string } }
  | { readonly kind: 'directory'; readonly value: { readonly sessionId: string; readonly path: string } }

/** One menu entry, as far as this module fills it in. */
export interface MenuAction {
  readonly id: string
  readonly label: string
  readonly icon?: { readonly key: string }
  readonly failureLabel?: string
  readonly run?: () => void | Promise<void>
}

/** A contribution to one target kind of the harness's context menus. */
export interface MenuContribution {
  readonly id: string
  readonly target: FileTarget['kind']
  readonly order: number
  resolve(target: FileTarget['value']): readonly MenuAction[]
}

/** The parts of the harness's `ctx.contextMenus` this module uses. */
interface ContextMenusFace {
  register(contribution: MenuContribution): () => void
}

/** Registration options for a slot entry; icon slots are keyed rather than listed. */
type SlotOptions =
  { name: string; id: string; order?: number; inject?(sessionId: string): unknown } | { name: string; key: string }

/** The parts of the harness's client context this module uses. */
export interface AddToChatContext {
  slots: {
    inject(name: string, add: () => unknown): void
    register(options: SlotOptions, component: unknown): unknown
  }
  effect(run: () => () => void, label?: string): void
  inject(
    deps: readonly string[],
    apply: (child: AddToChatContext & { contextMenus: ContextMenusFace }) => void,
  ): unknown
}

type Attach = (sessionId: string, actions: ComposerActions) => () => void

const LABEL = '添加到对话'
const FAILURE_LABEL = '没能添加到对话：输入框正在发送或已关闭，请稍后再试'
const NO_COMPOSER = '这个会话的输入框没有打开'
const REFUSED = '输入框暂时不接受输入'
const ICON_KEY = 'dsh-ccgui.add-to-chat'
const ICON_SLOT = 'contextMenu.icon'
/** Any session-scope slot hands its entries `inputActions`; this one is always mounted with the composer. */
const BRIDGE_SLOT = 'conversation.input.left'
/** Ahead of the harness's own file actions (open-in-app at 100, file actions at 200). */
const MENU_ORDER = 50

/** Tracks the composer of each mounted session, so a menu click can reach it. */
function composerRegistry() {
  let composers: ReadonlyMap<string, ComposerActions> = new Map()
  const attach: Attach = (sessionId, actions) => {
    composers = new Map(composers).set(sessionId, actions)
    return () => {
      // A second composer for the same session may have replaced this one meanwhile.
      if (composers.get(sessionId) !== actions) return
      composers = new Map([...composers].filter(([id]) => id !== sessionId))
    }
  }
  const insert = (sessionId: string, text: string): void => {
    const composer = composers.get(sessionId)
    if (composer === undefined) throw new Error(NO_COMPOSER)
    if (!composer.insertText(text, composer.captureInsertion())) throw new Error(REFUSED)
  }
  return { attach, insert }
}

function ComposerBridge(props: {
  readonly sessionId: string
  readonly inputActions: ComposerActions
  readonly attach: Attach
}) {
  const { sessionId, inputActions, attach } = props
  useEffect(() => attach(sessionId, inputActions), [attach, sessionId, inputActions])
  return null
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function contribution(kind: FileTarget['kind'], insert: (sessionId: string, text: string) => void): MenuContribution {
  return {
    id: `${ICON_KEY}.${kind}`,
    target: kind,
    order: MENU_ORDER,
    resolve: ({ sessionId, path }) => [
      {
        id: 'add-to-chat',
        label: LABEL,
        icon: { key: ICON_KEY },
        failureLabel: FAILURE_LABEL,
        run: () => {
          insert(sessionId, mentionToken(path))
        },
      },
    ],
  }
}

/**
 * Register the menu entries once the context menu service is up. It is a separate
 * dependency so that a harness without it still gets the rest of the plugin.
 * @param ctx - the plugin's client context.
 */
export function registerAddToChat(ctx: AddToChatContext): void {
  ctx.inject(['contextMenus'], (child) => {
    const { attach, insert } = composerRegistry()
    child.slots.inject(BRIDGE_SLOT, () =>
      child.slots.register(
        { name: BRIDGE_SLOT, id: 'dsh-ccgui.composer-bridge', inject: () => ({ attach }) },
        ComposerBridge,
      ),
    )
    child.slots.inject(ICON_SLOT, () => child.slots.register({ name: ICON_SLOT, key: ICON_KEY }, PlusIcon))
    child.effect(() => child.contextMenus.register(contribution('file', insert)), 'ccgui: add file to chat')
    child.effect(() => child.contextMenus.register(contribution('directory', insert)), 'ccgui: add folder to chat')
  })
}
