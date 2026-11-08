/// <reference lib="dom" />

/**
 * The add / edit form inside the startup script manager: a name and a command, saved
 * with the button or ⌘/Ctrl+Enter.
 * @module dsh-ccgui/client/launch-script-form
 */

import { useId, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { MAX_NAME_LENGTH, draftProblem } from './launch-scripts.ts'
import type { LaunchScriptDraft } from './launch-scripts.ts'
import { LS } from './launch-script-styles.ts'

const NAME_LABEL = '名称'
const NAME_PLACEHOLDER = '例如：开发服务器（可留空）'
const COMMAND_LABEL = '命令'
const COMMAND_PLACEHOLDER = 'npm run dev'
const COMMAND_HINT = '在会话的工作目录下执行。多行命令会逐行执行。⌘/Ctrl + Enter 保存。'

/** The form's fields, lifted so the dialog's footer can save them. */
export interface FormState {
  readonly draft: LaunchScriptDraft
  readonly problem: string | undefined
  readonly setName: (name: string) => void
  readonly setCommand: (command: string) => void
}

/**
 * Hold the editor's fields.
 * @param initial - the script being edited, or empty fields for a new one.
 * @returns the fields and their setters.
 */
export function useScriptForm(initial: LaunchScriptDraft): FormState {
  const [draft, setDraft] = useState(initial)
  return {
    draft,
    problem: draftProblem(draft),
    setName: (name) => {
      setDraft((current) => ({ ...current, name }))
    },
    setCommand: (command) => {
      setDraft((current) => ({ ...current, command }))
    },
  }
}

function CommandField(props: { readonly command: string; readonly onChange: (command: string) => void }) {
  const commandId = useId()
  const hintId = useId()
  return (
    <div className={LS.field}>
      <label className={LS.label} htmlFor={commandId}>
        {COMMAND_LABEL}
      </label>
      <textarea
        id={commandId}
        className={LS.textarea}
        rows={3}
        data-modal-autofocus=""
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={hintId}
        value={props.command}
        placeholder={COMMAND_PLACEHOLDER}
        onChange={(event) => {
          props.onChange(event.currentTarget.value)
        }}
      />
      <span id={hintId} className={LS.hint}>
        {COMMAND_HINT}
      </span>
    </div>
  )
}

/**
 * @param props.form - the fields, from {@link useScriptForm}.
 * @param props.error - why the last save or run failed, if it did.
 * @param props.onSubmit - save the fields.
 * @returns the form.
 */
export function LaunchScriptForm(props: {
  readonly form: FormState
  readonly error: string | undefined
  readonly onSubmit: () => void
}): ReactElement {
  const { form, error, onSubmit } = props
  const nameId = useId()
  const submitOnShortcut = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) return
    event.preventDefault()
    onSubmit()
  }
  return (
    <div className={LS.form} onKeyDown={submitOnShortcut}>
      <div className={LS.field}>
        <label className={LS.label} htmlFor={nameId}>
          {NAME_LABEL}
        </label>
        <Input
          id={nameId}
          value={form.draft.name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={NAME_PLACEHOLDER}
          onChange={(event) => {
            form.setName(event.currentTarget.value)
          }}
        />
      </div>
      <CommandField command={form.draft.command} onChange={form.setCommand} />
      {error === undefined ? null : (
        <span role="alert" className={LS.error}>
          {error}
        </span>
      )}
    </div>
  )
}
