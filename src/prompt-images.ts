/**
 * Turns the images in a user message into what the CLI can take. The harness keeps
 * images as references to its attachment store; a CLI only understands inline bytes,
 * so each one is read here, just before the prompt goes out.
 * @module dsh-ccgui/prompt-images
 */

import type { ContentBlock as AcpContentBlock } from '@agentclientprotocol/sdk'
import { LlmError, offloadedImageText, textOnlyImageText } from '@deepseek-ai/dsh-llm'

/**
 * The fields of the harness's image reference this bridge relies on. The full type
 * lives in `@deepseek-ai/dsh-attachment`, which the host provides but this package does
 * not depend on; the reference is passed back to the host untouched.
 */
export interface ImageRef {
  readonly attachmentId: string
  readonly mediaType: string
  readonly name?: string
}

/** One piece of user input before its images are resolved. */
export type InputBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly ref: ImageRef; readonly offloaded: boolean }

/** Reads one image's stored bytes. */
export type ReadImage = (ref: ImageRef, signal?: AbortSignal) => Promise<Uint8Array>

/** What resolving images needs to know. */
export interface ImageResolution {
  /** The CLI declared `promptCapabilities.image`; ACP forbids sending images otherwise. */
  readonly acceptsImages: boolean
  /** Absent when the harness runs without an attachment service. */
  readonly readImage?: ReadImage | undefined
}

function imageLabel(ref: ImageRef): string {
  return ref.name ?? ref.attachmentId
}

async function imageBlock(
  ref: ImageRef,
  readImage: ReadImage | undefined,
  signal: AbortSignal | undefined,
): Promise<AcpContentBlock> {
  if (readImage === undefined) {
    throw new LlmError('当前环境没有附件服务，无法把图片发送给 CLI。', 'UNSUPPORTED_CONTENT')
  }
  try {
    const data = await readImage(ref, signal)
    return { type: 'image', mimeType: ref.mediaType, data: Buffer.from(data).toString('base64') }
  } catch (error: unknown) {
    signal?.throwIfAborted()
    throw new LlmError(`无法读取图片「${imageLabel(ref)}」，这条消息没有发送。`, 'CLI_PROMPT_FAILED', {
      cause: error,
    })
  }
}

function toBlock(block: InputBlock, resolution: ImageResolution, signal?: AbortSignal): Promise<AcpContentBlock> {
  if (block.type === 'text') return Promise.resolve(block)
  // `ref` is the host's own reference object, so its placeholder texts accept it as is.
  if (block.offloaded) return Promise.resolve({ type: 'text', text: offloadedImageText(block.ref) })
  if (!resolution.acceptsImages) return Promise.resolve({ type: 'text', text: textOnlyImageText(block.ref) })
  return imageBlock(block.ref, resolution.readImage, signal)
}

/**
 * Resolve user input into ACP prompt blocks, in order.
 * @param blocks - text and image references from the user's messages.
 * @param resolution - whether the CLI takes images and how to read them.
 * @param signal - cancellation for the reads.
 * @returns the prompt to send.
 * @throws LlmError when an image cannot be read; sending without it would hide it from the CLI.
 */
export function toPromptBlocks(
  blocks: readonly InputBlock[],
  resolution: ImageResolution,
  signal?: AbortSignal,
): Promise<AcpContentBlock[]> {
  return Promise.all(blocks.map((block) => toBlock(block, resolution, signal)))
}
