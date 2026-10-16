"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"
import { dataAttr } from "../link/dataAttr"
import { blockLink, idAttr } from "../connected/attrs"

const SubpageView = lazyNodeView(() => import("./SubpageView").then((m) => m.SubpageView), 34)

/**
 * A page in the doc (docs C1, structure.md P1.2): a subpage made with /page,
 * or a link to any page made with /link to page. It keeps the page's id only:
 * a title kept in the doc would reach readers who may not open the page (by
 * copy, export and the guest's page), so a reader without the app reads
 * "Page" (a title an older client kept is still read). The app draws the
 * page's title and icon as they are now, and "No access" for a page the
 * reader can't open. Its plain link makes the page a backlink of this one
 * (business/Doc's mentions hook).
 */
export const Subpage = Node.create({
  name: "subpage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { docId: idAttr("docId", "data-doc-id"), title: dataAttr("title", "data-title") }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="subpage"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "subpage" }, HTMLAttributes), ...blockLink(node)]
  },

  addNodeView() {
    // Pages one after another read as one list, 4 px apart, not a block's 12 px (doc.css).
    return ReactNodeViewRenderer(SubpageView, { className: "[.node-subpage+&]:mt-0!" })
  },
})
