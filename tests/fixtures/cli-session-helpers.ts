import type { PermissionOption, SessionUpdate } from '@agentclientprotocol/sdk'
import type { RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { CliSession } from '../../src/cli-session.ts'
import type { CliSessionOptions, PermissionAsk } from '../../src/cli-session.ts'
import { nativeReplayState } from '../../src/request-input.ts'
import { FakeTransport } from './fake-transport.ts'
import type { PromptScript } from './fake-transport.ts'

export const OPTIONS: PermissionOption[] = [
  { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
]

export const text = (value: string): SessionUpdate => ({
  sessionUpdate: 'agent_message_chunk',
  content: { type: 'text', text: value },
})

export const thought = (value: string): SessionUpdate => ({
  sessionUpdate: 'agent_thought_chunk',
  content: { type: 'text', text: value },
})

export const toolCall = (toolCallId: string, fields: object = {}): SessionUpdate => ({
  sessionUpdate: 'tool_call',
  toolCallId,
  title: 'shell',
  kind: 'execute',
  status: 'pending',
  rawInput: {},
  ...fields,
})

export const toolUpdate = (toolCallId: string, fields: object): SessionUpdate => ({
  sessionUpdate: 'tool_call_update',
  toolCallId,
  ...fields,
})

export const user = (id: string, value: string): RequestMessage =>
  ({
    id,
    role: 'user',
    content: [{ type: 'text', text: value }],
    source: { kind: 'user' },
  }) as unknown as RequestMessage

export const toolResult = (): RequestMessage =>
  ({
    id: `tool-${Math.random()}`,
    role: 'tool',
    content: [{ type: 'text', text: 'out' }],
    source: { kind: 'tool' },
  }) as unknown as RequestMessage

export const assistantWithReplay = (acpId: string, dshId: string): RequestMessage =>
  ({
    id: 'a',
    role: 'assistant',
    content: [{ type: 'text', text: 'hi' }],
    source: { kind: 'model', provider: 'cli-x', model: 'default', replayState: nativeReplayState(acpId, dshId) },
  }) as unknown as RequestMessage

export function setupWith(
  extra: Partial<CliSessionOptions>,
  ...scripts: PromptScript[]
): { fake: FakeTransport; session: CliSession } {
  const fake = new FakeTransport()
  fake.scripts = scripts
  let minted = 0
  const session = new CliSession({
    dshSessionId: 'dsh-1',
    provider: 'cli-x',
    cwd: '/repo',
    label: 'OpenCode',
    openTransport: (handlers) => fake.attach(handlers),
    mintCallId: () => `cli-${++minted}`,
    cancelGraceMs: 20,
    ...extra,
  })
  return { fake, session }
}

export function setup(...scripts: PromptScript[]): { fake: FakeTransport; session: CliSession } {
  return setupWith({}, ...scripts)
}

export async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

export function textOf(chunks: readonly StreamChunk[]): string {
  return chunks.flatMap((chunk) => (chunk.type === 'text-delta' ? [chunk.text] : [])).join('')
}

export function finishOf(chunks: readonly StreamChunk[]): Extract<StreamChunk, { type: 'finish' }> | undefined {
  return chunks.find((chunk): chunk is Extract<StreamChunk, { type: 'finish' }> => chunk.type === 'finish')
}

export function toolCallOf(chunks: readonly StreamChunk[]): {
  id: string
  name: string
  args: Record<string, unknown>
} {
  const end = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
  if (end?.type !== 'block-end' || end.block.type !== 'tool-call') throw new Error('no tool call')
  return { id: end.block.id, name: end.block.name, args: JSON.parse(end.block.arguments) as Record<string, unknown> }
}

/** A promise a script can wait on until the test has finished the earlier step. */
export function gate(): { wait: Promise<void>; open: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { wait: promise, open: resolve }
}

export const allow = (_request: PermissionAsk, _signal: AbortSignal): Promise<ApprovalOutcome> =>
  Promise.resolve('allowed-once')
export const never = (): Promise<ApprovalOutcome> => Promise.reject(new Error('should not ask'))
