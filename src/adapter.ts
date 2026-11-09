/**
 * Presents CLIs to the harness as model providers, which puts them in the model
 * menu and lets the agent loop drive them without loop changes.
 * @module dsh-ccgui/adapter
 */

import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CliSession } from './cli-session.ts'

export { DEFAULT_MODEL_ID } from './constants.ts'

/**
 * Larger than any real conversation. Compaction reads this as remaining room, so
 * it never starts on a history the CLI does not read, and declaring a value at
 * all keeps a model switch to this route from failing its pressure check.
 */
const CONTEXT_WINDOW = 1_000_000_000

/** A retry would repeat a prompt the CLI may already have acted on. */
const NO_RETRY: ResolvedRetryPolicy = resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'dsh-ccgui')

/** What the adapter needs from the bridge. */
export interface AdapterDeps {
  /** Display name for a provider route, or undefined when it is not a known CLI. */
  labelFor(provider: string): string | undefined
  /** The live CLI session for a harness session; throws when it cannot run here. */
  resolveSession(provider: string, sessionId: string): CliSession
  /** Ids of the user messages in the session's open turn. */
  currentTurnMessageIds(sessionId: string): ReadonlySet<string>
  /** The models to offer for a route. */
  modelsFor(provider: string): readonly LlmModelInfo[]
  /** The display name of one model. */
  modelName(provider: string, model: string): string
  /** The reasoning levels of one model, if it offers any. */
  reasoningFor(provider: string, model: string): LlmModelReasoningInfo | undefined
}

/** Routes harness model requests to CLI sessions. */
export class CliBridgeAdapter extends LlmAdapter {
  constructor(private readonly deps: AdapterDeps) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.deps.labelFor(provider) ?? provider }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return NO_RETRY
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.deps.modelsFor(provider))
  }

  /** The harness checks a chosen reasoning level against what this returns, before streaming. */
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const reasoning = this.deps.reasoningFor(provider, model)
    return Promise.resolve({
      provider,
      id: model,
      name: this.deps.modelName(provider, model),
      context: { contextWindow: CONTEXT_WINDOW },
      ...(reasoning === undefined ? {} : { reasoning }),
    })
  }

  /**
   * Run one harness step on the session's CLI. Auxiliary requests such as summaries
   * expect a stateless model; sending one here would inject it into the user's
   * real conversation, so they are refused.
   * @param options - the assembled request; only messages, session, model, reasoning level and signal apply.
   * @yields stream chunks from the CLI session.
   */
  override async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const { provider, model, reasoningEffort, sessionId, messages, signal, purpose } = options
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- not in the current type, but other host versions may still send it
    if (purpose !== undefined) {
      throw new LlmError(`CLI 会话不支持辅助模型请求（${String(purpose)}）。`, 'UNSUPPORTED_OPTION')
    }
    if (sessionId === undefined) {
      throw new LlmError('CLI 只能在会话里使用，不支持一次性模型请求。', 'UNSUPPORTED_OPTION')
    }
    const session = this.deps.resolveSession(provider, sessionId)
    yield* session.stream({
      messages,
      signal,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      currentTurnMessageIds: this.deps.currentTurnMessageIds(sessionId),
    })
  }
}
