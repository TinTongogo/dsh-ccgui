/// <reference lib="dom" />

/**
 * The startup script manager: a modal with two pages, the list and the add / edit form.
 * One dialog for all of it, where CC GUI stacks a "new script" section under the editor of
 * the first one and hides editing the rest behind right-click.
 * @module dsh-ccgui/client/launch-script-dialog
 */

import type { ReactElement } from 'react'
import { Button, IconPlusOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { promoteScript, removeScript, saveDraft } from './launch-scripts.ts'
import type { LaunchScript, LaunchScriptDraft } from './launch-scripts.ts'
import { LaunchScriptForm, useScriptForm } from './launch-script-form.tsx'
import { LaunchScriptList } from './launch-script-list.tsx'
import { LS } from './launch-script-styles.ts'

const TITLE = '启动脚本'
const ADD_TITLE = '添加启动脚本'
const EDIT_TITLE = '编辑启动脚本'
const DESCRIPTION = '保存在当前工作目录下，所有会话共用。每个脚本在独立的终端标签里运行，再次运行会先结束上一次。'
const CLOSE = '关闭'
const ADD = '添加脚本'
const DONE = '完成'
const CANCEL = '取消'
const BACK = '返回'
const SAVE = '保存'

/** Which page the manager shows. */
export type DialogPage = { readonly kind: 'list' } | { readonly kind: 'form'; readonly draft: LaunchScriptDraft }

export const LIST_PAGE: DialogPage = { kind: 'list' }
export const NEW_SCRIPT_PAGE: DialogPage = { kind: 'form', draft: { name: '', command: '' } }

/** What the manager needs from its owner. */
export interface DialogProps {
  readonly page: DialogPage
  readonly scripts: readonly LaunchScript[]
  readonly error: string | undefined
  readonly onPage: (page: DialogPage) => void
  readonly onChange: (scripts: readonly LaunchScript[]) => void
  readonly onRun: (script: LaunchScript) => void
  readonly onClose: () => void
  readonly newId: () => string
}

function FormPage(props: DialogProps & { readonly draft: LaunchScriptDraft }) {
  const { draft, scripts, error, onPage, onChange, onClose, newId } = props
  const form = useScriptForm(draft)
  // Opened straight from the header with nothing saved yet, there is no list to go back to.
  const backToList = scripts.length > 0
  const submit = (): void => {
    if (form.problem !== undefined) return
    onChange(saveDraft(scripts, form.draft, newId))
    onPage(LIST_PAGE)
  }
  // An empty command is plain from the disabled button; only a limit needs saying.
  const shown = error ?? (form.draft.command.trim() === '' ? undefined : form.problem)
  return (
    <Modal
      open
      title={draft.id === undefined ? ADD_TITLE : EDIT_TITLE}
      closeLabel={CLOSE}
      className={LS.dialog}
      onClose={onClose}
      footer={
        <div className={LS.footer}>
          <Button variant="ghost" onClick={backToList ? () => onPage(LIST_PAGE) : onClose}>
            {backToList ? BACK : CANCEL}
          </Button>
          <Button variant="primary" disabled={form.problem !== undefined} onClick={submit}>
            {SAVE}
          </Button>
        </div>
      }
    >
      <LaunchScriptForm form={form} error={shown} onSubmit={submit} />
    </Modal>
  )
}

function ListPage(props: DialogProps) {
  const { scripts, error, onPage, onChange, onRun, onClose } = props
  return (
    <Modal
      open
      title={TITLE}
      description={DESCRIPTION}
      closeLabel={CLOSE}
      className={LS.dialog}
      onClose={onClose}
      footer={
        <div className={LS.footer}>
          <Button
            data-leading=""
            variant="outline"
            icon={<IconPlusOutlineRegular size={14} />}
            onClick={() => onPage(NEW_SCRIPT_PAGE)}
          >
            {ADD}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {DONE}
          </Button>
        </div>
      }
    >
      <LaunchScriptList
        scripts={scripts}
        actions={{
          onRun,
          onEdit: (script) => onPage({ kind: 'form', draft: script }),
          onPromote: (script) => onChange(promoteScript(scripts, script.id)),
          onRemove: (script) => onChange(removeScript(scripts, script.id)),
        }}
      />
      {error === undefined ? null : (
        <span role="alert" className={LS.error}>
          {error}
        </span>
      )}
    </Modal>
  )
}

/**
 * @param props - the page to show, the scripts and what to do with edits.
 * @returns the manager.
 */
export function LaunchScriptDialog(props: DialogProps): ReactElement {
  const { page } = props
  if (page.kind === 'list') return <ListPage {...props} />
  // Keyed by the script so the form's fields start over for each script it edits.
  return <FormPage key={page.draft.id ?? 'new'} {...props} draft={page.draft} />
}
