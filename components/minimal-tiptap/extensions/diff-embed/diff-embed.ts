"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { DiffEmbedView } from "./diff-embed-view"

export interface DiffEmbedOptions {
  HTMLAttributes: Record<string, any>
}

// DiffEmbed is an atomic, read-only block that renders a unified diff inline in
// a message. It is emitted server-side by the agent reply pipeline (BotPost
// diffFence) as
//   <div data-type="diff" data-diff="…patch…"></div>
// when the agent includes a ```diff block, exactly mirroring ChartEmbed.
//
// It exists so a proposed patch can be REVIEWED where it was discussed. The code
// tools already produce a diff and never commit; until this node that diff
// arrived as a wall of monospace text and review moved to GitHub, which is the
// moment the reader leaves the conversation.
//
// Safety: data-diff is treated purely as data. The view splits it into lines and
// renders each as text content, never as markup, so model output cannot inject.
export const DiffEmbed = Node.create<DiffEmbedOptions>({
  name: "diffEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      diff: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-diff") || "",
        renderHTML: (attrs) => (attrs.diff ? { "data-diff": attrs.diff } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diff"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "diff" }, this.options.HTMLAttributes, HTMLAttributes),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiffEmbedView, { className: "block-node" })
  },
})

export default DiffEmbed
