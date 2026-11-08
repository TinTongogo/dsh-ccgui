/**
 * The 变更 tab's body: the header, the list or one file's diff, and the commit box, for the
 * session's working directory. Discarding asks first, since it cannot be undone.
 * @module dsh-ccgui/client/changes/changes-panel
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { createGitApi } from './changes-api.ts'
import type { Fetch, GitApi } from './changes-api.ts'
import { ChangesDiff } from './changes-diff.tsx'
import { ChangesHeader } from './changes-header.tsx'
import { SparkleIcon } from './changes-icons.tsx'
import { ChangesList, SummaryRow } from './changes-list.tsx'
import type { ChangeEntry, GroupId, RepoStatus } from './changes-model.ts'
import type { ListActions } from './changes-row.tsx'
import { CLS } from './changes-styles.ts'
import { canCommit, selectedCount, useChanges } from './use-changes.ts'
import type { ChangesActions, ChangesState } from './use-changes.ts'
import type { Store } from '../store.ts'

/** The session list, as far as the panel reads it: each session's working directory. */
export type CwdList = Store<{ byId: Readonly<Record<string, { readonly cwd?: string | undefined } | undefined>> }>

export interface ChangesPanelProps {
  readonly sessionId: string
  readonly list: CwdList
  readonly fetch: Fetch
}

interface PendingDiscard {
  readonly group: GroupId
  readonly entries: readonly ChangeEntry[]
}

const NO_DIRECTORY = '这个会话还没有工作目录'
const NOT_A_REPO = '当前工作区不是 Git 仓库'
const AI_LABEL = 'AI 生成提交信息'
const AI_UNAVAILABLE = '暂未开放，敬请期待'

function useCwd(list: CwdList, sessionId: string): string | undefined {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list])
  return useSyncExternalStore(subscribe, () => list.getSnapshot().byId[sessionId]?.cwd)
}

function discardText({ entries }: PendingDiscard): string {
  const [only] = entries
  return entries.length === 1 && only !== undefined
    ? `确定要撤销对“${only.path}”的更改吗？更改将无法恢复。`
    : `确定要撤销这 ${String(entries.length)} 个文件的全部更改吗？更改将无法恢复。`
}

function DiscardDialog({
  pending,
  onConfirm,
  onClose,
}: {
  readonly pending: PendingDiscard | undefined
  readonly onConfirm: (pending: PendingDiscard) => void
  readonly onClose: () => void
}): ReactElement {
  return (
    <Modal
      open={pending !== undefined}
      onClose={onClose}
      title="撤销更改"
      closeLabel="关闭"
      description={pending === undefined ? undefined : discardText(pending)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (pending !== undefined) onConfirm(pending)
            }}
          >
            确定
          </Button>
        </>
      }
    />
  )
}

/** The AI-written commit message has no implementation yet; the button explains that on click. */
function AiCommitButton({ anchor }: { readonly anchor: HTMLElement | null }): ReactElement {
  const [showTip, setShowTip] = useState(false)
  return (
    <>
      <button
        type="button"
        className={CLS.aiButton}
        title={AI_LABEL}
        aria-label={AI_LABEL}
        onClick={() => {
          setShowTip(true)
        }}
      >
        <SparkleIcon />
      </button>
      {showTip ? (
        <Toast
          text={AI_UNAVAILABLE}
          anchor={anchor}
          onDone={() => {
            setShowTip(false)
          }}
        />
      ) : null}
    </>
  )
}

function CommitBox({
  state,
  actions,
}: {
  readonly state: ChangesState
  readonly actions: ChangesActions
}): ReactElement {
  const count = selectedCount(state)
  // The toast is a top banner centered on its anchor; anchoring the 34px button
  // would push it past the window edge, so it follows the whole commit box.
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  return (
    <div className={CLS.commit} ref={setBox}>
      <textarea
        className={CLS.commitInput}
        rows={2}
        placeholder="提交信息…"
        aria-label="提交信息"
        value={state.message}
        onChange={(event) => {
          actions.setMessage(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canCommit(state)) actions.commit()
        }}
      />
      <div className={CLS.commitRow}>
        <button type="button" className={CLS.commitButton} disabled={!canCommit(state)} onClick={actions.commit}>
          {state.busy === 'commit' ? '提交中…' : `提交 (${String(count)})`}
        </button>
        <AiCommitButton anchor={box} />
      </div>
    </div>
  )
}

interface ViewProps {
  readonly api: GitApi
  readonly state: ChangesState
  readonly actions: ChangesActions
}

function ErrorBanner({
  error,
  onDismiss,
}: {
  readonly error: string | undefined
  readonly onDismiss: () => void
}): ReactElement | null {
  if (error === undefined) return null
  return (
    <div className={CLS.error} role="alert">
      <span>{error}</span>
      <button type="button" className={CLS.groupAction} onClick={onDismiss}>
        关闭
      </button>
    </div>
  )
}

function toDiscard({ group, entries }: PendingDiscard): { tracked: readonly string[]; untracked: readonly string[] } {
  const paths = entries.map((entry) => entry.path)
  return group === 'untracked' ? { tracked: [], untracked: paths } : { tracked: paths, untracked: [] }
}

function RepoView({ api, state, actions, status }: ViewProps & { readonly status: RepoStatus }): ReactElement {
  const [pending, setPending] = useState<PendingDiscard | undefined>()
  const busy = state.busy !== undefined
  const listActions: ListActions = {
    select: (paths, selected) => {
      actions.select(paths, selected)
    },
    stage: (paths) => {
      actions.stage(paths)
    },
    unstage: (paths) => {
      actions.unstage(paths)
    },
    discard: (group, entries) => {
      setPending({ group, entries })
    },
    open: (entry, side) => {
      actions.openDiff({ entry, side })
    },
  }
  return (
    <>
      <ChangesHeader status={status} api={api} busy={busy} refreshing={state.refreshing} actions={actions} />
      <ErrorBanner
        error={state.error}
        onDismiss={() => {
          actions.dismissError()
        }}
      />
      <SummaryRow status={status} selected={selectedCount(state)} />
      <div className={CLS.scroll}>
        <ChangesList status={status} selection={state.selection} busy={busy} actions={listActions} />
      </div>
      <CommitBox state={state} actions={actions} />
      <DiscardDialog
        pending={pending}
        onClose={() => {
          setPending(undefined)
        }}
        onConfirm={(confirmed) => {
          setPending(undefined)
          actions.discard(toDiscard(confirmed))
        }}
      />
    </>
  )
}

function Loaded({ api, state, actions }: ViewProps): ReactElement {
  const { answer, diff } = state
  if (answer === undefined) {
    return state.error === undefined ? (
      <div className={CLS.empty}>加载中…</div>
    ) : (
      <div className={CLS.error}>{state.error}</div>
    )
  }
  if (!answer.repo) return <div className={CLS.empty}>{NOT_A_REPO}</div>
  if (diff !== undefined)
    return (
      <ChangesDiff
        api={api}
        diff={diff}
        onBack={() => {
          actions.openDiff(undefined)
        }}
      />
    )
  return <RepoView api={api} state={state} actions={actions} status={answer} />
}

function Panel({ cwd, fetch }: { readonly cwd: string; readonly fetch: Fetch }): ReactElement {
  const api = useMemo(() => createGitApi(fetch, cwd), [fetch, cwd])
  const { state, actions } = useChanges(api)
  return (
    <div className={CLS.panel}>
      <Loaded api={api} state={state} actions={actions} />
    </div>
  )
}

/** The tab body the sidebar renders for one session. */
export function ChangesPanel({ sessionId, list, fetch }: ChangesPanelProps): ReactElement {
  const cwd = useCwd(list, sessionId)
  if (cwd === undefined || cwd === '') return <div className={`${CLS.panel} ${CLS.empty}`}>{NO_DIRECTORY}</div>
  // Keyed by directory, so a session that moves starts from a clean state.
  return <Panel key={cwd} cwd={cwd} fetch={fetch} />
}
