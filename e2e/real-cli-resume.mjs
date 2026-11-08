// Run after e2e/real-cli.mjs and a server restart (`e2e/start-server.sh --keep`): the
// session must reattach to the same CLI session and remember what it did.
//
//   E2E_CLI_ID=codex node e2e/real-cli-resume.mjs
import { cliId, fileFor, writePrompt } from './cli-prompts.mjs'
import { nativeSessionIds, openHarness, sessionEvents, turnEnds } from './lib.mjs'

const { bodyText, until, openSession, send, scenario, finish } = await openHarness()
const ID = cliId()
const PROMPT = writePrompt(ID)
const FOLLOWUP =
  'What is the exact name of the file you created earlier in this conversation? Reply with only the file name. Do not use any tools.'

await scenario(`${ID} resume: a restarted server reattaches to the same CLI session`, async () => {
  const before = nativeSessionIds(PROMPT)
  if (before.length !== 1) throw new Error(`expected one native session, found ${before.length}`)
  // Session titles stop at the first full stop, which here is inside the file name.
  await openSession(`Create a file named hello-${ID}`)
  await send(FOLLOWUP)
  await until(() => turnEnds(PROMPT).length >= 2, 'follow-up turn end', 180_000)
  const after = nativeSessionIds(PROMPT)
  if (after.length !== 1 || after[0] !== before[0]) throw new Error(`native session changed: ${before} -> ${after}`)
  if ((await bodyText()).includes('无法恢复')) throw new Error('a fresh-session notice appeared')
  const reply = sessionEvents(PROMPT)
    .filter((event) => event.type === 'assistant/message')
    .at(-1)
    ?.data.message.content.filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!(reply ?? '').includes(fileFor(ID))) throw new Error(`CLI does not remember: ${JSON.stringify(reply)}`)
})

await finish()
