import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from '../../src/client/release-notes.ts'

// The tab ships bundled data while a release also writes docs/release-notes/vX.Y.Z.md.
// Keeping the shape and the files in step is what stops the two from drifting apart.
const notesDir = fileURLToPath(new URL('../../docs/release-notes/', import.meta.url))
const NOTES_FILE = /^v(.+)\.md$/
const SEMVER = /^\d+\.\d+\.\d+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parts(version: string): readonly number[] {
  return version.split('.').map(Number)
}

/** Newest first, the order the tab pages in. */
function compare(a: string, b: string): number {
  const left = parts(a)
  const right = parts(b)
  return (left[0] ?? 0) - (right[0] ?? 0) || (left[1] ?? 0) - (right[1] ?? 0) || (left[2] ?? 0) - (right[2] ?? 0)
}

describe('RELEASE_NOTES', () => {
  it('lists each version once, newest first', () => {
    const versions = RELEASE_NOTES.map((note) => note.version)
    expect(new Set(versions).size).toBe(versions.length)
    for (const version of versions) expect(version).toMatch(SEMVER)
    expect(versions).toEqual([...versions].sort((a, b) => compare(b, a)))
  })

  it('gives every page a date, a heading and at least one line', () => {
    for (const note of RELEASE_NOTES) {
      expect(note.date).toMatch(ISO_DATE)
      expect(note.sections.length).toBeGreaterThan(0)
      for (const section of note.sections) {
        expect(section.heading.trim()).not.toBe('')
        expect(section.items.length).toBeGreaterThan(0)
        for (const item of section.items) {
          expect(item.text.trim()).not.toBe('')
          if (item.title !== undefined) expect(item.title.trim()).not.toBe('')
        }
      }
    }
  })

  it('has a page for every release notes file in the repository', () => {
    const files = readdirSync(notesDir).filter((name) => NOTES_FILE.test(name))
    expect(files.length).toBeGreaterThan(0)
    const versions = new Set(RELEASE_NOTES.map((note) => note.version))
    for (const file of files) {
      const version = NOTES_FILE.exec(file)?.[1] ?? ''
      expect(versions.has(version)).toBe(true)
    }
  })
})
