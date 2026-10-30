/**
 * The doc AI bar's keys and pinned places (docs programme B9; AI edition
 * only), as one ProseMirror plugin the doc page's editor is made with
 * (DocAiMarkers, given through the registry: docAiRegister.ts), loaded with
 * the doc's blocks. It reads and opens the bar through the bar's store
 * (docAiStore.ts); the overlay, which loads a moment after the doc opens,
 * draws the bar from there. The overlay used to add this plugin when it
 * loaded, and adding a plugin to an open editor makes every plugin view
 * again: an open "/" menu closed, a block link's flash was lost.
 *
 * KEYS (ai-search-io P0-5; the empty line's hint says so):
 * - Space on an empty top-level line opens the bar. A space anywhere else, in
 *   a read-only doc, while a menu is open, or right after the bar was closed on
 *   that line types a space.
 * - ⌘J opens it on the selection or at the caret; ⇧⌘J opens it ready for a
 *   question about the doc. Handled here, the key is the doc's: the app's own
 *   ⌘J (the AI panel) leaves a key something else used.
 *
 * PINS: the place an action was asked about (the selection, the caret) is
 * kept while its answer is written, wherever edits move it: through this
 * tab's edits by their mapping, and found again from its Yjs positions when
 * another tab's edit arrives (that comes as a swap of the whole doc, which maps
 * nothing), as A9's proposals are.
 */

import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { encodeRelative, relativeAt, resolveRelative } from "@/lib/proposals/core"
import { isRemote, yBindingOf } from "@/lib/proposals/review"
import { proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import type { BlockContext } from "@/components/docEditor/registry/types"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { clearSpaceRest, openAiBar, spaceRestsAt } from "./docAiStore"

interface Pin {
  from: number
  to: number
  start: string | null
  end: string | null
}

type Pins = ReadonlyMap<string, Pin>

type Meta = { add: { id: string; from: number; to: number } } | { remove: string }

export const docAiKey = new PluginKey<Pins>("docAi")

const EMPTY: Pins = new Map()

let seq = 0

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** The Yjs positions of a place, so it is found again after another tab's edit. */
function ends(state: EditorState, from: number, to: number): { start: string | null; end: string | null } {
  const b = yBindingOf(state)
  if (!b) return { start: null, end: null }
  try {
    return {
      start: encodeRelative(relativeAt(b.fragment, state.doc, from, from === to ? -1 : 0)),
      end: encodeRelative(relativeAt(b.fragment, state.doc, to, -1)),
    }
  } catch {
    return { start: null, end: null }
  }
}

function step(pins: Pins, tr: Transaction, before: EditorState, state: EditorState): Pins {
  let next = pins
  if (tr.docChanged && pins.size) {
    const moved = new Map<string, Pin>()
    const binding = isRemote(tr) ? yBindingOf(before) : null
    const size = state.doc.content.size
    for (const [id, p] of pins) {
      let from: number | null = null
      let to: number | null = null
      if (binding && p.start && p.end) {
        from = resolveRelative(binding.ydoc, binding.fragment, binding.mapping, p.start)
        to = resolveRelative(binding.ydoc, binding.fragment, binding.mapping, p.end)
      }
      if (from === null || to === null || from > to) {
        from = tr.mapping.map(p.from, p.from === p.to ? -1 : 1)
        to = tr.mapping.map(p.to, -1)
        if (from > to) from = to
      }
      moved.set(id, { ...p, from: Math.min(from, size), to: Math.min(to, size) })
    }
    next = moved
  }
  const meta = tr.getMeta(docAiKey) as Meta | undefined
  if (!meta) return next
  const out = new Map(next)
  // Encoded against the doc the pin was asked on: the Yjs side matches it
  // until the sync plugin's view update, after this.
  if ("add" in meta) out.set(meta.add.id, { from: meta.add.from, to: meta.add.to, ...ends(before, meta.add.from, meta.add.to) })
  else out.delete(meta.remove)
  return out
}

/** Keeps a place while an answer is written; its id finds it later. */
export function pinRange(editor: Editor, from: number, to: number): string {
  const id = `pin-${++seq}`
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(docAiKey, { add: { id, from, to } } satisfies Meta).setMeta("addToHistory", false))
  return id
}

/** Where a pinned place is now; null when the plugin is gone. */
export function pinnedRange(editor: Editor, id: string): { from: number; to: number } | null {
  if (editor.isDestroyed) return null
  const p = docAiKey.getState(editor.state)?.get(id)
  return p ? { from: p.from, to: p.to } : null
}

export function unpin(editor: Editor, id: string) {
  if (editor.isDestroyed || !docAiKey.getState(editor.state)?.has(id)) return
  editor.view.dispatch(editor.state.tr.setMeta(docAiKey, { remove: id } satisfies Meta).setMeta("addToHistory", false))
}

/** Whether a "/" or "@" menu is open: its keys are its own. */
function menuOpen(state: EditorState): boolean {
  for (const p of state.plugins) {
    const s = p.getState(state) as { active?: unknown } | undefined
    if (s && typeof s === "object" && s.active === true) return true
  }
  return false
}

/**
 * The selection the person sees: the browser's, when it holds text the
 * editor hasn't read yet (⇧End then ⌘J at once), else the editor's.
 */
export function seenSelection(view: EditorView): { from: number; to: number } {
  const { from, to } = view.state.selection
  const sel = view.dom.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return { from, to }
  if (!view.dom.contains(sel.anchorNode) || !view.dom.contains(sel.focusNode)) return { from, to }
  try {
    const a = view.posAtDOM(sel.anchorNode, sel.anchorOffset)
    const b = view.posAtDOM(sel.focusNode, sel.focusOffset)
    return a === b ? { from, to } : { from: Math.min(a, b), to: Math.max(a, b) }
  } catch {
    return { from, to }
  }
}

/**
 * The empty line's hint, where space opens the bar: A2's placeholder (which
 * decides when it shows) in the AI edition's words. Drawn after it, so these
 * words are the ones read.
 */
export const SPACE_HINT = "Press space for AI, / for blocks, @ for people"

function hintFor(editor: Editor, state: EditorState): DecorationSet | null {
  if (!editor.isEditable || !state.selection.empty) return null
  const $from = state.selection.$from
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return null
  // While an answer is shown for review, the line says nothing over it.
  const reviewing = Object.keys(proposalsOf(state).active).length > 0
  // A touch screen's keyboard may send no space key: the phone's bar has Ask AI instead.
  if (!reviewing && isTouchScreen()) return null
  const start = $from.before(1)
  return DecorationSet.create(state.doc, [Decoration.node(start, start + $from.parent.nodeSize, { "data-placeholder": reviewing ? "" : SPACE_HINT })])
}

/** The plugin for one editor of a doc. */
export function docAiPlugin(editor: Editor, docId: string): Plugin<Pins> {
  const open = (mode: "actions" | "ask", source: "space" | "keys") => {
    const { from, to } = seenSelection(editor.view)
    let anchor: { left: number; top: number; bottom: number } | undefined
    try {
      const c = editor.view.coordsAtPos(to)
      anchor = { left: c.left, top: c.top, bottom: c.bottom }
    } catch {
      anchor = undefined
    }
    openAiBar(editor, { docId, from, to, mode, source, anchor })
  }
  return new Plugin<Pins>({
    key: docAiKey,
    state: {
      init: () => EMPTY,
      apply: (tr, value, before, state) => step(value, tr, before, state),
    },
    view: () => ({
      update(view, prev) {
        // An edit ends the second space's welcome: a space there types again.
        if (view.state.doc !== prev.doc) clearSpaceRest(editor)
      },
    }),
    props: {
      decorations: (state) => hintFor(editor, state),
      handleKeyDown(view, event) {
        if (event.isComposing || !editor.isEditable) return false
        const mod = isMac() ? event.metaKey : event.ctrlKey
        if (mod && !event.altKey && event.key.toLowerCase() === "j") {
          open(event.shiftKey ? "ask" : "actions", "keys")
          return true
        }
        if (event.key !== " " || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false
        const { selection } = view.state
        const $from = selection.$from
        if (!selection.empty || $from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return false
        if (menuOpen(view.state)) return false
        if (spaceRestsAt(editor, $from.before())) {
          clearSpaceRest(editor)
          return false
        }
        open("actions", "space")
        return true
      },
    },
  })
}

/**
 * The keys and pins on a doc page's editor, from when it is made. Last of its
 * plugins, as one added later was: its hint is drawn after A2's placeholder,
 * so its words are the ones read, and every other plugin's keys go first.
 */
export const DocAiMarkers = Extension.create<{ docId: string }>({
  name: "docAiMarkers",
  priority: 1,
  addOptions: () => ({ docId: "" }),
  addProseMirrorPlugins() {
    return [docAiPlugin(this.editor, this.options.docId)]
  },
})

/** The registry's maker (docAiRegister.ts): the keys and pins for an editor of a doc. */
export const docAiMarkersFor = (ctx: BlockContext) => (ctx.docId ? [DocAiMarkers.configure({ docId: ctx.docId })] : [])
