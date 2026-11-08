/// <reference lib="dom" />

/**
 * The list page of the startup script manager: one row per script, with run, edit,
 * make-default and delete. Deleting asks once more on the same button instead of opening a
 * second dialog over the first.
 * @module dsh-ccgui/client/launch-script-list
 */

import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  Button,
  IconEditOutlineRegular,
  IconPlayOutlineRegular,
  IconTrashOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { scriptLabel } from './launch-scripts.ts'
import type { LaunchScript } from './launch-scripts.ts'
import { LS } from './launch-script-styles.ts'

const DEFAULT_BADGE = '默认'
const RUN = '运行'
const EDIT = '编辑'
const MAKE_DEFAULT = '设为默认'
const DELETE = '删除'
const CONFIRM_DELETE = '再点一次删除'
const EMPTY_TEXT = '还没有启动脚本。添加一条常用命令，例如启动开发服务器，之后在标题栏一键运行。'
const TOOLTIP_DELAY_MS = 500

/** What a row can ask the manager to do. */
export interface ListActions {
  readonly onRun: (script: LaunchScript) => void
  readonly onEdit: (script: LaunchScript) => void
  readonly onPromote: (script: LaunchScript) => void
  readonly onRemove: (script: LaunchScript) => void
}

function RowButton(props: {
  readonly label: string
  readonly onClick: () => void
  readonly danger?: boolean
  readonly children: ReactNode
}) {
  return (
    <Tooltip label={props.label} side="top" delayMs={TOOLTIP_DELAY_MS}>
      <Button
        size="sm"
        className={LS.iconButton}
        aria-label={props.label}
        data-danger={props.danger === true ? '' : undefined}
        onClick={props.onClick}
      >
        {props.children}
      </Button>
    </Tooltip>
  )
}

interface RowProps {
  readonly script: LaunchScript
  readonly first: boolean
  readonly actions: ListActions
}

function RowActions(props: RowProps & { readonly confirming: boolean; readonly onConfirm: () => void }) {
  const { script, first, actions, confirming, onConfirm } = props
  const label = scriptLabel(script)
  return (
    <div className={LS.rowActions}>
      {first ? null : (
        <Button
          size="sm"
          onClick={() => {
            actions.onPromote(script)
          }}
        >
          {MAKE_DEFAULT}
        </Button>
      )}
      <RowButton label={`${RUN} ${label}`} onClick={() => actions.onRun(script)}>
        <IconPlayOutlineRegular />
      </RowButton>
      <RowButton label={`${EDIT} ${label}`} onClick={() => actions.onEdit(script)}>
        <IconEditOutlineRegular />
      </RowButton>
      <RowButton
        label={confirming ? CONFIRM_DELETE : `${DELETE} ${label}`}
        danger={confirming}
        onClick={() => {
          if (confirming) actions.onRemove(script)
          else onConfirm()
        }}
      >
        <IconTrashOutlineRegular />
      </RowButton>
    </div>
  )
}

function ScriptRow(props: RowProps) {
  const { script, first } = props
  const [confirming, setConfirming] = useState(false)
  return (
    <li
      className={LS.row}
      onMouseLeave={() => {
        setConfirming(false)
      }}
    >
      <div className={LS.rowText}>
        <span className={LS.rowName}>
          <span>{scriptLabel(script)}</span>
          {first ? <span className={LS.badge}>{DEFAULT_BADGE}</span> : null}
        </span>
        <span className={LS.rowCommand} title={script.command}>
          {script.command}
        </span>
      </div>
      <RowActions
        {...props}
        confirming={confirming}
        onConfirm={() => {
          setConfirming(true)
        }}
      />
    </li>
  )
}

/**
 * @param props.scripts - the workspace's scripts, default first.
 * @param props.actions - what the rows can ask for.
 * @returns the list, or a short explanation when it is empty.
 */
export function LaunchScriptList(props: {
  readonly scripts: readonly LaunchScript[]
  readonly actions: ListActions
}): ReactElement {
  if (props.scripts.length === 0) return <p className={LS.empty}>{EMPTY_TEXT}</p>
  return (
    <ul className={LS.list}>
      {props.scripts.map((script, index) => (
        <ScriptRow key={script.id} script={script} first={index === 0} actions={props.actions} />
      ))}
    </ul>
  )
}
