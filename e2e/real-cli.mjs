// A real CLI through the real Web UI. This spends the account's quota, so it only sends
// short prompts and each run should pick the cheapest model.
//
//   E2E_CLI='Codex CLI' E2E_CLI_ID=codex E2E_MODEL='5.6 Luna' node e2e/real-cli.mjs
//
// Run e2e/real-cli-resume.mjs after restarting the server.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cliId, fileFor, writePrompt } from './cli-prompts.mjs'
import { openHarness, sessionEvents, turnEnds, WORKSPACE } from './lib.mjs'

const { page, sleep, bodyText, until, newCliSession, modelNames, chooseModel, send, scenario, finish } =
  await openHarness()
const CLI = process.env.E2E_CLI
const MODEL = process.env.E2E_MODEL
const ID = cliId()
const MODEL_TIMEOUT = 180_000
const PROMPT = writePrompt(ID)
const FORBIDDEN = `forbidden-${ID}.txt`
const REJECT = `Create a file named ${FORBIDDEN} containing the word no, using your file write tool. If you are not allowed, reply with the single word denied and do not try anything else.`
// A duration nothing else on this machine runs, so the check below only sees this CLI's child.
// Claude Code refuses a bare `sleep`, and moves a command past ten minutes to the background.
const SLEEP = `sleep ${300 + (Date.now() % 250)}`
// The `:` keeps the sleep a child of the shell, so stopping has to end the whole tree.
const CANCEL = `Run this exact shell command and nothing else: sh -c '${SLEEP}; :'`
const AFTER_CANCEL = `Reply with the single word ok. Do not use any tools. (${ID} after cancel)`
// Codex keeps a started command running as a background terminal after an interrupt, and
// only ends it when its session closes. Set this for such a CLI: stopping still has to end
// the turn, leave the session usable, and shutting down still has to leave nothing behind.
const KEEPS_BACKGROUND_COMMANDS = process.env.E2E_KEEPS_BACKGROUND_COMMANDS === '1'
// A comma-separated list of steps to run, for example to save quota after a small fix.
const ONLY = process.env.E2E_ONLY?.split(',')
const step = (key, name, run) => (ONLY === undefined || ONLY.includes(key) ? scenario(name, run) : undefined)
const approvalPending = async () => (await bodyText()).includes('等待审批')
const sleepRunning = () => {
  try {
    return execFileSync('pgrep', ['-fx', SLEEP]).length > 0
  } catch {
    return false
  }
}

async function runUntilEnded(prompt, approve) {
  const deadline = Date.now() + MODEL_TIMEOUT
  let asked = false
  while (Date.now() < deadline) {
    if (turnEnds(prompt).length >= 1) return asked
    if (await approvalPending()) {
      asked = true
      await page
        .getByRole('button', { name: '允许一次' })
        .click()
        .catch(() => {})
      await sleep(600)
    } else if (!approve) {
      await sleep(200)
    }
    await sleep(400)
  }
  throw new Error(`turn did not end: ${prompt}`)
}

async function startOnCli() {
  await newCliSession(CLI)
  if (MODEL !== undefined) await chooseModel(CLI, MODEL, MODEL_TIMEOUT)
}

let askedPermission = false

await step('models', `${CLI} models: the menu lists real models`, async () => {
  await newCliSession(CLI)
  await until(async () => (await modelNames(CLI)).length > 1, 'real model rows', MODEL_TIMEOUT)
  const names = await modelNames(CLI)
  if (!names[0].endsWith('（默认）')) throw new Error(`no named default: ${names.slice(0, 3).join()}`)
  console.log(`  ${CLI}: ${names.length} rows, default ${names[0]}`)
})

await step('write', `${CLI} write: the file appears and the card shows it`, async () => {
  await startOnCli()
  await send(PROMPT)
  askedPermission = await runUntilEnded(PROMPT, true)
  console.log(`  ${CLI}: asked permission: ${askedPermission}`)
  const [end] = turnEnds(PROMPT)
  if (end.data.reason.kind !== 'completed')
    throw new Error(`turn ended: ${JSON.stringify(end.data.reason).slice(0, 300)}`)
  if (!existsSync(join(WORKSPACE, fileFor(ID)))) throw new Error(`${fileFor(ID)} missing`)
  if (!sessionEvents(PROMPT).some((event) => event.type === 'tool/call')) throw new Error('no tool call was mirrored')
})

await step('reject', `${CLI} reject: a refused write never happens`, async () => {
  if (!askedPermission) {
    console.log(`  ${CLI}: skipped, this CLI did not ask for permission`)
    return
  }
  await startOnCli()
  await send(REJECT)
  await until(approvalPending, 'approval card', MODEL_TIMEOUT)
  await page.getByRole('button', { name: '拒绝' }).click()
  await until(() => turnEnds(REJECT).length >= 1, 'turn end', MODEL_TIMEOUT)
  if (existsSync(join(WORKSPACE, FORBIDDEN))) throw new Error('file written after rejection')
})

await step('cancel', `${CLI} cancel: stop ends the running command`, async () => {
  await startOnCli()
  await send(CANCEL)
  const deadline = Date.now() + MODEL_TIMEOUT
  while (!sessionEvents(CANCEL).some((event) => event.type === 'tool/call') || (await approvalPending())) {
    if (Date.now() > deadline) throw new Error('the command never started')
    if (await approvalPending())
      await page
        .getByRole('button', { name: '允许一次' })
        .click()
        .catch(() => {})
    await sleep(500)
  }
  // Some CLIs run commands inside their own process, leaving no child to look for.
  const looked = Date.now()
  while (!sleepRunning() && Date.now() - looked < 5000) await sleep(250)
  const hadChild = sleepRunning()
  console.log(`  ${CLI}: command ran as a child process: ${hadChild}`)
  await page
    .getByRole('button', { name: /停止|中断|取消/ })
    .last()
    .click()
  await until(() => turnEnds(CANCEL).length >= 1, 'cancelled turn end', 30_000)
  const [end] = turnEnds(CANCEL)
  if (end.data.reason.kind !== 'aborted')
    throw new Error(`turn ended: ${JSON.stringify(end.data.reason).slice(0, 300)}`)
  if (hadChild && !KEEPS_BACKGROUND_COMMANDS) await until(async () => !sleepRunning(), `${SLEEP} to die`, 15_000)
  await sleep(1000)
  await send(AFTER_CANCEL)
  await until(() => turnEnds(CANCEL).length >= 2, 'turn after cancel', MODEL_TIMEOUT)
  const after = turnEnds(CANCEL)[1]
  if (after.data.reason.kind !== 'completed')
    throw new Error(`next turn ended: ${JSON.stringify(after.data.reason).slice(0, 300)}`)
})

await finish()
