/**
 * The code block's highlighter: lowlight with its common languages, and what
 * turns its output into decorations (docs programme A1; moved here by B3 so
 * that none of it is on the doc route's static path). It loads with the first
 * code block shown (lazyCodeBlock.ts loadHighlighter), and a change
 * highlights only the code blocks it touched (I20).
 *
 * A language beyond the common set (grammars.ts) loads the first time a block
 * names it; until then that block reads as plain text, never guessed at.
 */

import { common, createLowlight } from "lowlight"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Mapping, StepMap } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { EXTRA_GRAMMARS } from "./grammars"
import { languageOf } from "./languages"
import { changedRange } from "@/components/minimal-tiptap/utils/changedRange"

interface HastNode {
  type: string
  value?: string
  children?: HastNode[]
  properties?: { className?: string[] }
}

const lowlight = createLowlight(common)

/** Grammars asked for and not here yet, and those that failed to load. */
const wanted = new Set<string>()
const failed = new Set<string>()

/** The grammar a stored language needs: lowlight's own name or alias, else the language list's id. */
function grammarFor(language: string): string {
  if (lowlight.registered(language)) return language
  const id = languageOf(language)?.id
  return id && lowlight.registered(id) ? id : (id ?? language)
}

/** The code blocks in a range of a doc, outermost first (a code block holds no other). */
export function codeBlocksIn(doc: PMNode, from: number, to: number, name: string) {
  const found: Array<{ node: PMNode; pos: number }> = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === name) found.push({ node, pos })
    return node.type.name !== name && !node.isTextblock
  })
  return found
}

function flatten(nodes: HastNode[], classes: string[] = [], out: Array<{ text: string; classes: string[] }> = []) {
  for (const n of nodes) {
    const cls = n.properties?.className ? [...classes, ...n.properties.className] : classes
    if (n.children) flatten(n.children, cls, out)
    else out.push({ text: n.value ?? "", classes: cls })
  }
  return out
}

/** One code block's decorations; pos is the block's own position. */
export function decorate(node: PMNode, pos: number, defaultLanguage: string | null): Decoration[] {
  const language = (node.attrs.language as string | null) || defaultLanguage
  const text = node.textContent
  if (!text || language === "plaintext" || language === "mermaid") return []
  let tree: { children: HastNode[] }
  if (language) {
    const grammar = grammarFor(language)
    if (!lowlight.registered(grammar)) {
      if (EXTRA_GRAMMARS[grammar] && !failed.has(grammar)) wanted.add(grammar)
      return []
    }
    tree = lowlight.highlight(grammar, text) as unknown as { children: HastNode[] }
  } else {
    tree = lowlight.highlightAuto(text) as unknown as { children: HastNode[] }
  }
  const out: Decoration[] = []
  let from = pos + 1
  for (const piece of flatten(tree.children)) {
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

/**
 * Loads the grammars blocks asked for since the last call. Resolves true when
 * one arrived, so the doc is highlighted again.
 */
export async function loadWanted(): Promise<boolean> {
  const names = [...wanted]
  wanted.clear()
  let any = false
  await Promise.all(
    names.map(async (name) => {
      try {
        const grammar = (await EXTRA_GRAMMARS[name]()).default
        lowlight.register(name, grammar as Parameters<typeof lowlight.register>[1])
        any = true
      } catch (e) {
        // A chunk that failed is not asked for again on this page.
        failed.add(name)
        console.error(`Couldn't load the ${name} grammar`, e)
      }
    }),
  )
  return any
}

/** Whether a block's grammars are wanted (the plugin then loads them). */
export const hasWanted = () => wanted.size > 0
