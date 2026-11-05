"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"
import { blockLink, idAttr } from "../connected/attrs"

const WhiteboardEmbedView = lazyNodeView(() => import("./WhiteboardEmbedView").then((m) => m.WhiteboardEmbedView), 360)

/**
 * A whiteboard in a doc (miro-34, "/whiteboard"): the board itself, live and
 * read-only, as the reader may see it. The doc keeps only the board's id, so
 * its name and drawing are read as the reader, never kept in the doc.
 */
export const WhiteboardEmbed = Node.create({
  name: "whiteboardEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { boardId: idAttr("boardId", "data-board-id") }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="whiteboard-embed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "whiteboard-embed" }, HTMLAttributes), ...blockLink(node)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WhiteboardEmbedView)
  },
})
