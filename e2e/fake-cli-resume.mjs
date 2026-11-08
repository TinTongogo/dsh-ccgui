// Run after e2e/fake-cli.mjs and a server restart (`e2e/start-server.sh --keep`).
import { openHarness } from './lib.mjs'

const FAILED_PROMPT = 'CRASH before restart'
const { bodyText, until, openSession, send, scenario, finish } = await openHarness()

// The failed turn's prompt still ends that session's history, and the fake CLI exits
// if it receives CRASH again. Getting an echo proves the prompt was not replayed.
await scenario('no replay: a prompt from a failed turn is not resent after a restart', async () => {
  await openSession(FAILED_PROMPT)
  await send('after restart')
  await until(async () => (await bodyText()).includes('echo: after restart'), 'echo of the new message', 30_000)
  const reply = await bodyText()
  if (reply.includes(`echo: ${FAILED_PROMPT}`)) throw new Error('the failed prompt was resent')
})

await finish()
