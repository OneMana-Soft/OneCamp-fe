/**
 * The code block's highlighter: what turns the shared highlighter's pieces
 * (codeHighlight.ts, lowlight and its grammars, which a board's code block
 * uses too) into decorations (docs programme A1; moved here by B3 so
 * that none of it is on the doc route's static path). It loads with the first
 * code block shown (lazyCodeBlock.ts loadHighlighter), and a change
 * highlights only the code blocks it touched (I20).
 *
 * A language beyond the common set (grammars.ts) loads the first time a block
 * names it; until then that block reads as plain text, never guessed at.
 */

import type { Node as PMNode } from "@tiptap/pm/model"
import { Mapping, StepMap } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { highlightPieces } from "./codeHighlight"
import { changedRange } from "@/components/minimal-tiptap/utils/changedRange"

export { hasWanted, loadWanted } from "./codeHighlight"

/** The code blocks in a range of a doc, outermost first (a code block holds no other). */
function codeBlocksIn(doc: PMNode, from: number, to: number, name: string) {
  const found: Array<{ node: PMNode; pos: number }> = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === name) found.push({ node, pos })
    return node.type.name !== name && !node.isTextblock
  })
  return found
}

/** One code block's decorations; pos is the block's own position. */
function decorate(node: PMNode, pos: number, defaultLanguage: string | null): Decoration[] {
  const language = (node.attrs.language as string | null) || defaultLanguage
  const out: Decoration[] = []
  let from = pos + 1
  for (const piece of highlightPieces(node.textContent, language)) {
    const to = from + piece.text.length
    if (piece.classes.length) out.push(Decoration.inline(from, to, { class: piece.classes.join(" ") }))
    from = to
  }
  return out
}

/** Every code block's decorations. */
export function decorateAll(doc: PMNode, name: string, defaultLanguage: string | null): DecorationSet {
  const decos: Decoration[] = []
  for (const { node, pos } of codeBlocksIn(doc, 0, doc.content.size, name)) decos.push(...decorate(node, pos, defaultLanguage))
  return DecorationSet.create(doc, decos)
}

/**
 * The decorations after a change: moved past what changed, and the code
 * blocks in it highlighted again. Past it, not through the steps: another
 * person's change comes as the whole doc replaced (y-prosemirror), as does
 * collaboration binding anew, and mapping through that drops every block's
 * colours. The same doc again keeps them.
 */
export function decorateChange(set: DecorationSet, old: PMNode, next: PMNode, name: string, defaultLanguage: string | null): DecorationSet {
  const d = changedRange(old, next)
  if (!d) return set
  let mapped = set.map(new Mapping([new StepMap([d.start, d.endA - d.start, d.endB - d.start])]), next)
  for (const { node, pos } of codeBlocksIn(next, d.start, d.endB, name)) {
    mapped = mapped.remove(mapped.find(pos, pos + node.nodeSize))
    mapped = mapped.add(next, decorate(node, pos, defaultLanguage))
  }
  return mapped
}
