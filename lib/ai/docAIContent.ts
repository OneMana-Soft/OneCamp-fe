/**
 * Doc AI's text in and out (docs programme B9, ai-search-io P0-3): what an
 * action reads is Markdown from the live editor, and what it answers goes back
 * as the editor's own blocks, never as a flat string (N17). Both directions are
 * the content codec (A7), the one the editor's paste, import and export use;
 * it loads with the bar, never with the page.
 */

import type { Editor, JSONContent } from "@tiptap/core"
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"
import { nodesFromJSON } from "@/lib/proposals/core"
import { BLOCK_ID_ATTR, newBlockId } from "@/components/minimal-tiptap/extensions/block-id"

type Codec = (typeof import("@/lib/codec"))["codec"]

let codecLoad: Promise<Codec> | null = null

/** The content codec, fetched once. */
export function loadCodec(): Promise<Codec> {
  if (!codecLoad) {
    codecLoad = import("@/lib/codec").then(
      (m) => m.codec,
      (e) => {
        codecLoad = null
        throw e
      },
    )
  }
  return codecLoad
}

const asDoc = (content: JSONContent[] | null | undefined): JSONContent => ({ type: "doc", content: content ?? [] })

/** from..to of the doc as Markdown. */
export async function rangeMarkdown(editor: Editor, from: number, to: number): Promise<string> {
  const codec = await loadCodec()
  const slice = editor.state.doc.slice(Math.max(0, from), Math.min(to, editor.state.doc.content.size))
  return codec.toMarkdown(asDoc(slice.content.toJSON() as JSONContent[] | null)).trim()
}

/** Blocks chosen apart, as Markdown one after another: never what lies between them. */
export async function partsMarkdown(editor: Editor, parts: Array<{ from: number; to: number }>): Promise<string> {
  const out: string[] = []
  for (const p of [...parts].sort((a, b) => a.from - b.from)) {
    const md = await rangeMarkdown(editor, p.from, p.to)
    if (md) out.push(md)
  }
  return out.join("\n\n")
}

/** The whole doc as Markdown, as the live editor holds it now. */
export async function docMarkdown(editor: Editor): Promise<string> {
  const codec = await loadCodec()
  return codec.toMarkdown(editor.getJSON()).trim()
}

/** The doc up to pos as Markdown, its last maxChars: what "Continue writing" goes on from. */
export async function markdownBefore(editor: Editor, pos: number, maxChars = 6000): Promise<string> {
  const md = await rangeMarkdown(editor, 0, pos)
  if (md.length <= maxChars) return md
  const tail = md.slice(md.length - maxChars)
  const line = tail.indexOf("\n")
  return line >= 0 && line < tail.length / 4 ? tail.slice(line + 1) : tail
}

/** The text around from..to, for tone only: a little before and after, plain. Pure but for the editor. */
export function textAround(state: EditorState, from: number, to: number, size = 600): string {
  const doc = state.doc
  const before = doc.textBetween(Math.max(0, from - size), from, "\n", " ")
  const after = doc.textBetween(to, Math.min(doc.content.size, to + size), "\n", " ")
  return [before.trim(), after.trim()].filter(Boolean).join("\n…\n")
}

/** Whether from..to lies inside one line of text: an answer for it stays inline. */
export function isInlineRange(state: EditorState, from: number, to: number): boolean {
  if (from === to) return false
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  return $from.sameParent($to) && $from.parent.isTextblock
}

/**
 * Where a written answer goes: in place of the empty line it was asked on, or
 * after the block that holds the caret (or the selection's end). Pure.
 */
export function writePlace(state: EditorState, from: number, to: number): { from: number; to: number } {
  const doc = state.doc
  const $from = doc.resolve(Math.min(from, doc.content.size))
  if (from === to && $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
    return { from: $from.before(1), to: $from.after(1) }
  }
  const $to = doc.resolve(Math.min(to, doc.content.size))
  const at = $to.depth >= 1 ? $to.after(1) : $to.pos
  return { from: at, to: at }
}

/**
 * Blocks with ids of their own, as every block in a doc has. Given here, the
 * editor's block ids have nothing to add when they go in: an id added after a
 * change takes that change out of ⌘Z, the way the live doc's undo reads it.
 */
export function withBlockIds(state: EditorState, blocks: JSONContent[]): JSONContent[] {
  const give = (node: JSONContent): JSONContent => {
    const type = node.type ? state.schema.nodes[node.type] : undefined
    const out: JSONContent = { ...node }
    if (type?.isBlock && type.spec.attrs?.[BLOCK_ID_ATTR] && !node.attrs?.[BLOCK_ID_ATTR]) out.attrs = { ...node.attrs, [BLOCK_ID_ATTR]: newBlockId() }
    if (node.content) out.content = node.content.map(give)
    return out
  }
  return blocks.map(give)
}

/**
 * An answer in Markdown as content for the doc: the editor's blocks, or, when
 * it answers a selection inside one line and is one paragraph, that line's
 * words, so the line keeps its own block. A code fence, a list or a heading
 * stays a block.
 */
export async function answerContent(state: EditorState, markdown: string, inline: boolean): Promise<Slice | JSONContent[]> {
  const codec = await loadCodec()
  const doc = codec.fromMarkdown(markdown)
  const blocks = (doc.content ?? []) as JSONContent[]
  if (inline && blocks.length === 1 && blocks[0].type === "paragraph") {
    const nodes: PMNode[] = nodesFromJSON(state.schema, blocks[0].content ?? [])
    return new Slice(Fragment.fromArray(nodes), 0, 0)
  }
  return withBlockIds(state, blocks)
}

/**
 * A selection that holds the whole of its lines, as those lines' blocks:
 * blocks put in its place then leave no empty line before or after them. A
 * part of a line, or lines inside a list, stay as they are. Pure.
 */
export function wholeLines(state: EditorState, from: number, to: number): { from: number; to: number } {
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  if (!$from.parent.isTextblock || !$to.parent.isTextblock || $from.depth !== 1 || $to.depth !== 1) return { from, to }
  if ($from.parentOffset !== 0 || $to.parentOffset !== $to.parent.content.size) return { from, to }
  return { from: $from.before(1), to: $to.after(1) }
}

/** The plain text of content: what a record's hash is of. Pure. */
export function plainOf(state: EditorState, content: JSONContent[] | null | undefined): string {
  return nodesFromJSON(state.schema, content ?? [])
    .map((n) => n.textContent)
    .join("\n")
}
