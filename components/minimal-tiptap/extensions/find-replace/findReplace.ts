"use client"

/**
 * Find and replace in a doc (docs programme B3, editor.md P1-12): every
 * match highlighted, the current one stronger, a count, Match case and Whole
 * word, and Replace and Replace all. Its state and keys come with a doc's
 * editor (blocks.ts), so opening it never reconfigures the editor's plugins:
 * that would have collaboration draw the whole doc again. The bar loads on
 * the first ⌘F.
 *
 * A doc's text is searched block by block, across its marks (bold in the
 * middle of a word is still the word), and code blocks and table cells
 * included, closed toggles too: going to a match in one opens it for you
 * (FindBar, through B2's toggles.reveal). Replace all is one change, so one
 * ⌘Z puts everything back.
 *
 * While find is open ⌘⇧H is Replace and Escape closes it; closed, both are
 * the doc's own again (⌘⇧H is then the last colour).
 */

import { Extension, type Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { changedRange } from "@/components/minimal-tiptap/utils/changedRange"
import { isComposingKey } from "@/lib/keys/ime"

interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

export interface Match {
  from: number
  to: number
}

export interface FindState extends FindOptions {
  open: boolean
  query: string
  matches: Match[]
  /** The current match's index, or -1. */
  current: number
  decorations: DecorationSet
}

/** At most this many matches are found (a count past it reads "5,000+"). */
export const MAX_MATCHES = 5000

/** What separates the text of an inline atom (a mention, an equation): nothing typed matches across it. */
const ATOM = "￼"

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The pattern a query is searched with. Null for an empty query. */
export function patternOf(query: string, { caseSensitive, wholeWord }: FindOptions): RegExp | null {
  if (!query) return null
  const body = escape(query)
  const src = wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body
  return new RegExp(src, caseSensitive ? "gu" : "giu")
}

/** Every match of a query in a doc, in order. */
export function findMatches(doc: PMNode, query: string, options: FindOptions): Match[] {
  const re = patternOf(query, options)
  if (!re) return []
  const out: Match[] = []
  doc.descendants((block, pos) => {
    if (out.length >= MAX_MATCHES) return false
    if (!block.isTextblock) return true
    // The block's text, and where each piece of it starts in the doc.
    let text = ""
    const starts: number[] = []
    const offsets: number[] = []
    block.forEach((child, offset) => {
      starts.push(pos + 1 + offset)
      offsets.push(text.length)
      text += child.isText ? child.text! : ATOM
    })
    const at = (i: number) => {
      let k = offsets.length - 1
      while (k > 0 && offsets[k] > i) k--
      return starts[k] + (i - offsets[k])
    }
    re.lastIndex = 0
    for (let m = re.exec(text); m && out.length < MAX_MATCHES; m = re.exec(text)) {
      if (m[0] === "") {
        re.lastIndex++
        continue
      }
      out.push({ from: at(m.index), to: at(m.index + m[0].length - 1) + 1 })
    }
    return false
  })
  return out
}

function decorate(doc: PMNode, matches: Match[], current: number): DecorationSet {
  if (!matches.length) return DecorationSet.empty
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, i === current ? { class: "doc-find-match doc-find-current", "data-find-current": "" } : { class: "doc-find-match" }),
    ),
  )
}

export const findKey = new PluginKey<FindState>("docFind")

const CLOSED: FindState = { open: false, query: "", caseSensitive: false, wholeWord: false, matches: [], current: -1, decorations: DecorationSet.empty }

type Meta = Partial<Pick<FindState, "open" | "query" | "caseSensitive" | "wholeWord" | "current">> & { refresh?: boolean }

/** The match nearest after a position, as the one to start from. */
function nearest(matches: Match[], pos: number): number {
  if (!matches.length) return -1
  const i = matches.findIndex((m) => m.to > pos)
  return i < 0 ? 0 : i
}

/** Where a match goes in a change: before it, nowhere; after it, along; in it, as the steps take it (or away). */
function moved(m: Match, d: { start: number; endA: number; endB: number }, tr: Transaction): Match[] {
  if (m.to <= d.start) return [m]
  if (m.from >= d.endA) return [{ from: m.from + d.endB - d.endA, to: m.to + d.endB - d.endA }]
  const from = tr.mapping.map(m.from, 1)
  const to = tr.mapping.map(m.to, -1)
  return to > from ? [{ from, to }] : []
}

/** What a transaction does to find's state. */
function apply(tr: Transaction, prev: FindState, old: EditorState, state: EditorState): FindState {
  const meta = tr.getMeta(findKey) as Meta | undefined
  if (meta?.open === false) return CLOSED
  if (!prev.open && !meta?.open) return prev
  let next: FindState = { ...prev, ...meta }
  const search = !!meta && (meta.open !== undefined || meta.refresh || meta.query !== undefined || meta.caseSensitive !== undefined || meta.wholeWord !== undefined)
  if (search) {
    const matches = findMatches(state.doc, next.query, next)
    const was = prev.matches[prev.current]
    // Stay on the match you were on, or the next one after it, or after the caret.
    const current = meta!.current !== undefined ? meta!.current : nearest(matches, was ? (meta!.refresh ? was.from : was.from - 1) : state.selection.from)
    next = { ...next, matches, current: matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : -1 }
    return { ...next, decorations: decorate(state.doc, next.matches, next.current) }
  }
  if (tr.docChanged) {
    // Until the doc is searched again (once typing pauses), the matches move
    // with the text. Those beyond what changed move past it, not through the
    // steps: another person's change comes as the whole doc replaced, which
    // would drop every match.
    const d = changedRange(old.doc, state.doc)
    const matches = d ? prev.matches.flatMap((m) => moved(m, d, tr)) : prev.matches
    const current = Math.min(next.current, matches.length - 1)
    return { ...next, matches, current, decorations: decorate(state.doc, matches, current) }
  }
  if (meta?.current !== undefined) return { ...next, decorations: decorate(state.doc, next.matches, next.current) }
  return next
}

interface FindHooks {
  /** ⌘⇧H in the doc while find is open. */
  replace(): void
  /** Escape in the doc while find is open. */
  close(): void
}

const hooksOf = new WeakMap<EditorView, FindHooks>()

/** Where an editor's find keys go: its bar, once it has one. */
export function setFindHooks(view: EditorView, hooks: FindHooks) {
  hooksOf.set(view, hooks)
}

/** Find's plugin: its state, its highlights and its keys while open. */
function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: { init: () => CLOSED, apply },
    props: {
      decorations: (state) => findKey.getState(state)?.decorations,
      handleKeyDown(view, event) {
        const s = findKey.getState(view.state)
        const hooks = hooksOf.get(view)
        // An input method's keys are its own (Safari's carry keyCode 229).
        if (!s?.open || !hooks || isComposingKey(event)) return false
        const mod = event.metaKey || event.ctrlKey
        if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === "h") {
          hooks.replace()
          return true
        }
        if (event.key === "Escape" && !mod && !event.shiftKey && !event.altKey) {
          hooks.close()
          return true
        }
        return false
      },
    },
    view() {
      let timer: ReturnType<typeof setTimeout> | null = null
      return {
        update(view, prev) {
          const s = findKey.getState(view.state)
          if (!s?.open || prev.doc === view.state.doc) return
          // Searched again once typing pauses, not on every key (I20).
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            timer = null
            if (!view.isDestroyed && findKey.getState(view.state)?.open) view.dispatch(view.state.tr.setMeta(findKey, { refresh: true }).setMeta("addToHistory", false))
          }, 200)
        },
        destroy() {
          if (timer) clearTimeout(timer)
        },
      }
    },
  })
}

/**
 * Find in a doc's editor: first of all (ahead of the collaboration history's
 * 1000), so ⌘⇧H and Escape are find's while it's open.
 */
export const FindKeys = Extension.create({
  name: "docFind",
  priority: 1200,
  addProseMirrorPlugins: () => [findPlugin()],
})

/** Sets find's state on an editor. */
export function setFind(editor: Editor, meta: Meta) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(findKey, meta).setMeta("addToHistory", false))
}

export const findStateOf = (editor: Editor): FindState => findKey.getState(editor.state) ?? CLOSED

/** Replaces the current match, and goes to the next. Returns whether it did. */
export function replaceCurrent(editor: Editor, replacement: string): boolean {
  const s = findStateOf(editor)
  const m = s.matches[s.current]
  if (!m || !editor.isEditable) return false
  const tr = editor.state.tr
  if (replacement) tr.insertText(replacement, m.from, m.to)
  else tr.delete(m.from, m.to)
  // The next match is the one after what was put in.
  tr.setMeta(findKey, { refresh: true, current: undefined })
  editor.view.dispatch(tr)
  const after = findStateOf(editor)
  const end = m.from + replacement.length
  const next = after.matches.findIndex((x) => x.from >= end)
  setFind(editor, { current: next < 0 ? (after.matches.length ? 0 : -1) : next })
  return true
}

/** Replaces every match, in one change (one undo). Returns how many. */
export function replaceAll(editor: Editor, replacement: string): number {
  const s = findStateOf(editor)
  if (!s.matches.length || !editor.isEditable) return 0
  const tr = editor.state.tr
  for (const m of [...s.matches].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to)
    else tr.delete(m.from, m.to)
  }
  tr.setMeta(findKey, { refresh: true })
  editor.view.dispatch(tr)
  return s.matches.length
}
