/**
 * The worktree feature's glyphs, drawn at the 16px the harness's sidebar and menus use, in
 * `currentColor` so they follow the row's color and theme.
 * @module dsh-ccgui/client/worktree/worktree-icons
 */

import type { ReactElement } from 'react'

const STROKE = { stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' } as const

/** A branch with a plus: "new worktree", in the context menu and on the group header. */
export function NewWorktreeIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1.5" {...STROKE} />
      <circle cx="4.5" cy="12.5" r="1.5" {...STROKE} />
      <circle cx="11.5" cy="5" r="1.5" {...STROKE} />
      <path d="M4.5 5v6M11.5 6.5c0 2.5-3 2.5-6.2 4.6" {...STROKE} />
      <path d="M12.5 10.5v4M10.5 12.5h4" {...STROKE} />
    </svg>
  )
}

/** A plain branch, in front of each worktree row. */
export function BranchIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1.5" {...STROKE} />
      <circle cx="5" cy="12.5" r="1.5" {...STROKE} />
      <circle cx="11.5" cy="5" r="1.5" {...STROKE} />
      <path d="M5 5v6M11.5 6.5c0 2.5-3 2.5-5.8 4.6" {...STROKE} />
    </svg>
  )
}

/** Points right when closed; the row turns it a quarter when open. */
export function ChevronIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.5 4.5 10 8l-3.5 3.5" {...STROKE} />
    </svg>
  )
}

/** A speech bubble with a plus: "new session in this worktree". */
export function NewSessionIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5a5.5 5.5 0 1 0 2.6 10.35L13.5 13.5l-.65-2.9A5.5 5.5 0 0 0 8 2.5Z" {...STROKE} />
      <path d="M8 5.75v4.5M5.75 8h4.5" {...STROKE} />
    </svg>
  )
}
