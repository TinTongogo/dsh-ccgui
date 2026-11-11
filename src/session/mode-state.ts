/**
 * The modes a CLI reports for itself, and the one the user picked. The vocabulary is the
 * CLI's own: ids and names are kept and sent back exactly as reported, never translated
 * into a harness preset.
 * @module dsh-ccgui/session/mode-state
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import { abortable } from '../abortable.ts'
import { readModeList } from '../model-options.ts'
import type { CliModeList } from '../model-options.ts'
import type { ConfigOptions, ModelTarget } from './model-state.ts'
import { errorMessage } from './outcomes.ts'

/** The mode side of one CLI session. */
export class ModeState {
  /** The CLI's modes as last reported. */
  private list: CliModeList | undefined
  /** The mode the user picked, until the CLI confirms it. */
  private wanted: string | undefined

  /**
   * @param known - what the CLI reported ahead of any session, which a probe reads.
   * @param report - passes on the options the CLI answers a change with, which describe
   *   more than the mode; the session then updates everything from that one report.
   * @param initial - a mode picked before this session existed, sent with its first step.
   */
  constructor(
    private readonly known: (() => CliModeList | undefined) | undefined,
    private readonly report: (options: ConfigOptions) => void,
    initial?: string,
  ) {
    this.list = known?.()
    this.wanted = initial
  }

  /**
   * The modes the CLI reports, in its own ids and names.
   * @returns the list, or undefined before the CLI has reported one.
   */
  current(): CliModeList | undefined {
    return this.list
  }

  /** The mode picked but not yet confirmed by the CLI, if any. */
  get pending(): string | undefined {
    return this.wanted
  }

  /**
   * A report of the CLI's options; one without modes keeps what is known, as some CLIs
   * report only the option that changed. The confirmed mode clears a pending pick.
   * @param options - the options the CLI answered with.
   * @returns the modes known after this report.
   */
  observe(options: ConfigOptions): CliModeList | undefined {
    if (options == null) return this.list
    this.list = readModeList(options) ?? this.list
    if (this.list?.current === this.wanted) this.wanted = undefined
    return this.list
  }

  /**
   * Ask for one of the CLI's own modes. Checked against the list the CLI last reported:
   * an id it never offered is refused rather than sent as an unknown value.
   * @param mode - a mode id exactly as the CLI reported it.
   * @throws when no list is known yet, or the list does not contain that mode.
   */
  choose(mode: string): void {
    const { list } = this
    if (list === undefined) throw new LlmError('还没有读到这个 CLI 的模式列表，请稍后再试。', 'CLI_MODE_FAILED')
    if (!list.options.some((option) => option.value === mode)) {
      throw new LlmError(`这个 CLI 没有报告模式 ${mode}。`, 'CLI_MODE_FAILED')
    }
    this.wanted = mode
  }

  /**
   * Send the picked mode, unless the CLI is already on it.
   * @param where - the session to change.
   * @param signal - cancellation for the wait.
   * @returns the modes as the CLI confirmed them.
   */
  async apply(where: ModelTarget, signal: AbortSignal | undefined): Promise<CliModeList | undefined> {
    const { list, wanted } = this
    if (list === undefined || wanted === undefined) return list
    if (list.current === wanted) {
      this.wanted = undefined
      return list
    }
    try {
      const options = await abortable(
        where.transport.setConfigOption(where.acpSessionId, list.configId, wanted),
        signal,
      )
      this.report(options)
      const confirmed = readModeList(options)?.current
      if (confirmed !== undefined && confirmed !== wanted) throw new Error(`CLI 仍在使用 ${confirmed}`)
      this.wanted = undefined
      return this.list ?? list
    } catch (error: unknown) {
      if (signal?.aborted === true) throw error
      throw new LlmError(`${where.label} 无法切换到模式 ${wanted}：${errorMessage(error)}`, 'CLI_MODE_FAILED', {
        cause: error,
      })
    }
  }
}
