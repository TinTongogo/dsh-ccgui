/**
 * The settings page's 版本记录 tab: one page per release, newest first, so the tab opens on
 * the notes of the build the user is running. The arrows step one release at a time and the
 * dots jump straight to one; the release the running build belongs to is marked. Notes come
 * from release-notes.ts, which is bundled data rather than the repository's markdown files:
 * the client has no markdown reader and this page has to read the same offline.
 * @module dsh-ccgui/client/release-notes-section
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { RELEASE_NOTES } from './release-notes.ts'
import type { ReleaseNote, ReleaseNoteItem, ReleaseNoteSection } from './release-notes.ts'
import { PLUGIN_VERSION } from './settings-about.tsx'

const INTRO = '每个版本一页，翻页查看历史更新。'
const CURRENT_LABEL = '当前版本'
const EMPTY_TEXT = '还没有版本记录。'
const PREV_LABEL = '上一页'
const NEXT_LABEL = '下一页'
const DOTS_LABEL = '选择版本'
const NOTES_CLASS = 'dsh-ccgui-notes'
const pageName = (version: string): string => `v${version} 版本记录`
const pagePosition = (index: number, count: number): string => `第 ${index + 1} / ${count} 页`

// Pills and rows reuse the sizes of the neighbouring settings sections; only the pager is new.
export const RELEASE_NOTES_STYLES = `
.${NOTES_CLASS} { display: flex; flex-direction: column; gap: 12px; }
.${NOTES_CLASS}-page { display: flex; flex-direction: column; gap: 14px; padding: 16px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.04)); }
.${NOTES_CLASS}-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.${NOTES_CLASS}-version { color: var(--dsw-alias-label-primary); font-size: 15px; line-height: 22px; font-weight: 600; }
.${NOTES_CLASS}-current { padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; }
.${NOTES_CLASS}-date { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); font-size: 12px; line-height: 18px; }
.${NOTES_CLASS}-pager { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.${NOTES_CLASS}-step { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 6px; background: none; color: var(--dsw-alias-label-secondary); font-size: 16px; line-height: 1; cursor: pointer; }
.${NOTES_CLASS}-step:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.${NOTES_CLASS}-step:disabled { opacity: 0.35; cursor: default; }
.${NOTES_CLASS}-count { min-width: 44px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); font-size: 12px; line-height: 18px; text-align: center; }
.${NOTES_CLASS}-body { display: flex; flex-direction: column; gap: 14px; }
.${NOTES_CLASS}-section { display: flex; flex-direction: column; gap: 6px; }
.${NOTES_CLASS}-heading { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; font-weight: 500; }
.${NOTES_CLASS}-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.${NOTES_CLASS}-item { position: relative; padding-left: 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.${NOTES_CLASS}-item::before { content: '·'; position: absolute; left: 0; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.${NOTES_CLASS}-item strong { color: var(--dsw-alias-label-primary); font-weight: 500; }
.${NOTES_CLASS}-item code { padding: 1px 4px; border-radius: 4px; background: var(--dsw-alias-bg-tertiary, rgba(127, 127, 127, 0.14)); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.${NOTES_CLASS}-dots { display: flex; justify-content: center; gap: 2px; }
.${NOTES_CLASS}-dot { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: none; background: none; cursor: pointer; }
.${NOTES_CLASS}-dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-border-l3, #8a8a8a); }
.${NOTES_CLASS}-dot[aria-current="page"]::before { background: var(--dsw-alias-label-primary); }
.${NOTES_CLASS}-step:focus-visible, .${NOTES_CLASS}-dot:focus-visible { outline: 2px solid var(--dsw-alias-border-focus, currentColor); outline-offset: 2px; }
.${NOTES_CLASS}-empty { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
`

/** Backticks are the only inline markup the notes carry; they mark commands and paths. */
function InlineText({ text }: { readonly text: string }): ReactElement {
  return <>{text.split('`').map((part, index) => (index % 2 === 0 ? part : <code key={index}>{part}</code>))}</>
}

function ItemRow({ item }: { readonly item: ReleaseNoteItem }): ReactElement {
  return (
    <li className={`${NOTES_CLASS}-item`}>
      {item.title === undefined ? null : <strong>{item.title}：</strong>}
      <InlineText text={item.text} />
    </li>
  )
}

function SectionBlock({ section }: { readonly section: ReleaseNoteSection }): ReactElement {
  return (
    <div className={`${NOTES_CLASS}-section`}>
      <div className={`${NOTES_CLASS}-heading`}>{section.heading}</div>
      <ul className={`${NOTES_CLASS}-list`}>
        {section.items.map((item, index) => (
          <ItemRow key={index} item={item} />
        ))}
      </ul>
    </div>
  )
}

function NotesBody({ note }: { readonly note: ReleaseNote }): ReactElement {
  return (
    <div className={`${NOTES_CLASS}-body`}>
      {note.sections.map((section) => (
        <SectionBlock key={section.heading} section={section} />
      ))}
    </div>
  )
}

function Pager({
  index,
  count,
  onSelect,
}: {
  readonly index: number
  readonly count: number
  readonly onSelect: (next: number) => void
}): ReactElement {
  return (
    <div className={`${NOTES_CLASS}-pager`}>
      <button
        type="button"
        className={`${NOTES_CLASS}-step`}
        aria-label={PREV_LABEL}
        disabled={index === 0}
        onClick={() => {
          onSelect(index - 1)
        }}
      >
        ‹
      </button>
      <span className={`${NOTES_CLASS}-count`} aria-live="polite">
        {pagePosition(index, count)}
      </span>
      <button
        type="button"
        className={`${NOTES_CLASS}-step`}
        aria-label={NEXT_LABEL}
        disabled={index === count - 1}
        onClick={() => {
          onSelect(index + 1)
        }}
      >
        ›
      </button>
    </div>
  )
}

function Dots({
  index,
  notes,
  onSelect,
}: {
  readonly index: number
  readonly notes: readonly ReleaseNote[]
  readonly onSelect: (next: number) => void
}): ReactElement {
  return (
    <div className={`${NOTES_CLASS}-dots`} role="group" aria-label={DOTS_LABEL}>
      {notes.map((note, position) => (
        <button
          key={note.version}
          type="button"
          className={`${NOTES_CLASS}-dot`}
          aria-label={`v${note.version}`}
          aria-current={position === index ? 'page' : undefined}
          onClick={() => {
            onSelect(position)
          }}
        />
      ))}
    </div>
  )
}

/**
 * @param props.notes - the pages, newest first; the bundled release notes by default.
 * @param props.currentVersion - the running plugin's version, marked on its page.
 * @returns the paged release notes.
 */
export function ReleaseNotesSection({
  notes = RELEASE_NOTES,
  currentVersion = PLUGIN_VERSION,
}: {
  readonly notes?: readonly ReleaseNote[]
  readonly currentVersion?: string
}): ReactElement {
  const [index, setIndex] = useState(0)
  const select = (next: number): void => {
    setIndex(Math.min(Math.max(next, 0), notes.length - 1))
  }
  const position = Math.min(Math.max(index, 0), notes.length - 1)
  const note = notes[position]
  if (note === undefined) return <p className={`${NOTES_CLASS}-empty`}>{EMPTY_TEXT}</p>
  return (
    <section>
      <p className="dsh-ccgui-settings-intro">{INTRO}</p>
      <div className={NOTES_CLASS}>
        <div className={`${NOTES_CLASS}-page`} role="group" aria-label={pageName(note.version)}>
          <div className={`${NOTES_CLASS}-head`}>
            <span className={`${NOTES_CLASS}-version`}>v{note.version}</span>
            {note.version === currentVersion ? <span className={`${NOTES_CLASS}-current`}>{CURRENT_LABEL}</span> : null}
            <span className={`${NOTES_CLASS}-date`}>{note.date}</span>
            <Pager index={position} count={notes.length} onSelect={select} />
          </div>
          <NotesBody note={note} />
        </div>
        <Dots index={position} notes={notes} onSelect={select} />
      </div>
    </section>
  )
}
