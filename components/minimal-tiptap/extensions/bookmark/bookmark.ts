"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { lazyNodeView } from "../lazyNodeView"
import { dataAttr, linkChildren } from "../link/dataAttr"

const BookmarkView = lazyNodeView(() => import("./bookmark-view").then((m) => m.BookmarkView), 88)

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      /** A bookmark of a link, its preview filled in as the server reads it. */
      setBookmark: (attrs: { href?: string | null }) => ReturnType
    }
  }
}

/**
 * A bookmark (editor.md P1-4): a link shown as a card, with the page's title,
 * description, site name, icon and picture, as this workspace's server read
 * them (GET /unfurl). The icon and the picture are kept with the doc (POST
 * /unfurl/store), so a reader never loads them from the site. Its attributes
 * are a snapshot of the page, never rich text (I5); its HTML holds a plain
 * link, so the doc's saved body, an export or a search still has it.
 */
export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      href: dataAttr("href", "data-href"),
      title: dataAttr("title", "data-title"),
      description: dataAttr("description", "data-description"),
      siteName: dataAttr("siteName", "data-site"),
      icon: dataAttr("icon", "data-icon"),
      image: dataAttr("image", "data-image"),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "bookmark" }, HTMLAttributes), ...linkChildren("bookmark", node.attrs)]
  },

  addCommands() {
    return {
      setBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView)
  },
})
