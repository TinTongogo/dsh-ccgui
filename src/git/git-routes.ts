/**
 * HTTP routes the 变更 panel posts to, under `/dsh-ccgui/git/<operation>`. The harness's
 * web server leaves authentication to each route, so every request first asks the
 * `connection` service for a rejection: its Host/Origin fence stops cross-site and DNS-
 * rebinding callers, and its login-token check stops anyone who is not the signed-in browser.
 * @module dsh-ccgui/git/git-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { GIT_ROUTE_PREFIX } from '../constants.ts'
import { asBody, operationOf, runOperation, statusFor } from './git-requests.ts'
import type { Spawn } from './git-run.ts'

/** The parts of the harness's `webServer` service this module uses. */
export interface GitWebServer {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  }): () => void
}

/** The parts of the harness's `connection` service this module uses. */
export interface GitConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** Request bodies are a directory and a list of paths; anything larger is refused. */
const MAX_BODY_BYTES = 1024 * 1024

class BodyTooLarge extends Error {
  override name = 'BodyTooLarge'
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(payload))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge('请求内容过大')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the handler for every git route.
 * @param spawn - the subprocess service's spawn.
 * @param connection - the harness's trust check.
 * @param warn - logs failures that are not the user's doing.
 * @returns the request handler.
 */
export function gitHandler(
  spawn: Spawn,
  connection: GitConnection,
  warn: (message: string) => void,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      sendJson(res, rejection, { success: false, error: '未授权' })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: '只支持 POST' }, { allow: 'POST' })
      return
    }
    const name = (req.url ?? '').split('?')[0]?.split('/').pop() ?? ''
    const operation = operationOf(name)
    if (operation === undefined) {
      sendJson(res, 404, { success: false, error: '接口不存在' })
      return
    }
    try {
      const data = await runOperation(spawn, operation, asBody(await readJson(req)))
      sendJson(res, 200, { success: true, data })
    } catch (error: unknown) {
      const status = error instanceof BodyTooLarge ? 413 : error instanceof SyntaxError ? 400 : statusFor(error)
      if (status === 500) warn(`ccgui: git ${operation} failed: ${messageOf(error)}`)
      sendJson(res, status, { success: false, error: status === 500 ? 'Git 操作失败，请查看日志' : messageOf(error) })
    }
  }
}

/**
 * Register the git routes on the web server.
 * @param webServer - the harness's web server.
 * @param handler - the handler from {@link gitHandler}.
 * @returns the unregister function.
 */
export function registerGitRoutes(
  webServer: GitWebServer,
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): () => void {
  return webServer.register({ kind: 'prefix', path: GIT_ROUTE_PREFIX, handler })
}
