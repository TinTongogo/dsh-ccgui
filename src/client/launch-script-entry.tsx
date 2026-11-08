/// <reference lib="dom" />

/**
 * The startup script control in the session header: a run button for the default script
 * and a chevron that lists every script plus "管理启动脚本…". With nothing saved yet the
 * run button opens the form instead. CC GUI puts one pill per script in its header and
 * edits on right-click; a split button keeps the header narrow however many scripts there
 * are, and keeps editing where it can be found.
 * @module dsh-ccgui/client/launch-script-entry
 */

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconPlayOutlineRegular,
  IconSettingsOutlineRegular,
  Menu,
  Toast,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { scriptLabel } from './launch-scripts.ts'
import type { LaunchScript, ScriptBook } from './launch-scripts.ts'
import type { LaunchRunner } from './launch-script-run.ts'
import { LIST_PAGE, LaunchScriptDialog, NEW_SCRIPT_PAGE } from './launch-script-dialog.tsx'
import type { DialogPage } from './launch-script-dialog.tsx'
import { LS } from './launch-script-styles.ts'
import type { Store } from './store.ts'

/** The session list, as far as this control reads a session's working directory. */
export type CwdList = Store<{ byId: Readonly<Record<string, { readonly cwd?: string | undefined } | undefined>> }>

/** What the header slot hands the control. */
export interface LaunchEntryProps {
  readonly sessionId: string
  readonly list: CwdList
  readonly book: ScriptBook
  readonly runner: LaunchRunner
  readonly newId: () => string
}

const MANAGE_ID = 'dsh-ccgui.launch-scripts.manage'
const SET_UP = '设置启动脚本'
const RUN_PREFIX = '运行：'
const MORE = '启动脚本'
const MANAGE = '管理启动脚本…'
const SAVE_FAILED = '没能保存启动脚本'
const TOOLTIP_DELAY_MS = 500

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function useWorkspaceScripts(list: CwdList, book: ScriptBook, sessionId: string) {
  const subscribeList = useCallback((listener: () => void) => list.subscribe(listener), [list])
  const cwd = useSyncExternalStore(subscribeList, () => list.getSnapshot().byId[sessionId]?.cwd)
  const subscribeBook = useCallback((listener: () => void) => book.subscribe(listener), [book])
  const scripts = useSyncExternalStore(subscribeBook, () => book.read(cwd))
  return { cwd, scripts }
}

function MenuRow({ script }: { readonly script: LaunchScript }) {
  const label = scriptLabel(script)
  const command = script.command.trim()
  return (
    <span className={LS.menuRow}>
      <span className={LS.menuName}>{label}</span>
      {command === label ? null : <span className={LS.menuCommand}>{command}</span>}
    </span>
  )
}

function menuItems(scripts: readonly LaunchScript[]) {
  return [
    ...scripts.map((script) => ({
      id: script.id,
      label: <MenuRow script={script} />,
      icon: <IconPlayOutlineRegular size={14} />,
    })),
    { id: MANAGE_ID, label: MANAGE, icon: <IconSettingsOutlineRegular size={14} /> },
  ]
}

function useLaunchActions({ sessionId, list, book, runner }: LaunchEntryProps) {
  const { cwd, scripts } = useWorkspaceScripts(list, book, sessionId)
  const [page, setPage] = useState<DialogPage | undefined>()
  const [toast, setToast] = useState<string | undefined>()
  const [saveError, setSaveError] = useState<string | undefined>()
  const openPage = (next: DialogPage | undefined): void => {
    setSaveError(undefined)
    setPage(next)
  }
  const run = (script: LaunchScript): void => {
    // The dialog would cover the terminal the script is about to show up in.
    openPage(undefined)
    runner.run(sessionId, script).catch((error: unknown) => {
      setToast(`没能运行「${scriptLabel(script)}」：${message(error)}`)
    })
  }
  const change = (next: readonly LaunchScript[]): void => {
    try {
      book.write(cwd, next)
      setSaveError(undefined)
    } catch (error: unknown) {
      setSaveError(`${SAVE_FAILED}：${message(error)}`)
    }
  }
  return { scripts, page, toast, saveError, openPage, run, change, clearToast: () => setToast(undefined) }
}

function RunButton(props: { readonly primary: LaunchScript | undefined; readonly onClick: () => void }) {
  const label = props.primary === undefined ? SET_UP : `${RUN_PREFIX}${scriptLabel(props.primary)}`
  return (
    <Tooltip label={label} side="bottom" delayMs={TOOLTIP_DELAY_MS}>
      <Button
        size="sm"
        className={LS.run}
        aria-label={label}
        data-has-more={props.primary === undefined ? undefined : ''}
        onClick={props.onClick}
      >
        <IconPlayOutlineRegular />
      </Button>
    </Tooltip>
  )
}

function ScriptMenu(props: {
  readonly scripts: readonly LaunchScript[]
  readonly onRun: (script: LaunchScript) => void
  readonly onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      items={menuItems(props.scripts)}
      onSelect={(id) => {
        setOpen(false)
        const chosen = props.scripts.find((script) => script.id === id)
        if (chosen === undefined) props.onManage()
        else props.onRun(chosen)
      }}
      onClose={() => {
        setOpen(false)
      }}
      portal
      anchor={
        <Button
          size="sm"
          className={LS.more}
          aria-label={MORE}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          <IconChevronDownOutlineRegular />
        </Button>
      }
    />
  )
}

/**
 * @param props - the session and the shared book and runner.
 * @returns the header control, with its menu, dialog and failure toast.
 */
export function LaunchScriptEntry(props: LaunchEntryProps): ReactElement {
  const { scripts, page, toast, saveError, openPage, run, change, clearToast } = useLaunchActions(props)
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const primary = scripts[0]
  return (
    <div className={LS.group} ref={setAnchor}>
      <RunButton
        primary={primary}
        onClick={() => {
          if (primary === undefined) openPage(NEW_SCRIPT_PAGE)
          else run(primary)
        }}
      />
      {primary === undefined ? null : <ScriptMenu scripts={scripts} onRun={run} onManage={() => openPage(LIST_PAGE)} />}
      {page === undefined ? null : (
        <LaunchScriptDialog
          page={page}
          scripts={scripts}
          error={saveError}
          onPage={openPage}
          onChange={change}
          onRun={run}
          onClose={() => {
            openPage(undefined)
          }}
          newId={props.newId}
        />
      )}
      {toast === undefined ? null : <Toast text={toast} anchor={anchor} onDone={clearToast} />}
    </div>
  )
}
