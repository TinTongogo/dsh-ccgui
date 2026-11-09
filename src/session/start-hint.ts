/**
 * What to tell the user after a CLI fails to start. The default asks them to
 * install and log in, but an adapter pulled by `npx` can fail because npm left
 * its cache half-installed (a skipped optional dependency, an interrupted
 * download). Reinstalling globally does not help there: npx keeps reusing the
 * broken cache until that directory is deleted.
 * @module dsh-ccgui/session/start-hint
 */

import { fileURLToPath } from 'node:url'

const INSTALL_HINT = '请确认它已安装并完成登录。'
const REINSTALL_HINT = '它的安装不完整，请按上面的提示重新安装。'

/** Errors that mean files are missing from the install, not that the CLI itself refused. */
const INCOMPLETE_INSTALL = /Missing optional dependency|Cannot find module|ERR_MODULE_NOT_FOUND/

/** An npx cache entry, `<npm cache>/_npx/<hash>`, as a path or a `file://` URL. */
const NPX_ENTRY = /[^\s'"()]*[\\/]_npx[\\/][0-9a-f]+/

function npxEntry(message: string): string | undefined {
  const found = NPX_ENTRY.exec(message)?.[0]
  if (found === undefined) return undefined
  return found.startsWith('file:') ? fileURLToPath(found) : found
}

/**
 * @param message - the startup error's text.
 * @returns the sentence to append to the startup failure.
 */
export function startHint(message: string): string {
  if (!INCOMPLETE_INSTALL.test(message)) return INSTALL_HINT
  const entry = npxEntry(message)
  if (entry === undefined) return REINSTALL_HINT
  return `npx 缓存里的安装不完整，请删除 ${entry} 后重试，下次启动会重新下载。`
}
