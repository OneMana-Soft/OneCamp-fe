/**
 * Where a suggestion is being written (docs C5): the text a person chose, or
 * the caret's place in its block, kept through everyone's edits while they
 * write, so what the suggestion replaces is always what they chose. Pure,
 * apart from reading the editor's state.
 *
 * Through a shared doc, the place is a Yjs anchor (lib/anchors), which other
 * people's edits leave where it was meant; with no shared doc (a doc not yet
 * live), the place as it was opened, since nothing else moves it. Either
 * way the words are checked: if the text chosen is no longer exactly there,
 * the place is lost rather than guessed, and the person chooses again.
 */

import type { EditorState } from "@tiptap/pm/state"
import { anchorFor, bindingOf, resolveAnchor } from "@/lib/anchors/anchors"
import type { Anchor } from "@/lib/anchors/types"

export interface SuggestTarget {
  /** The text chosen: what the suggestion replaces ("" at a caret). */
  text: string
  /** Where it was opened, as the doc was then. */
  from: number
  to: number
  /**
   * At a caret: the block it is in, as its text then and the caret's place in
   * it, since a caret alone can't be anchored.
   */
  caret?: { blockFrom: number; blockTo: number; blockText: string; offset: number }
  /** The shared doc's anchor for the chosen text (or the caret's block), when the doc is shared. */
  anchor: Anchor | null
}

/** The innermost textblock's content around pos. */
function textblockAround(state: EditorState, pos: number): { from: number; to: number } | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.isTextblock) return { from: $pos.start(d), to: $pos.end(d) }
  }
  return null
}

/**
 * The target for a suggestion at from..to (a selection) or at a caret
 * (from === to), or null where there's nothing to suggest on: a selection
 * across no text, or a caret outside any text.
 */
export function targetAt(state: EditorState, from: number, to: number): SuggestTarget | null {
  const binding = bindingOf(state)
  if (from < to) {
    const text = state.doc.textBetween(from, to, "\n", "\n")
    if (!text.trim()) return null
    return { text, from, to, anchor: binding ? anchorFor(binding, state.doc, from, to) : null }
  }
  const block = textblockAround(state, from)
  if (!block) return null
  const blockText = state.doc.textBetween(block.from, block.to, "\n", "\n")
  const caret = { blockFrom: block.from, blockTo: block.to, blockText, offset: from - block.from }
  // An empty block has no text to anchor: its place is where it was opened.
  const anchor = binding && block.from < block.to ? anchorFor(binding, state.doc, block.from, block.to) : null
  return { text: "", from, to: from, caret, anchor }
}

/** Where a target is now, or null when what was chosen isn't exactly there any more. */
export function placeOf(state: EditorState, t: SuggestTarget): { from: number; to: number } | null {
  const size = state.doc.content.size
  if (t.caret) {
    let block = { from: t.caret.blockFrom, to: t.caret.blockTo }
    if (t.anchor) {
      const r = resolveAnchor(bindingOf(state), state.doc, t.anchor)
      if (r.state !== "attached") return null
      block = { from: r.from, to: r.to }
    }
    if (block.to > size || block.from > block.to) return null
    if (state.doc.textBetween(block.from, block.to, "\n", "\n") !== t.caret.blockText) return null
    const at = block.from + t.caret.offset
    return at <= block.to ? { from: at, to: at } : null
  }
  let range = { from: t.from, to: t.to }
  if (t.anchor) {
    const r = resolveAnchor(bindingOf(state), state.doc, t.anchor)
    if (r.state !== "attached") return null
    range = { from: r.from, to: r.to }
  }
  if (range.to > size || range.from >= range.to) return null
  return state.doc.textBetween(range.from, range.to, "\n", "\n") === t.text ? range : null
}
