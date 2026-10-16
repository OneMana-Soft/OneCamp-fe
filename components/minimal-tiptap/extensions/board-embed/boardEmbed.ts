"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"
import { blockLink, idAttr } from "../connected/attrs"

const BoardEmbedView = lazyNodeView(() => import("./BoardEmbedView").then((m) => m.BoardEmbedView), 220)

/**
 * A project's board in a doc, live (docs C1; "/board"): its tasks in their
 * status columns, read as the reader. The doc keeps only the project.
 */
export const BoardEmbed = Node.create({
  name: "boardEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { projectId: idAttr("projectId", "data-project-id") }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="board-embed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "board-embed" }, HTMLAttributes), ...blockLink(node)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BoardEmbedView)
  },
})
