/**
 * The text "添加到对话" puts in the composer for a file or folder path.
 * @module dsh-ccgui/client/path-mention
 */

/**
 * Format a path the way CC GUI's file tree "+" does, so agent CLIs read it as a file
 * reference. CLIs take `@` mentions up to the next whitespace, hence the quotes; the
 * trailing space lets the user keep typing without first separating the mention.
 * @param path - absolute path from the harness's file tree.
 * @returns the mention text to insert.
 */
export function mentionToken(path: string): string {
  const slashed = path.trim().replace(/\\/gu, '/')
  return /\s/u.test(slashed) ? `@"${slashed}" ` : `@${slashed} `
}
