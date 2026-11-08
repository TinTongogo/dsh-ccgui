import { describe, expect, it } from 'vitest'
import type { RequestMessage } from '@deepseek-ai/dsh-llm'
import { collect, setupWith } from './fixtures/cli-session-helpers.ts'

const ref = { attachmentId: 'img-1', mediaType: 'image/jpeg' }
const bytes = new Uint8Array([9, 8, 7])

const withImage = (id: string): RequestMessage =>
  ({
    id,
    role: 'user',
    content: [
      { type: 'text', text: 'what is this?' },
      { type: 'image', attachment: ref },
    ],
    source: { kind: 'user' },
  }) as unknown as RequestMessage

describe('CliSession images', () => {
  it('forwards a pasted image to a CLI that accepts images', async () => {
    const { fake, session } = setupWith({ readImage: () => Promise.resolve(bytes) }, () => 'end_turn' as const)
    fake.capabilities = { promptCapabilities: { image: true } }
    await collect(session.stream({ messages: [withImage('1')] }))
    expect(fake.prompts).toEqual([
      [
        { type: 'text', text: 'what is this?' },
        { type: 'image', mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') },
      ],
    ])
  })

  it('tells a CLI without image support that an image was attached', async () => {
    const { fake, session } = setupWith({ readImage: () => Promise.resolve(bytes) }, () => 'end_turn' as const)
    await collect(session.stream({ messages: [withImage('1')] }))
    const [prompt] = fake.prompts
    expect(prompt?.map((block) => block.type)).toEqual(['text', 'text'])
  })

  it('sends a message that is only an image', async () => {
    const onlyImage = {
      id: '1',
      role: 'user',
      content: [{ type: 'image', attachment: ref }],
      source: { kind: 'user' },
    } as unknown as RequestMessage
    const { fake, session } = setupWith({ readImage: () => Promise.resolve(bytes) }, () => 'end_turn' as const)
    fake.capabilities = { promptCapabilities: { image: true } }
    await collect(session.stream({ messages: [onlyImage] }))
    expect(fake.prompts[0]?.[0]?.type).toBe('image')
  })
})
