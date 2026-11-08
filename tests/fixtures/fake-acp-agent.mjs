#!/usr/bin/env node
// A scripted ACP agent speaking JSON-RPC over stdio, written from the public ACP
// spec. The prompt text selects a scenario:
//   WRITE <file>   ask permission, then create the file
//   AUTO <file>    create the file without asking
//   READ           run a read tool that reports no permission request
//   HANG           run until session/cancel
//   CRASH          exit with code 3
//   WHICH MODEL    report the selected model
//   anything else  echo the prompt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const capabilities = {
  loadSession: true,
  sessionCapabilities: { resume: {}, delete: {}, close: {} },
}
const sessions = new Map()
let currentModel = 'fake-small'
const configOptions = () => [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: currentModel,
    options: [
      { value: 'fake-small', name: 'Fake Small' },
      { value: 'fake-large', name: 'Fake Large' },
    ],
  },
]
const waiting = new Map()
let nextRequestId = 1000
let nextToolId = 1
let cancelTurn

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
const respond = (id, result) => send({ id, result })
const update = (sessionId, body) => send({ method: 'session/update', params: { sessionId, update: body } })
const say = (sessionId, text) =>
  update(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text },
  })

function request(method, params) {
  const id = nextRequestId++
  send({ id, method, params })
  return new Promise((resolve) => waiting.set(id, resolve))
}

async function writeWithPermission(sessionId, file) {
  const toolCallId = `tool-${nextToolId++}`
  const path = join(sessions.get(sessionId).cwd, file)
  update(sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId,
    title: 'write',
    kind: 'edit',
    status: 'pending',
    rawInput: {},
  })
  update(sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId,
    status: 'in_progress',
    rawInput: { path, content: 'hi\n' },
    locations: [{ path }],
  })
  const { outcome } = await request('session/request_permission', {
    sessionId,
    toolCall: {
      toolCallId,
      title: path,
      kind: 'edit',
      status: 'pending',
      content: [{ type: 'diff', path, oldText: null, newText: 'hi\n' }],
    },
    options: [
      { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  })
  if (outcome.outcome === 'cancelled') return 'cancelled'
  if (outcome.optionId !== 'once') {
    update(sessionId, {
      sessionUpdate: 'tool_call_update',
      toolCallId,
      status: 'failed',
      rawOutput: 'rejected by user',
    })
    say(sessionId, 'The write was rejected.')
    return 'end_turn'
  }
  writeFileSync(path, 'hi\n')
  update(sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId,
    status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: `Created ${file}` } }],
  })
  say(sessionId, 'done')
  return 'end_turn'
}

function writeWithoutAsking(sessionId, file) {
  const toolCallId = `tool-${nextToolId++}`
  const path = join(sessions.get(sessionId).cwd, file)
  update(sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId,
    title: 'write',
    kind: 'edit',
    status: 'in_progress',
    rawInput: { path },
  })
  writeFileSync(path, 'hi\n')
  update(sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId,
    status: 'completed',
    rawOutput: { output: `Created ${file}` },
  })
  say(sessionId, 'done')
  return 'end_turn'
}

function readTool(sessionId) {
  const toolCallId = `tool-${nextToolId++}`
  update(sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId,
    title: 'cat a.txt',
    kind: 'execute',
    status: 'in_progress',
    rawInput: { command: 'cat a.txt' },
  })
  update(sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId,
    status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'contents' } }],
  })
  // Deliberately no text afterwards: the final harness step then has no blocks.
  return 'end_turn'
}

function hang(sessionId) {
  say(sessionId, 'working')
  return new Promise((resolve) => {
    cancelTurn = () => resolve('cancelled')
  })
}

function runPrompt(sessionId, text) {
  if (text.trim() === 'WHICH MODEL') {
    say(sessionId, `model=${currentModel}`)
    return 'end_turn'
  }
  const [command, argument] = text.trim().split(/\s+/)
  switch (command) {
    case 'WRITE':
      return writeWithPermission(sessionId, argument)
    case 'AUTO':
      return writeWithoutAsking(sessionId, argument)
    case 'READ':
      return readTool(sessionId)
    case 'HANG':
      return hang(sessionId)
    case 'CRASH':
      return process.exit(3)
    default:
      update(sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } })
      say(sessionId, `echo: ${text}`)
      return 'end_turn'
  }
}

async function handleRequest({ id, method, params }) {
  switch (method) {
    case 'initialize':
      return respond(id, { protocolVersion: 1, agentCapabilities: capabilities, authMethods: [] })
    case 'session/new': {
      const sessionId = `fake-${sessions.size + 1}`
      sessions.set(sessionId, { cwd: params.cwd })
      return respond(id, { sessionId, configOptions: configOptions() })
    }
    case 'session/resume':
    case 'session/load':
      sessions.set(params.sessionId, { cwd: params.cwd })
      return respond(id, { configOptions: configOptions() })
    case 'session/set_config_option':
      if (params.configId === 'model') currentModel = params.value
      return respond(id, { configOptions: configOptions() })
    case 'session/delete':
    case 'session/close':
      sessions.delete(params.sessionId)
      return respond(id, {})
    case 'session/prompt': {
      const text = params.prompt.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join(' ')
      return respond(id, { stopReason: await runPrompt(params.sessionId, text) })
    }
    default:
      return send({ id, error: { code: -32601, message: `unknown method ${method}` } })
  }
}

createInterface({ input: process.stdin })
  .on('line', (line) => {
    const message = JSON.parse(line)
    if (message.method === 'session/cancel') {
      cancelTurn?.()
      return
    }
    if (message.method === undefined) {
      waiting.get(message.id)?.(message.result)
      waiting.delete(message.id)
      return
    }
    void handleRequest(message)
  })
  .on('close', () => process.exit(0))
