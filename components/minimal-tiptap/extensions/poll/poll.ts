"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { PollView } from "./poll-view"

// Poll is an atomic block that stores ONLY the poll's id. The question, options
// and votes live on the server (polls / poll_votes), so every reader sees the
// same live results, and a message never carries a stale tally. The id rides in
// data-id, which the rich-HTML sanitiser already allows.
export const Poll = Node.create({
  name: "poll",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-id") || "",
        renderHTML: (attributes) => (attributes.id ? { "data-id": attributes.id } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="poll"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "poll" }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PollView)
  },
})
