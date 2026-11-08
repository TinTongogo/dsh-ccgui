import { describe, expect, it } from 'vitest'
import * as styles from '../src/client/model-menu-styles.ts'

const { MODEL_MENU_STYLES, ROOT_CLASS, ...others } = styles

describe('MODEL_MENU_STYLES', () => {
  // The harness's slot anchors set `display: contents` inline, which only `!important` beats,
  // and only a session showing the plugin's control may lose the harness's.
  it("hides the harness seat only beside the plugin's control", () => {
    expect(MODEL_MENU_STYLES).toContain(
      `[data-slot="conversation.input.right"]:has(.${ROOT_CLASS}) + [data-slot="conversation.input.model"] { display: none !important; }`,
    )
  })

  it('styles every class the menu renders', () => {
    for (const name of Object.values(others)) expect(MODEL_MENU_STYLES).toContain(`.${name}`)
  })

  // The composer switches these as its row runs out of width.
  it("follows the composer's compact display", () => {
    expect(MODEL_MENU_STYLES).toContain('var(--dsh-composer-model-icon-display, none)')
    expect(MODEL_MENU_STYLES).toContain('var(--dsh-composer-model-text-display, block)')
  })
})
