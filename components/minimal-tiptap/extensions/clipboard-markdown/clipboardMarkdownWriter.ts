"use client"

import type { JSONContent } from "@tiptap/core"
import type { Slice } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import type { CNode } from "@/lib/codec/doc"
import { toMarkdown } from "@/lib/codec/markdown"
import { normalize } from "@/lib/codec/normalize"
import { SHIPPED } from "@/lib/codec/schema"
import type { CodecRule } from "@/lib/codec/types"
import { registryRules } from "./clipboardMarkdown"

/**
 * The Markdown a copy from a doc puts on the clipboard as text (L17), written
 * by the Content Codec (lib/codec, the same Markdown as an export). It is the
 * heavy half of the clipboard extension (clipboardMarkdown.ts): the doc's
 * editor fetches it on idle or at the first selection, never with the page.
 */

const LISTS = new Set(["bulletList", "orderedList", "taskList"])

function write(blocks: JSONContent[], rules: CodecRule[]): string {
  const keep = new Set(rules.map((r) => r.name))
  const doc = normalize({ type: "doc", content: blocks } as CNode, SHIPPED, keep)
  return toMarkdown(doc, { clipboard: true, rules }).replace(/\n+$/, "")
}

/** A copied slice as Markdown. */
export function sliceToMarkdown(slice: Slice, view?: EditorView, rules: CodecRule[] = registryRules()): string {
  let content = slice.content
  let openStart = slice.openStart
  let openEnd = slice.openEnd
  // Inside one block: down to the text block the selection is in.
  while (content.childCount === 1 && !content.firstChild!.isTextblock && content.firstChild!.childCount === 1 && openStart > 0 && openEnd > 0) {
    content = content.firstChild!.content
    openStart--
    openEnd--
  }
  const first = content.firstChild
  if (!first) return ""
  if (content.childCount === 1 && first.isTextblock && openStart > 0 && openEnd > 0) {
    if (first.type.name === "codeBlock") return first.textContent
    return write([{ type: "paragraph", content: (first.content.toJSON() || []) as JSONContent[] }], rules).trim()
  }
  let blocks = (content.toJSON() || []) as JSONContent[]
  if (first.isInline) {
    blocks = [{ type: "paragraph", content: blocks }]
  } else if (first.type.name === "listItem" || first.type.name === "taskItem") {
    // Items copied out of the middle of a list are still that list's items.
    blocks = [listAround(first.type.name, view, blocks)]
  }
  return write(blocks, rules)
}

function listAround(item: string, view: EditorView | undefined, items: JSONContent[]): JSONContent {
  const $from = view?.state.selection.$from
  if ($from) {
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if (LISTS.has(n.type.name)) return { type: n.type.name, attrs: { ...n.attrs }, content: items }
    }
  }
  return { type: item === "taskItem" ? "taskList" : "bulletList", content: items }
}
