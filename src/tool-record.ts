/**
 * Immutable fold over ACP tool-call updates, plus the projections the harness
 * needs from it: the durable `cli_tool` arguments and the final outcome.
 * @module dsh-ccgui/tool-record
 */

import type { ToolCallContent, ToolCallUpdate } from '@agentclientprotocol/sdk'

/** ACP tool-call lifecycle states. */
type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/** One file change reported by the CLI; `oldText` is null for a new file. */
export interface CliFileDiff {
  readonly path: string
  readonly oldText: string | null
  readonly newText: string
}

/** Everything the bridge knows about one CLI tool call so far. */
export interface ToolRecord {
  /** Id the CLI uses; unique only within that CLI session. */
  readonly acpId: string
  /** Id written to the harness log; unique across the harness session. */
  readonly callId: string
  readonly title: string
  readonly kind: string
  readonly status: ToolStatus
  readonly rawInput?: unknown
  readonly rawOutput?: unknown
  readonly content: readonly ToolCallContent[]
  /**
   * Latest reported file changes. Kept apart from `content` because a CLI may
   * report a diff on the permission request and then replace `content` with a
   * text summary on completion, as OpenCode does.
   */
  readonly diffs: readonly CliFileDiff[]
  readonly locations: readonly string[]
  /** Whether the CLI is blocked on a permission answer for this call. */
  readonly permissionRequested: boolean
}

/** Arguments recorded on the harness `tool/call` event. */
export interface CliToolArgs {
  readonly title: string
  readonly kind: string
  readonly command?: string
  readonly input?: unknown
  readonly diffs?: readonly CliFileDiff[]
  readonly locations?: readonly string[]
}

/** The final result of one CLI tool call. */
export interface ToolOutcome {
  readonly text: string
  readonly failed: boolean
  readonly diffs: readonly CliFileDiff[]
}

const DEFAULT_TITLE = 'Tool call'
const NO_OUTPUT = '(no output)'
const PERMISSION_PREVIEW_LINES = 20
const OUTER_FENCE = /^(`{3,})(console)?\n([\s\S]*)\n\1$/

/**
 * Fold one ACP update into a tool record. ACP updates carry only the fields
 * that changed, so absent and null fields keep their earlier value.
 * @param previous - the record so far, or undefined for the first update.
 * @param update - the ACP `tool_call` or `tool_call_update` payload.
 * @param mintCallId - produces the harness call id; only invoked for a new record.
 * @returns a new record; `previous` is left unchanged.
 */
export function mergeToolUpdate(
  previous: ToolRecord | undefined,
  update: ToolCallUpdate,
  mintCallId: () => string,
): ToolRecord {
  const base: ToolRecord = previous ?? {
    acpId: update.toolCallId,
    callId: mintCallId(),
    title: DEFAULT_TITLE,
    kind: 'other',
    status: 'pending',
    content: [],
    diffs: [],
    locations: [],
    permissionRequested: false,
  }
  const diffs = diffsOf(update.content ?? [])
  return {
    ...base,
    ...(update.title != null ? { title: update.title } : {}),
    ...(update.kind != null ? { kind: update.kind } : {}),
    ...(update.status != null ? { status: update.status } : {}),
    ...(update.content != null ? { content: update.content } : {}),
    ...(diffs.length > 0 ? { diffs } : {}),
    ...(update.locations != null ? { locations: update.locations.map((location) => location.path) } : {}),
    ...(update.rawInput != null ? { rawInput: update.rawInput } : {}),
    ...(update.rawOutput != null ? { rawOutput: update.rawOutput } : {}),
  }
}

/**
 * Whether a call's arguments are final enough to record. A pending call may
 * still be streaming its input, and the harness log freezes arguments once.
 * @param record - the current record.
 * @returns true once the call runs, finishes, or blocks on permission.
 */
export function isReadyToPublish(record: ToolRecord): boolean {
  return record.status !== 'pending' || record.permissionRequested
}

/**
 * Whether the CLI has reported a terminal status.
 * @param record - the current record.
 * @returns true for `completed` and `failed`.
 */
export function isFinished(record: ToolRecord): boolean {
  return record.status === 'completed' || record.status === 'failed'
}

/**
 * Read the shell command a call runs.
 * @param record - the current record.
 * @returns the command, or undefined for another kind of call or one yet to report it.
 */
export function commandOf(record: ToolRecord): string | undefined {
  if (record.kind !== 'execute' || typeof record.rawInput !== 'object' || record.rawInput === null) {
    return undefined
  }
  const command = (record.rawInput as { command?: unknown }).command
  if (typeof command === 'string') return command
  return Array.isArray(command) ? command.join(' ') : undefined
}

function diffsOf(content: readonly ToolCallContent[]): CliFileDiff[] {
  return content.flatMap((item) =>
    item.type === 'diff' ? [{ path: item.path, oldText: item.oldText ?? null, newText: item.newText }] : [],
  )
}

/** Project arbitrary CLI input to lossless JSON, which the session log requires. */
function toJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return undefined
  }
}

/**
 * Build the arguments recorded for one call.
 * @param record - a record that is ready to publish.
 * @returns JSON-safe arguments, omitting everything the CLI did not report.
 */
export function toCliToolArgs(record: ToolRecord): CliToolArgs {
  const command = commandOf(record)
  const input = toJsonValue(record.rawInput)
  return {
    title: record.title,
    kind: record.kind,
    ...(command === undefined ? {} : { command }),
    ...(input === undefined ? {} : { input }),
    ...(record.diffs.length === 0 ? {} : { diffs: record.diffs }),
    ...(record.locations.length === 0 ? {} : { locations: record.locations }),
  }
}

/**
 * Take off the Markdown fence claude-agent-acp puts around tool output for clients that render
 * Markdown, since a terminal card shows text as written. A `console` fence is always such a
 * wrapper, whatever the output holds. Around other output it grows longer than any fence inside,
 * so a line opening the same fence means separate blocks that happen to start and end the text.
 */
function withoutFence(text: string): string {
  const [, fence, info, inner] = OUTER_FENCE.exec(text) ?? []
  if (fence === undefined || inner === undefined) return text
  return info === undefined && inner.split('\n').some((line) => line.startsWith(fence)) ? text : inner
}

function textOf(content: readonly ToolCallContent[]): string {
  return content
    .flatMap((item) =>
      item.type === 'content' && item.content.type === 'text' ? [withoutFence(item.content.text)] : [],
    )
    .join('\n')
}

function rawOutputText(rawOutput: unknown): string | undefined {
  if (rawOutput === undefined || rawOutput === null) return undefined
  if (typeof rawOutput === 'string') return rawOutput
  const output = (rawOutput as { output?: unknown }).output
  return typeof output === 'string' ? output : JSON.stringify(rawOutput)
}

/**
 * Summarize a finished call.
 * @param record - a finished record.
 * @returns the text shown as the tool result, with any reported diffs.
 */
export function toolOutcome(record: ToolRecord): ToolOutcome {
  const { diffs } = record
  const failed = record.status === 'failed'
  // A permission request reports a diff before anything is written, so on a failure
  // the diff says nothing about what happened.
  const editSummary = failed || diffs.length === 0 ? undefined : `Edited ${diffs.map((diff) => diff.path).join(', ')}`
  const text = textOf(record.content) || editSummary || rawOutputText(record.rawOutput) || NO_OUTPUT
  return { text, failed, diffs }
}

function describeDiff(diff: CliFileDiff): string {
  const lines = diff.newText.split('\n')
  const hidden = lines.length - PERMISSION_PREVIEW_LINES
  return [
    `${diff.path}:`,
    ...lines.slice(0, PERMISSION_PREVIEW_LINES),
    ...(hidden > 0 ? [`…（还有 ${hidden} 行）`] : []),
  ].join('\n')
}

/**
 * Describe a blocked call to the person deciding. The harness freezes tool arguments
 * before some CLIs report a diff, so this text is the only place they can see what
 * would be written.
 * @param record - the call waiting for permission.
 * @returns the title, plus the command or file contents when the CLI reported them.
 */
export function permissionReason(record: ToolRecord): string {
  const command = commandOf(record)
  return [
    record.title,
    ...(command === undefined || command === record.title ? [] : [command]),
    ...record.diffs.map(describeDiff),
  ].join('\n\n')
}
