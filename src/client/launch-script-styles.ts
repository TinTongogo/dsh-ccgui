/**
 * Styles for the startup script control and its manager. Colors, radii and type come from
 * the harness's design tokens, so both themes follow without a palette of our own.
 * @module dsh-ccgui/client/launch-script-styles
 */

export const LS = {
  group: 'dsh-ls-group',
  run: 'dsh-ls-run',
  more: 'dsh-ls-more',
  menuRow: 'dsh-ls-menu-row',
  menuName: 'dsh-ls-menu-name',
  menuCommand: 'dsh-ls-menu-command',
  dialog: 'dsh-ls-dialog',
  list: 'dsh-ls-list',
  row: 'dsh-ls-row',
  rowText: 'dsh-ls-row-text',
  rowName: 'dsh-ls-row-name',
  rowCommand: 'dsh-ls-row-command',
  badge: 'dsh-ls-badge',
  rowActions: 'dsh-ls-row-actions',
  iconButton: 'dsh-ls-icon-button',
  empty: 'dsh-ls-empty',
  form: 'dsh-ls-form',
  field: 'dsh-ls-field',
  label: 'dsh-ls-label',
  textarea: 'dsh-ls-textarea',
  hint: 'dsh-ls-hint',
  error: 'dsh-ls-error',
  footer: 'dsh-ls-footer',
} as const

const MONO = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)'

// The two header buttons read as one split control: the run button carries the
// action, the narrow chevron opens the list. Metrics follow the header's own
// 28px icon buttons, like the terminal entry beside it.
export const LAUNCH_SCRIPT_STYLES = `
.${LS.group} { display: inline-flex; align-items: center; flex: none; }
.${LS.run} { flex: none; width: 28px; padding: 0; color: var(--dsw-alias-label-secondary); }
.${LS.run}[data-has-more] { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.${LS.run} svg { width: 15px; height: 15px; }
.${LS.more} {
  flex: none; width: 16px; padding: 0; color: var(--dsw-alias-label-tertiary);
  border-top-left-radius: 0; border-bottom-left-radius: 0;
}
.${LS.more} svg { width: 12px; height: 12px; }
.${LS.menuRow} { display: flex; flex-direction: column; min-width: 0; max-width: 280px; }
.${LS.menuName} { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${LS.menuCommand} {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ${MONO}; font-size: 11px; color: var(--dsw-alias-label-tertiary);
}
.${LS.dialog} { width: min(480px, 100%); }
.${LS.list} {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow-y: auto; }
.${LS.row} {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 4px 4px 10px;
  border-radius: var(--dsw-radius-md);
}
.${LS.row}:hover, .${LS.row}:focus-within { background: var(--dsw-alias-interactive-bg-hover); }
.${LS.rowText} { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.${LS.rowName} {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
}
.${LS.rowName} > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${LS.rowCommand} {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ${MONO}; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
}
.${LS.badge} {
  flex: none; padding: 0 6px; border-radius: var(--dsw-radius-sm);
  font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-state-business-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
.${LS.rowActions} { display: flex; flex: none; gap: 2px; opacity: 0; }
.${LS.row}:hover .${LS.rowActions}, .${LS.row}:focus-within .${LS.rowActions} { opacity: 1; }
.${LS.iconButton} { width: 28px; padding: 0; color: var(--dsw-alias-label-secondary); }
.${LS.iconButton}[data-danger] { color: var(--dsw-alias-state-error-primary); }
.${LS.iconButton} svg { width: 15px; height: 15px; }
.${LS.empty} {
  padding: 20px 12px; border: 0.5px dashed var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md);
  text-align: center; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary);
}
.${LS.form} { display: flex; flex-direction: column; gap: 14px; }
.${LS.field} { display: flex; flex-direction: column; gap: 6px; }
.${LS.label} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
/* Three 18px lines plus the 8px padding above and below and the 0.5px borders. The
   textarea starts here and the person can drag it taller; anything longer scrolls. */
.${LS.textarea} {
  box-sizing: border-box; width: 100%; min-height: 71px; padding: 8px 10px; resize: vertical;
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); outline: none;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-family: ${MONO}; font-size: 12px; line-height: 18px;
}
.${LS.textarea}:focus { border-color: var(--dsw-alias-state-business-primary); }
.${LS.hint} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.${LS.error} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.${LS.footer} { display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; }
.${LS.footer} > :first-child[data-leading] { margin-right: auto; }
`
