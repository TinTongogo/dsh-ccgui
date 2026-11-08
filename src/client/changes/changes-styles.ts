/**
 * Class names and CSS of the 变更 panel. Metrics and status colors follow CC GUI's panel
 * (32px rows, 12px monospace paths, IntelliJ-style letter colors with a dark-theme pair);
 * surfaces, borders and text use the harness's theme tokens so the panel sits in its sidebar.
 * @module dsh-ccgui/client/changes/changes-styles
 */

const P = 'dsh-ccgui-changes'

export const CLS = {
  panel: P,
  header: `${P}-header`,
  headerRow: `${P}-header-row`,
  title: `${P}-title`,
  distance: `${P}-distance`,
  headerButtons: `${P}-header-buttons`,
  headerButton: `${P}-header-button`,
  spinning: `${P}-spinning`,
  branchMenu: `${P}-branch-menu`,
  branchButton: `${P}-branch-button`,
  branchName: `${P}-branch-name`,
  branchForm: `${P}-branch-form`,
  branchInput: `${P}-branch-input`,
  remoteItem: `${P}-remote-item`,
  remoteTag: `${P}-remote-tag`,
  summary: `${P}-summary`,
  summaryTitle: `${P}-summary-title`,
  summarySelected: `${P}-summary-selected`,
  scroll: `${P}-scroll`,
  list: `${P}-list`,
  group: `${P}-group`,
  groupHeader: `${P}-group-header`,
  groupTitle: `${P}-group-title`,
  groupCount: `${P}-group-count`,
  groupActions: `${P}-group-actions`,
  groupAction: `${P}-group-action`,
  danger: `${P}-danger`,
  collapsed: `${P}-collapsed`,
  row: `${P}-row`,
  checkbox: `${P}-checkbox`,
  letter: `${P}-letter`,
  badge: `${P}-badge`,
  path: `${P}-path`,
  dir: `${P}-dir`,
  name: `${P}-name`,
  stats: `${P}-stats`,
  add: `${P}-add`,
  del: `${P}-del`,
  rowActions: `${P}-row-actions`,
  iconButton: `${P}-icon-button`,
  empty: `${P}-empty`,
  error: `${P}-error`,
  commit: `${P}-commit`,
  commitInput: `${P}-commit-input`,
  commitRow: `${P}-commit-row`,
  commitButton: `${P}-commit-button`,
  aiButton: `${P}-ai-button`,
  diff: `${P}-diff`,
  diffHeader: `${P}-diff-header`,
  diffPath: `${P}-diff-path`,
  diffSide: `${P}-diff-side`,
  diffBody: `${P}-diff-body`,
  diffHunk: `${P}-diff-hunk`,
  diffNote: `${P}-diff-note`,
  diffLine: `${P}-diff-line`,
  diffNumber: `${P}-diff-number`,
  diffText: `${P}-diff-text`,
} as const

const DARK = 'body[data-ds-dark-theme]'

const LAYOUT = `
.${CLS.panel} { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;
  color: var(--dsw-alias-label-primary); font-size: 14px; }
.${CLS.header} { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2); }
.${CLS.headerRow} { display: flex; align-items: center; gap: 8px; }
.${CLS.title} { font-weight: 500; }
.${CLS.distance} { font-size: 12px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.${CLS.headerButtons} { margin-left: auto; display: flex; gap: 6px; }
.${CLS.headerButton}, .${CLS.branchButton} { display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; }
.${CLS.headerButton} { width: 30px; height: 30px; padding: 0; }
.${CLS.headerButton}:hover:not(:disabled), .${CLS.branchButton}:hover:not(:disabled),
.${CLS.iconButton}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.${CLS.headerButton}:disabled, .${CLS.branchButton}:disabled { cursor: default; opacity: 0.5; }
.${CLS.spinning} { animation: ${P}-spin 0.8s linear infinite; }
@keyframes ${P}-spin { to { transform: rotate(360deg); } }
.${CLS.branchMenu} { display: block; }
.${CLS.branchButton} { width: 100%; height: 32px; gap: 8px; padding: 0 10px; justify-content: flex-start; }
.${CLS.branchName} { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-align: left; color: var(--dsw-alias-label-primary); }
.${CLS.branchForm} { display: flex; gap: 6px; }
.${CLS.branchInput} { flex: 1; min-width: 0; height: 30px; padding: 0 8px; border-radius: var(--dsw-radius-md);
  border: 1px solid var(--dsw-alias-border-l3); background: transparent; color: inherit; font: inherit; font-size: 13px; }
.${CLS.remoteItem} { display: inline-flex; gap: 6px; align-items: baseline; }
.${CLS.remoteTag} { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.${CLS.summary} { display: flex; align-items: baseline; gap: 6px; padding: 8px 12px; }
.${CLS.summaryTitle} { font-weight: 500; }
.${CLS.summarySelected} { margin-left: auto; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.${CLS.scroll} { flex: 1; min-height: 0; overflow-y: auto; }
.${CLS.groupHeader} { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px;
  padding: 6px 12px 6px 8px; background: var(--dsw-alias-bg-layer-2); cursor: pointer; user-select: none; }
.${CLS.groupTitle} { font-weight: 500; }
.${CLS.groupCount} { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.${CLS.groupActions} { margin-left: auto; display: flex; gap: 8px; }
.${CLS.groupAction} { border: none; background: transparent; padding: 2px 4px; border-radius: var(--dsw-radius-sm);
  font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.${CLS.groupAction}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.${CLS.groupAction}:disabled { cursor: default; opacity: 0.5; }
.${CLS.danger} { color: var(--dsw-alias-state-error-primary); }
.${CLS.iconButton} { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
  padding: 0; border: none; border-radius: var(--dsw-radius-sm); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; }
.${CLS.collapsed} { transform: rotate(-90deg); }
.${CLS.checkbox} { width: 14px; height: 14px; margin: 0; flex: none; accent-color: var(--dsw-alias-state-business-primary); }
.${CLS.empty} { padding: 24px 12px; text-align: center; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.${CLS.error} { display: flex; align-items: flex-start; gap: 8px; margin: 8px 12px 0; padding: 6px 8px;
  border-radius: var(--dsw-radius-md); color: var(--dsw-alias-state-error-primary); font-size: 12px;
  white-space: pre-wrap; word-break: break-word; background: var(--dsw-alias-interactive-bg-hover); }
.${CLS.error} > span { flex: 1; }
.${CLS.commit} { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px;
  border-top: 1px solid var(--dsw-alias-border-l2); }
.${CLS.commitInput} { resize: vertical; min-height: 52px; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l3); background: transparent; color: inherit; font: inherit; font-size: 14px; }
.${CLS.commitRow} { display: flex; gap: 8px; }
.${CLS.commitButton} { flex: 1; height: 34px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;
  background: var(--dsw-alias-state-business-primary); color: #fff; }
.${CLS.commitButton}:disabled { cursor: default; background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-tertiary); }
.${CLS.aiButton} { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 34px;
  height: 34px; padding: 0; border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.${CLS.aiButton}:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
`

const ROWS = `
.${CLS.row} { position: relative; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
  font-size: 12px; }
.${CLS.row}:hover { background: var(--dsw-alias-interactive-bg-hover); }
.${CLS.letter} { width: 16px; flex: none; text-align: center; font-family: var(--dsw-font-mono, monospace); font-weight: 600; }
.${CLS.badge} { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 16px;
  height: 14px; padding: 0 2px; border-radius: 3px; font-size: 8px; font-weight: 700; line-height: 1; color: #fff; }
.${CLS.badge}[data-tone="blue"] { background: #3178c6; }
.${CLS.badge}[data-tone="yellow"] { background: #c9a400; }
.${CLS.badge}[data-tone="dark"] { background: #555; }
.${CLS.badge}[data-tone="orange"] { background: transparent; color: #e44d26; font-size: 11px; }
.${CLS.badge}[data-tone="plain"] { background: transparent; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.${CLS.path} { flex: 1; min-width: 0; display: flex; padding: 0; border: none; background: transparent; color: inherit;
  font-family: var(--dsw-font-mono, monospace); font-size: 12px; cursor: pointer; text-align: left; }
.${CLS.dir} { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;
  color: var(--dsw-alias-label-tertiary); }
.${CLS.name} { flex: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.${CLS.stats} { flex: none; display: flex; gap: 6px; font-variant-numeric: tabular-nums; }
.${CLS.add} { color: var(--dsw-alias-state-success-primary); }
.${CLS.del} { color: var(--dsw-alias-state-error-primary); }
.${CLS.rowActions} { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: none; gap: 2px;
  padding-left: 8px; background: var(--dsw-alias-bg-layer-1); }
.${CLS.row}:hover .${CLS.rowActions}, .${CLS.row}:focus-within .${CLS.rowActions} { display: flex; }
.${CLS.row}[data-status="M"], .${CLS.row}[data-status="C"], .${CLS.row}[data-status="T"] { --${P}-tone: #0088d2; }
.${CLS.row}[data-status="R"] { --${P}-tone: #0088d2; }
.${CLS.row}[data-status="A"] { --${P}-tone: #208a3c; }
.${CLS.row}[data-status="untracked"] { --${P}-tone: #b00020; }
.${CLS.row}[data-status="U"] { --${P}-tone: #e5534b; }
.${CLS.row}[data-status="D"] { --${P}-tone: var(--dsw-alias-label-tertiary); }
${DARK} .${CLS.row}[data-status="M"], ${DARK} .${CLS.row}[data-status="C"], ${DARK} .${CLS.row}[data-status="T"] { --${P}-tone: #589df6; }
${DARK} .${CLS.row}[data-status="R"] { --${P}-tone: #389fd6; }
${DARK} .${CLS.row}[data-status="A"] { --${P}-tone: #59a869; }
${DARK} .${CLS.row}[data-status="untracked"] { --${P}-tone: #e05555; }
.${CLS.letter}, .${CLS.name} { color: var(--${P}-tone); }
.${CLS.row}[data-status="D"] .${CLS.name} { text-decoration: line-through; opacity: 0.75; }
`

const DIFF = `
.${CLS.diff} { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.${CLS.diffHeader} { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2); }
.${CLS.diffPath} { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--dsw-font-mono, monospace); font-size: 12px; }
.${CLS.diffSide} { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.${CLS.diffBody} { flex: 1; min-height: 0; overflow: auto; font-family: var(--dsw-font-mono, monospace);
  font-size: 12px; line-height: 18px; }
.${CLS.diffHunk} { padding: 2px 8px; color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-bg-layer-2); }
.${CLS.diffNote} { padding: 4px 8px; color: var(--dsw-alias-label-tertiary); }
.${CLS.diffLine} { display: flex; min-width: max-content; }
.${CLS.diffLine}[data-kind="add"] { background: rgba(34, 197, 94, 0.1); }
.${CLS.diffLine}[data-kind="del"] { background: rgba(239, 68, 68, 0.1); }
.${CLS.diffNumber} { flex: none; width: 36px; padding-right: 6px; text-align: right; user-select: none;
  color: var(--dsw-alias-label-tertiary); }
.${CLS.diffText} { padding: 0 8px; white-space: pre; }
`

export const CHANGES_STYLES = `${LAYOUT}${ROWS}${DIFF}`
