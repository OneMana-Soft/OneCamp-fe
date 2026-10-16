"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"
import { dataAttr, linkChildren } from "../link/dataAttr"

const WebEmbedView = lazyNodeView(() => import("./web-embed-view").then((m) => m.WebEmbedView), 240)

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    webEmbed: {
      /** An embed of a link; one that no allowed site makes shows as a link. */
      setWebEmbed: (attrs: { src?: string | null; height?: number | null }) => ReturnType
    }
  }
}

/**
 * An embed (editor.md P1-5): another site framed in the doc. It stores the
 * link someone pasted, never the frame's address: what is framed is made from
 * the link when it is drawn (lib/embeds/providers.ts), only for the sites the
 * editor allows and the hosts an admin added, so a doc written through the
 * API can't frame anything else. height is the frame's, as someone sized it.
 */
export const WebEmbed = Node.create({
  name: "webEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: dataAttr("src", "data-src"),
      height: dataAttr("height", "data-height", true),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="web-embed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "web-embed" }, HTMLAttributes), ...linkChildren("webEmbed", node.attrs)]
  },

  addCommands() {
    return {
      setWebEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebEmbedView)
  },
})
