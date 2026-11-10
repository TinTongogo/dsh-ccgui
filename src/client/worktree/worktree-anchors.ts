/// <reference lib="dom" />

/**
 * Where the 「Worktrees」 groups go in the harness's sidebar, which has no slot for them. Each
 * group renders into a container this module keeps as the last child of its repository's
 * workspace section, after the session rows; nested worktrees leave the top level through a
 * stylesheet keyed on their row ids. Both lean on the harness's stable `data-row-key` and
 * `role="tree"` hooks, not its hashed class names: if that markup changes, the groups simply
 * do not appear and the worktrees stay listed as ordinary workspaces.
 * @module dsh-ccgui/client/worktree/worktree-anchors
 */

import { useEffect, useState } from 'react'

/** Marks the containers, for the stylesheet and for anyone inspecting the sidebar. */
export const ANCHOR_ATTRIBUTE = 'data-ccgui-worktrees'
const HIDE_STYLE_ATTRIBUTE = 'data-ccgui-worktree-hide'

const quoted = (id: string): string => id.replace(/["\\]/g, '\\$&')
const rowSelector = (id: string): string => `[data-row-key="workspace:${quoted(id)}"]`

/**
 * A workspace row sits in a hover-card wrapper inside its section, so the section is two up.
 * @param doc - the document.
 * @param id - the workspace.
 * @returns the section holding the workspace row and its sessions, if it is on screen.
 */
function sectionOf(doc: Document, id: string): Element | undefined {
  return doc.querySelector(`[role="tree"] ${rowSelector(id)}`)?.parentElement?.parentElement ?? undefined
}

function containerFor(doc: Document, id: string, existing: HTMLElement | undefined): HTMLElement {
  if (existing !== undefined) return existing
  const container = doc.createElement('div')
  container.setAttribute(ANCHOR_ATTRIBUTE, id)
  return container
}

function sameAnchors(a: ReadonlyMap<string, HTMLElement>, b: ReadonlyMap<string, HTMLElement>): boolean {
  return a.size === b.size && [...a].every(([id, element]) => b.get(id) === element)
}

/**
 * Place one container per workspace and keep it last in its section, through re-renders that
 * append rows after it, collapse the section or replace it.
 * @param doc - the document.
 * @param current - the containers placed so far.
 * @param ids - the workspaces that need one.
 * @returns the containers now in place.
 */
function placeAnchors(
  doc: Document,
  current: ReadonlyMap<string, HTMLElement>,
  ids: readonly string[],
): ReadonlyMap<string, HTMLElement> {
  const placed = ids.flatMap((id): [string, HTMLElement][] => {
    const section = sectionOf(doc, id)
    if (section === undefined) return []
    const container = containerFor(doc, id, current.get(id))
    if (section.lastElementChild !== container) section.append(container)
    return [[id, container]]
  })
  const next = new Map(placed)
  for (const [id, container] of current) if (next.get(id) !== container) container.remove()
  return next
}

/**
 * Follow the sidebar and keep a container in each listed workspace's section.
 * @param doc - the document.
 * @param ids - the workspaces that need one.
 * @returns the containers currently in place, by workspace.
 */
export function useGroupAnchors(doc: Document, ids: readonly string[]): ReadonlyMap<string, HTMLElement> {
  const [anchors, setAnchors] = useState<ReadonlyMap<string, HTMLElement>>(new Map())
  const key = ids.join('\n')
  useEffect(() => {
    const wanted = key === '' ? [] : key.split('\n')
    let current: ReadonlyMap<string, HTMLElement> = new Map()
    let frame: number | undefined
    const sync = (): void => {
      frame = undefined
      const next = placeAnchors(doc, current, wanted)
      if (sameAnchors(current, next)) return
      current = next
      setAnchors(next)
    }
    // One pass per frame however much the page changes; a streaming reply mutates constantly.
    const observer = new MutationObserver(() => {
      frame ??= requestAnimationFrame(sync)
    })
    observer.observe(doc.body, { childList: true, subtree: true })
    sync()
    return () => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const container of current.values()) container.remove()
      setAnchors(new Map())
    }
  }, [doc, key])
  return anchors
}

/**
 * @param ids - the nested worktrees.
 * @returns rules that take their own sections out of the list, wherever the tree nests them.
 */
export function hiddenGroupRules(ids: ReadonlySet<string>): string {
  // !important: the list animates sections with inline styles.
  return [...ids].map((id) => `[role="tree"] :has(> * > ${rowSelector(id)}) { display: none !important; }`).join('\n')
}

/**
 * Keep nested worktrees out of the top level for as long as the caller is mounted.
 * @param doc - the document.
 * @param ids - the nested worktrees.
 */
export function useHiddenGroups(doc: Document, ids: ReadonlySet<string>): void {
  const rules = hiddenGroupRules(ids)
  useEffect(() => {
    const tag = doc.createElement('style')
    tag.setAttribute(HIDE_STYLE_ATTRIBUTE, '')
    tag.textContent = rules
    doc.head.append(tag)
    return () => {
      tag.remove()
    }
  }, [doc, rules])
}
