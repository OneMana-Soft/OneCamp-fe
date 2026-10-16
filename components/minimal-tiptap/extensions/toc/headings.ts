"use client"

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { actionById } from '@/components/docEditor/registry/registry'
import { NO_BUS, busFor } from '@/components/docEditor/registry/commandBus'

/**
 * A doc's headings, for its table of contents and its floating outline (B2,
 * editor.md P1-11): H1 to H3 wherever they are (a toggle heading's summary, a
 * heading in a callout), in order. One list per editor, worked out a moment
 * after the doc stops changing, never per key (I20: no walk of the whole doc
 * per key), and shared by every table of contents in the doc and its outline.
 * Any change counts, also one made without an update event (content set
 * whole, as setContent does by default), which left the list stale.
 */
export interface DocHeading {
  /** Its block id, when it has one (a link to it). */
  id: string | null
  level: 1 | 2 | 3
  text: string
  /** Where it starts in the doc when the list was made. */
  pos: number
}

/** The doc's H1 to H3, in order. Pure. */
export function headingsOf(doc: PMNode): DocHeading[] {
  const out: DocHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level)
      if (level >= 1 && level <= 3) out.push({ id: (node.attrs.blockId as string | null) ?? null, level: level as 1 | 2 | 3, text: node.textContent.trim(), pos })
      return false
    }
    // Headings sit in blocks, never in text.
    return !node.isTextblock && !node.isAtom
  })
  return out
}

const same = (a: DocHeading[], b: DocHeading[]) =>
  a.length === b.length && a.every((h, i) => h.id === b[i].id && h.level === b[i].level && h.text === b[i].text && h.pos === b[i].pos)

/** How long the doc is still before its headings are read again. */
export const HEADINGS_SETTLE_MS = 250

interface Watch {
  headings: DocHeading[]
  listeners: Set<() => void>
  timer: ReturnType<typeof setTimeout> | null
  stop: () => void
}
const watches = new WeakMap<Editor, Watch>()

function watchOf(editor: Editor): Watch {
  let w = watches.get(editor)
  if (w) return w
  const read = () => {
    w!.timer = null
    if (editor.isDestroyed) return
    const next = headingsOf(editor.state.doc)
    if (same(next, w!.headings)) return
    w!.headings = next
    for (const l of [...w!.listeners]) l()
  }
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return
    if (w!.timer) clearTimeout(w!.timer)
    w!.timer = setTimeout(read, HEADINGS_SETTLE_MS)
  }
  editor.on('transaction', onTransaction)
  w = {
    headings: headingsOf(editor.state.doc),
    listeners: new Set(),
    timer: null,
    stop: () => {
      editor.off('transaction', onTransaction)
      if (w!.timer) clearTimeout(w!.timer)
      watches.delete(editor)
    },
  }
  watches.set(editor, w)
  return w
}

/** The editor's headings now (as last read). */
export const docHeadings = (editor: Editor): DocHeading[] => watchOf(editor).headings

/** Called when the editor's headings change; the returned function stops it (the last one stops the watch). */
export function onDocHeadings(editor: Editor, listener: () => void): () => void {
  const w = watchOf(editor)
  w.listeners.add(listener)
  return () => {
    w.listeners.delete(listener)
    if (!w.listeners.size) w.stop()
  }
}

/** Where a heading is now: by its id when it has one, else where it was. */
export function headingPos(editor: Editor, heading: DocHeading): number | null {
  const { doc } = editor.state
  if (heading.id) {
    let found: number | null = null
    doc.descendants((node, pos) => {
      if (found !== null) return false
      if (node.attrs?.blockId === heading.id) found = pos
      return !node.isTextblock
    })
    if (found !== null) return found
  }
  const node = heading.pos <= doc.content.size ? doc.nodeAt(heading.pos) : null
  return node?.type.name === 'heading' ? heading.pos : null
}

/**
 * Takes the reader to a heading: the toggles that hold it open for them
 * (toggles.reveal's own), then it scrolls to the top. The caret stays where
 * it was, as a page's contents never move it.
 */
export function goToHeading(editor: Editor, heading: DocHeading) {
  const pos = headingPos(editor, heading)
  if (pos === null) return
  // toggles.reveal, the one way to open what folds a position (WAVE_B_CONTRACTS).
  const bus = busFor(editor) ?? NO_BUS
  void actionById('toggles.reveal', { ai: false })?.run({ docId: bus.docId, editor, canEdit: editor.isEditable, bus, gate: { ai: false }, state: { pos: pos + 1 } })
  const dom = editor.view.nodeDOM(pos) as HTMLElement | null
  const smooth = typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  dom?.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
}
