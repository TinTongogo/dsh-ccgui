/**
 * The 变更 tab's chip title: its glyph before the name, as the harness's own tabs draw theirs.
 * Without a glyph a compact chip (see compact-tabs.ts) would have nothing to show but text.
 * @module dsh-ccgui/client/changes/changes-title
 */

import type { ReactElement } from 'react'
import { ChangesIcon } from './changes-icons.tsx'

export const CHANGES_TITLE = '变更'
const GLYPH_SIZE = 16

/** @returns the glyph followed by the name. */
export function ChangesTitle(): ReactElement {
  return (
    <>
      <ChangesIcon size={GLYPH_SIZE} />
      {CHANGES_TITLE}
    </>
  )
}
