import { readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// DSH's app-boot drops an icon that breaks these rules and shows its generic artwork instead,
// without failing the install, so a bad icon would otherwise go unnoticed.
const MAX_ICON_BYTES = 256 * 1024
const ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp']

const root = fileURLToPath(new URL('..', import.meta.url))

function readManifest(): { icon?: unknown; files?: unknown } {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('package.json is not an object')
  return parsed
}

function declaredIcon(): string {
  const { icon } = readManifest()
  if (typeof icon !== 'string') throw new Error('package.json: icon must be a string')
  return icon
}

describe('package icon', () => {
  it('is a relative path that stays inside the package', () => {
    const icon = declaredIcon()
    expect(isAbsolute(icon)).toBe(false)
    expect(relative(root, resolve(root, icon)).startsWith('..')).toBe(false)
  })

  it('is an image type and size DSH accepts', () => {
    const icon = declaredIcon()
    expect(ICON_EXTENSIONS).toContain(extname(icon).toLowerCase())
    const stat = statSync(resolve(root, icon))
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeLessThanOrEqual(MAX_ICON_BYTES)
  })

  it('is published with the package', () => {
    const { files } = readManifest()
    expect(files).toContain(relative(root, resolve(root, declaredIcon())))
  })
})
