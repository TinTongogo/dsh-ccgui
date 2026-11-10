/// <reference lib="dom" />

/**
 * The 新建 Worktree form's fields: the three source tabs (新分支, 已有分支, 从 PR 创建), the
 * fields each needs, the location with its computed default, and the open-a-session switch.
 * State lives with the dialog; every change goes back through `onChange` as a new form.
 * @module dsh-ccgui/client/worktree/worktree-fields
 */

import { useId } from 'react'
import type { ReactElement } from 'react'
import { Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { BranchPicker } from './branch-picker.tsx'
import type { RepoInfo, WorktreeMode } from './worktree-api.ts'
import { branchOf, defaultPath, withPr } from './worktree-form.ts'
import type { WorktreeForm } from './worktree-form.ts'
import { WT } from './worktree-styles.ts'

export interface FieldsProps {
  readonly form: WorktreeForm
  readonly info: RepoInfo
  readonly disabled: boolean
  readonly onChange: (form: WorktreeForm) => void
}

const MODES: readonly { readonly id: WorktreeMode; readonly label: string }[] = [
  { id: 'new', label: '新分支' },
  { id: 'existing', label: '已有分支' },
  { id: 'pr', label: '从 PR 创建' },
]

const BRANCH_LABEL = '分支名'
const BRANCH_PLACEHOLDER = 'feature/my-change'
const BASE_LABEL = '基于（base）'
const BASE_HINT = '下拉可搜索本地与远程分支；选远程分支时创建前先 fetch'
const EXISTING_LABEL = '分支'
const EXISTING_PLACEHOLDER = '搜索本地或远程分支'
const EXISTING_HINT = '远程分支会在本地建一个同名分支并跟踪它'
const PR_LABEL = 'PR'
const PR_PLACEHOLDER = '#123 或 PR 链接'
const PR_HINT = '从远程仓库拉取 PR 的最新提交（有 upstream 时优先用 upstream）'
const PATH_LABEL = '位置'
const PATH_HINT = '默认放在仓库同级的 <repo>-worktrees/ 目录下，可修改'
const OPEN_SESSION = '创建后打开新会话（AI 立刻在该 worktree 里开工）'

function ModeTabs({ form, disabled, onChange }: Omit<FieldsProps, 'info'>) {
  return (
    <div role="tablist" aria-label="Worktree 来源" className={WT.tabs}>
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={form.mode === mode.id}
          className={WT.tab}
          disabled={disabled}
          onClick={() => {
            onChange({ ...form, mode: mode.id })
          }}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function Field(props: { readonly id: string; readonly label: string; readonly hint?: string; children: ReactElement }) {
  return (
    <div className={WT.field}>
      <label htmlFor={props.id} className={WT.label}>
        {props.label}
      </label>
      {props.children}
      {props.hint === undefined ? null : <span className={WT.hint}>{props.hint}</span>}
    </div>
  )
}

function TextField(props: {
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly hint?: string
  readonly disabled: boolean
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <Field id={id} label={props.label} {...(props.hint === undefined ? {} : { hint: props.hint })}>
      <Input
        id={id}
        value={props.value}
        placeholder={props.placeholder}
        spellCheck={false}
        autoComplete="off"
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value)
        }}
      />
    </Field>
  )
}

function PickerField(props: {
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly options: readonly string[]
  readonly placeholder: string
  readonly disabled: boolean
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <Field id={id} label={props.label} hint={props.hint}>
      <BranchPicker {...props} id={id} />
    </Field>
  )
}

function SourceFields({ form, info, disabled, onChange }: FieldsProps) {
  const branches = [...info.local, ...info.remote]
  if (form.mode === 'new') {
    return (
      <>
        <TextField
          label={BRANCH_LABEL}
          value={form.branch}
          placeholder={BRANCH_PLACEHOLDER}
          disabled={disabled}
          onChange={(branch) => {
            onChange({ ...form, branch })
          }}
        />
        <PickerField
          label={BASE_LABEL}
          hint={BASE_HINT}
          value={form.base}
          options={branches}
          placeholder={EXISTING_PLACEHOLDER}
          disabled={disabled}
          onChange={(base) => {
            onChange({ ...form, base })
          }}
        />
      </>
    )
  }
  if (form.mode === 'existing') {
    return (
      <PickerField
        label={EXISTING_LABEL}
        hint={EXISTING_HINT}
        value={form.existing}
        options={branches}
        placeholder={EXISTING_PLACEHOLDER}
        disabled={disabled}
        onChange={(existing) => {
          onChange({ ...form, existing })
        }}
      />
    )
  }
  return <PrFields form={form} disabled={disabled} onChange={onChange} />
}

function PrFields({ form, disabled, onChange }: Omit<FieldsProps, 'info'>) {
  return (
    <>
      <TextField
        label={PR_LABEL}
        value={form.pr}
        placeholder={PR_PLACEHOLDER}
        hint={PR_HINT}
        disabled={disabled}
        onChange={(pr) => {
          onChange(withPr(form, pr))
        }}
      />
      <TextField
        label={BRANCH_LABEL}
        value={form.prBranch}
        placeholder="pr-123"
        disabled={disabled}
        onChange={(prBranch) => {
          onChange({ ...form, prBranch, prBranchEdited: true })
        }}
      />
    </>
  )
}

/**
 * @param props - the form, the repository, and where changes go.
 * @returns the dialog's fields.
 */
export function WorktreeFields(props: FieldsProps): ReactElement {
  const { form, info, disabled, onChange } = props
  return (
    <div className={WT.body}>
      <ModeTabs form={form} disabled={disabled} onChange={onChange} />
      <SourceFields {...props} />
      <TextField
        label={PATH_LABEL}
        value={form.path}
        placeholder={defaultPath(info, branchOf(form, info))}
        hint={PATH_HINT}
        disabled={disabled}
        onChange={(path) => {
          onChange({ ...form, path })
        }}
      />
      <div className={WT.toggle}>
        <Switch
          checked={form.openSession}
          label={OPEN_SESSION}
          disabled={disabled}
          onChange={(openSession) => {
            onChange({ ...form, openSession })
          }}
        />
        <span aria-hidden="true">{OPEN_SESSION}</span>
      </div>
    </div>
  )
}
