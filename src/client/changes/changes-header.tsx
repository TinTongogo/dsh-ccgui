/**
 * The 变更 panel's header: the title with the distance from upstream, the refresh, pull and
 * push buttons, and the branch picker, which also creates branches.
 * @module dsh-ccgui/client/changes/changes-header
 */

import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitApi } from './changes-api.ts'
import { BranchIcon, ChevronIcon, PullIcon, PushIcon, RefreshIcon } from './changes-icons.tsx'
import type { BranchList, RepoStatus } from './changes-model.ts'
import { CLS } from './changes-styles.ts'

interface HeaderActions {
  readonly refresh: () => void
  readonly pull: () => void
  readonly push: () => void
  readonly checkout: (branch: string, remote: boolean) => void
  readonly createBranch: (branch: string) => void
}

interface HeaderProps {
  readonly status: RepoStatus
  readonly api: GitApi
  readonly busy: boolean
  readonly refreshing: boolean
  readonly actions: HeaderActions
}

const NEW_BRANCH_ID = '\0new'
const REMOTE_PREFIX = 'remote:'
const LOCAL_PREFIX = 'local:'
const DETACHED_LABEL = '游离 HEAD'
const LOADING_ITEM = { id: '\0loading', label: '加载中…' }

function HeaderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string
  readonly disabled: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      className={CLS.headerButton}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function branchItems(list: BranchList | undefined): readonly { id: string; label: ReactNode }[] {
  if (list === undefined) return [LOADING_ITEM]
  return [
    ...list.local.map((name) => ({ id: `${LOCAL_PREFIX}${name}`, label: name })),
    ...list.remote.map((name) => ({
      id: `${REMOTE_PREFIX}${name}`,
      label: (
        <span className={CLS.remoteItem}>
          {name}
          <span className={CLS.remoteTag}>远程分支</span>
        </span>
      ),
    })),
    { id: NEW_BRANCH_ID, label: '新建分支…' },
  ]
}

function NewBranchForm({
  onCreate,
  onCancel,
}: {
  readonly onCreate: (name: string) => void
  readonly onCancel: () => void
}): ReactElement {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <form
      className={CLS.branchForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed !== '') onCreate(trimmed)
      }}
    >
      <input
        className={CLS.branchInput}
        // The form only appears after a click on 新建分支, so typing can start at once.
        autoFocus
        placeholder="分支名称"
        aria-label="分支名称"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      />
      <button type="submit" className={CLS.groupAction} disabled={trimmed === ''}>
        新建
      </button>
      <button type="button" className={CLS.groupAction} onClick={onCancel}>
        返回
      </button>
    </form>
  )
}

const NO_BRANCHES: BranchList = { current: undefined, local: [], remote: [] }

/** Branches are listed afresh each time the menu opens, since checkouts happen elsewhere too. */
function useBranchList(api: GitApi): { list: BranchList | undefined; load: () => void } {
  const [list, setList] = useState<BranchList | undefined>()
  const load = (): void => {
    setList(undefined)
    api.branches().then(
      (answer) => {
        setList('local' in answer ? answer : NO_BRANCHES)
      },
      () => {
        setList(NO_BRANCHES)
      },
    )
  }
  return { list, load }
}

function pickBranch(id: string, actions: HeaderActions, startCreating: () => void): void {
  if (id === NEW_BRANCH_ID) startCreating()
  else if (id.startsWith(LOCAL_PREFIX)) actions.checkout(id.slice(LOCAL_PREFIX.length), false)
  else if (id.startsWith(REMOTE_PREFIX)) actions.checkout(id.slice(REMOTE_PREFIX.length), true)
}

function BranchButton({
  branch,
  busy,
  onClick,
}: {
  readonly branch: string | undefined
  readonly busy: boolean
  readonly onClick: () => void
}): ReactElement {
  return (
    <button type="button" className={CLS.branchButton} aria-label="分支" disabled={busy} onClick={onClick}>
      <BranchIcon size={16} />
      <span className={CLS.branchName}>{branch ?? DETACHED_LABEL}</span>
      <ChevronIcon size={16} />
    </button>
  )
}

function BranchPicker({ status, api, busy, actions }: Omit<HeaderProps, 'refreshing'>): ReactElement {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const { list, load } = useBranchList(api)
  if (creating) {
    const finish = (name?: string): void => {
      setCreating(false)
      if (name !== undefined) actions.createBranch(name)
    }
    return (
      <NewBranchForm
        onCreate={finish}
        onCancel={() => {
          finish()
        }}
      />
    )
  }
  const anchor = (
    <BranchButton
      branch={status.branch}
      busy={busy}
      onClick={() => {
        if (!open) load()
        setOpen(!open)
      }}
    />
  )
  return (
    <Menu
      open={open}
      className={CLS.branchMenu}
      items={branchItems(list)}
      selectedId={status.branch === undefined ? undefined : `${LOCAL_PREFIX}${status.branch}`}
      onSelect={(id) => {
        setOpen(false)
        pickBranch(id, actions, () => {
          setCreating(true)
        })
      }}
      onClose={() => {
        setOpen(false)
      }}
      portal
      anchor={anchor}
    />
  )
}

/** The header block above the list. */
export function ChangesHeader({ status, api, busy, refreshing, actions }: HeaderProps): ReactElement {
  const tracked = status.ahead !== undefined && status.behind !== undefined
  return (
    <div className={CLS.header}>
      <div className={CLS.headerRow}>
        <span className={CLS.title}>变更</span>
        {tracked ? (
          <span className={CLS.distance} title="领先 / 落后上游的提交数">
            ↑{status.ahead} ↓{status.behind}
          </span>
        ) : null}
        <span className={CLS.headerButtons}>
          <HeaderButton label="刷新" disabled={refreshing} onClick={actions.refresh}>
            <RefreshIcon size={16} className={refreshing ? CLS.spinning : undefined} />
          </HeaderButton>
          <HeaderButton label="拉取" disabled={busy} onClick={actions.pull}>
            <PullIcon size={16} />
          </HeaderButton>
          <HeaderButton label="推送" disabled={busy} onClick={actions.push}>
            <PushIcon size={16} />
          </HeaderButton>
        </span>
      </div>
      <BranchPicker status={status} api={api} busy={busy} actions={actions} />
    </div>
  )
}
