import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { toPromptBlocks } from '../src/prompt-images.ts'
import type { ImageRef, InputBlock } from '../src/prompt-images.ts'

const ref: ImageRef = { attachmentId: 'sha256:0123456789abcdef', mediaType: 'image/png', name: 'shot.png' }
const image = (offloaded = false): InputBlock => ({ type: 'image', ref, offloaded })
const bytes = new Uint8Array([1, 2, 3])
const readImage =
  (seen: ImageRef[] = []) =>
  (r: ImageRef) => {
    seen.push(r)
    return Promise.resolve(bytes)
  }

describe('toPromptBlocks', () => {
  it('passes text through untouched', async () => {
    const blocks = await toPromptBlocks([{ type: 'text', text: 'hi' }], { acceptsImages: false })
    expect(blocks).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('sends an image as base64 data when the CLI accepts images', async () => {
    const seen: ImageRef[] = []
    const blocks = await toPromptBlocks([{ type: 'text', text: 'look' }, image()], {
      acceptsImages: true,
      readImage: readImage(seen),
    })
    expect(blocks).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', mimeType: 'image/png', data: Buffer.from(bytes).toString('base64') },
    ])
    expect(seen).toEqual([ref])
  })

  it('describes the image in text when the CLI does not accept images', async () => {
    const blocks = await toPromptBlocks([image()], { acceptsImages: false, readImage: readImage() })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[0]).toMatchObject({ text: expect.stringContaining('image omitted') as unknown })
  })

  it('sends an offloaded image as its placeholder text without reading it', async () => {
    const seen: ImageRef[] = []
    const blocks = await toPromptBlocks([image(true)], { acceptsImages: true, readImage: readImage(seen) })
    expect(blocks[0]?.type).toBe('text')
    expect(seen).toEqual([])
  })

  it('fails clearly when the harness has no attachment service', async () => {
    await expect(toPromptBlocks([image()], { acceptsImages: true })).rejects.toThrow(LlmError)
  })

  it('fails clearly when an image cannot be read', async () => {
    const failing = (): Promise<Uint8Array> => Promise.reject(new Error('gone'))
    const error: unknown = await toPromptBlocks([image()], { acceptsImages: true, readImage: failing }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).message).toContain('shot.png')
  })

  it('passes the cancellation signal to the reader', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    await toPromptBlocks(
      [image()],
      {
        acceptsImages: true,
        readImage: (_r, signal) => {
          received = signal
          return Promise.resolve(bytes)
        },
      },
      controller.signal,
    )
    expect(received).toBe(controller.signal)
  })
})
