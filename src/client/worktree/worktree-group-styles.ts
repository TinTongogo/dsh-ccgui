/**
 * Styles for the 「Worktrees」 group in the sidebar. Heights, type and colors follow the
 * harness's own session rows (32px, 14px titles, 10px times) through its design tokens, and
 * the indents line the header up with the session rows above it, so the group reads as part of
 * the repository's tree rather than something added on.
 * @module dsh-ccgui/client/worktree/worktree-group-styles
 */

import { ANCHOR_ATTRIBUTE } from './worktree-anchors.ts'

export const WG = {
  group: 'dsh-wtg',
  header: 'dsh-wtg-header',
  toggle: 'dsh-wtg-toggle',
  chevron: 'dsh-wtg-chevron',
  glyph: 'dsh-wtg-glyph',
  iconButton: 'dsh-wtg-icon-button',
  worktree: 'dsh-wtg-worktree',
  session: 'dsh-wtg-session',
  label: 'dsh-wtg-label',
  time: 'dsh-wtg-time',
  empty: 'dsh-wtg-empty',
} as const

const INDENT = 'var(--dsh-workspace-indent, 0px)'
/** Where the harness's session rows start, past the tree guide's elbow (see session-tree-styles.ts). */
const HEADER_SHIFT = '28px'
const WORKTREE_SHIFT = '40px'
const SESSION_SHIFT = '64px'
const ROW_HEIGHT = '32px'
const HOVER = 'var(--dsw-alias-interactive-bg-hover)'

export const WORKTREE_GROUP_STYLES = `
[role="tree"] :has(> * > [data-row-key^="workspace:"][aria-expanded="false"]) > [${ANCHOR_ATTRIBUTE}] { display: none; }
.${WG.group} { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.${WG.header}, .${WG.worktree}, .${WG.session} {
  display: flex; align-items: center; box-sizing: border-box; height: ${ROW_HEIGHT};
  border-radius: var(--dsw-radius-md); cursor: pointer; user-select: none;
}
.${WG.header} { margin-inline-start: calc(${HEADER_SHIFT} + ${INDENT}); padding: 0 6px 0 2px; }
.${WG.worktree} {
  gap: var(--dsh-sidebar-label-gap, 6px); margin-inline-start: calc(${WORKTREE_SHIFT} + ${INDENT}); padding: 0 6px 0 2px;
  font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary);
}
.${WG.session} {
  gap: 6px; margin-inline-start: calc(${SESSION_SHIFT} + ${INDENT}); padding: 0 8px;
  font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary);
}
.${WG.header}:hover, .${WG.worktree}:hover, .${WG.session}:hover, .${WG.session}[aria-selected="true"] { background: ${HOVER}; }
.${WG.worktree}:focus-visible, .${WG.session}:focus-visible, .${WG.toggle}:focus-visible, .${WG.iconButton}:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, currentColor); outline-offset: -2px;
}
.${WG.toggle} {
  display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; height: 100%; padding: 0;
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary);
  font-size: 13px; line-height: 20px; text-align: left; cursor: pointer;
}
.${WG.chevron}, .${WG.glyph} {
  display: inline-flex; flex: none; color: var(--dsw-alias-label-caption);
  transition: transform 0.15s var(--ds-ease-in-out, ease);
}
[aria-expanded="true"] > .${WG.chevron} { transform: rotate(90deg); }
.${WG.glyph} { color: var(--dsw-alias-label-tertiary); }
.${WG.label} { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${WG.time} { flex: none; font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.${WG.iconButton} {
  display: inline-flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0;
  border: none; border-radius: var(--dsw-radius-xs); background: transparent;
  color: var(--dsw-alias-label-tertiary); cursor: pointer; opacity: 0;
}
.${WG.header}:hover .${WG.iconButton}, .${WG.worktree}:hover .${WG.iconButton},
.${WG.header}:focus-within .${WG.iconButton}, .${WG.worktree}:focus-within .${WG.iconButton} { opacity: 1; }
.${WG.iconButton}:hover { color: var(--dsw-alias-label-primary); }
@media (hover: none) { .${WG.iconButton} { opacity: 1; } }
.${WG.empty} {
  display: flex; align-items: center; height: 28px; margin-inline-start: calc(${SESSION_SHIFT} + ${INDENT});
  font-size: 12px; color: var(--dsw-alias-label-tertiary);
}
@media (prefers-reduced-motion: reduce) { .${WG.chevron} { transition: none; } }
`
