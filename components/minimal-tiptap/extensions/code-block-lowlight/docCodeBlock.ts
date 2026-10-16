"use client"

/**
 * A doc's code block (docs programme B3): the code block every editor has
 * (lazyCodeBlock.ts: the same node, highlighted once its highlighter loads),
 * with what a doc adds: Wrap and a caption, stored as the block's attributes
 * (data-wrap and data-caption on its <pre>), and the block's bar
 * (code-block-view.ts). A chat message keeps the plain block.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { LazyCodeBlock } from "./lazyCodeBlock"
import { CodeBlockView } from "./code-block-view"
import { MERMAID } from "./languages"

const caretKey = new PluginKey("docCodeCaret")

export const DocCodeBlock = LazyCodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-wrap") === "true",
        renderHTML: (attrs: Record<string, unknown>) => (attrs.wrap ? { "data-wrap": "true" } : {}),
      },
      caption: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-caption") || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new CodeBlockView(node, editor, () => (typeof getPos === "function" ? getPos() : undefined))
  },

  addProseMirrorPlugins() {
    const name = this.name
    return [
      ...(this.parent?.() ?? []),
      // Which diagram has the caret: its code shows beside it while it does.
      // Read from the selection alone, never the doc.
      new Plugin({
        key: caretKey,
        props: {
          decorations(state) {
            const { $from } = state.selection
            const block = $from.parent
            if (block.type.name !== name || block.attrs.language !== MERMAID || $from.depth < 1) return null
            const pos = $from.before()
            return DecorationSet.create(state.doc, [Decoration.node(pos, pos + block.nodeSize, {}, { caretIn: true })])
          },
        },
      }),
    ]
  },
})
