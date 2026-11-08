/**
 * Tree guides for the sidebar's session list, after desktop-cc-gui's repo tree: a thin line
 * drops from each workspace's folder icon and bends into every session row, which moves right
 * to make room for it. The harness offers no slot for this, so it is pure CSS over the rows'
 * markup; if that markup changes, the list simply loses its guides.
 * @module dsh-ccgui/client/session-tree-styles
 */

// The harness's CSS module classes carry a per-build hash. These hooks are its own stable
// data attributes, and each row sits alone in a hover-card wrapper inside its group section.
// Requiring a workspace row beside the sessions leaves the flat "in one list" mode untouched.
const GROUP = ':has(> * > [data-row-key^="workspace:"])'
const HEADER = ':has(> [data-row-key^="workspace:"])'
const ITEM = ':has(> [data-row-key^="session:"])'
const ROW = '[data-row-key^="session:"]'

const INDENT = 'var(--dsh-workspace-indent, 0px)'
/** Center of the 16px folder icon, measured from the row wrapper's left edge. */
const LINE_X = '20px'
/** Where the row's highlight starts, just past the end of the elbow. */
const ROW_SHIFT = '28px'
const ELBOW_WIDTH = '7px'
const ELBOW_RADIUS = '5px'
/** Rows sit 2px apart; the elbow starts in that gap so consecutive segments meet. */
const ROW_GAP = '2px'
/** From the first row up to just under the folder icon in the 34px workspace row. */
const FIRST_REACH = '9px'
const LINE = '1px solid var(--dsw-alias-border-l4)'
const CHIP_FILL = 'var(--dsw-alias-border-l2)'
/**
 * Every session but the last carries the line on past its elbow. `:has()` cannot nest, so the
 * last one is found with `of S` rather than by looking for a following session.
 */
const CONTINUED = `${ITEM}:not(:nth-last-child(1 of ${ITEM}))`

export const SESSION_TREE_STYLES = `
${GROUP} > ${ITEM} { position: relative; }
${GROUP} > ${ITEM} > ${ROW} {
  margin-inline-start: calc(${ROW_SHIFT} + ${INDENT});
  padding-inline-start: calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset));
}
${GROUP} > ${ITEM}::before,
${GROUP} > ${CONTINUED}::after {
  content: '';
  position: absolute;
  left: calc(${LINE_X} + ${INDENT});
  pointer-events: none;
  box-sizing: border-box;
}
${GROUP} > ${ITEM}::before {
  top: -${ROW_GAP};
  height: calc(50% + ${ROW_GAP});
  width: ${ELBOW_WIDTH};
  border-left: ${LINE};
  border-bottom: ${LINE};
  border-bottom-left-radius: ${ELBOW_RADIUS};
}
${GROUP} > ${HEADER} + ${ITEM}::before {
  top: -${FIRST_REACH};
  height: calc(50% + ${FIRST_REACH});
}
${GROUP} > ${CONTINUED}::after {
  top: 50%;
  bottom: 0;
  border-left: ${LINE};
}
${GROUP} > ${ITEM} [class*="_timestamp"] {
  padding: 0 4px;
  border-radius: 4px;
  background: ${CHIP_FILL};
}
${GROUP} > button {
  width: calc(100% - ${ROW_SHIFT} - ${INDENT});
  margin-inline-start: calc(${ROW_SHIFT} + ${INDENT});
}
`
