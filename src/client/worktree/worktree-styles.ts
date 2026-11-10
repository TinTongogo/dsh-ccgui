/**
 * Styles for the 新建 Worktree dialog. Colors, radii and type come from the harness's design
 * tokens, so both themes follow without a palette of our own; field metrics match the startup
 * script form so the plugin's dialogs read alike.
 * @module dsh-ccgui/client/worktree/worktree-styles
 */

export const WT = {
  dialog: 'dsh-wt-dialog',
  body: 'dsh-wt-body',
  tabs: 'dsh-wt-tabs',
  tab: 'dsh-wt-tab',
  field: 'dsh-wt-field',
  label: 'dsh-wt-label',
  hint: 'dsh-wt-hint',
  picker: 'dsh-wt-picker',
  options: 'dsh-wt-options',
  option: 'dsh-wt-option',
  toggle: 'dsh-wt-toggle',
  status: 'dsh-wt-status',
  error: 'dsh-wt-error',
  footer: 'dsh-wt-footer',
} as const

/** Long branch lists scroll inside the dropdown rather than stretching the dialog. */
const OPTIONS_MAX_HEIGHT = '220px'

export const WORKTREE_STYLES = `
.${WT.dialog} { width: min(480px, 100%); }
.${WT.body} { display: flex; flex-direction: column; gap: 14px; }
.${WT.tabs} { display: flex; gap: 6px; }
.${WT.tab} {
  height: 28px; padding: 0 12px; border: none; border-radius: var(--dsw-radius-md);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 13px; line-height: 20px; cursor: pointer;
}
.${WT.tab}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.${WT.tab}[aria-selected="true"] {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); font-weight: 500;
}
.${WT.tab}:focus-visible { box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, currentColor); outline: none; }
.${WT.field} { display: flex; flex-direction: column; gap: 6px; }
.${WT.label} { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.${WT.hint} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.${WT.picker} { position: relative; display: flex; flex-direction: column; }
.${WT.options} {
  position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; right: 0;
  max-height: ${OPTIONS_MAX_HEIGHT}; overflow-y: auto; padding: 4px;
}
.${WT.option} {
  padding: 6px 8px; border-radius: var(--dsw-radius-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); cursor: pointer;
}
.${WT.option}[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.${WT.toggle} {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
}
.${WT.status} { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.${WT.error} {
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.${WT.footer} { display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; }
`
