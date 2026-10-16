"use client"

import * as React from "react"
import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react"
import { mediaLinkOf } from "@/lib/codec/mediaLink"
import { dataAttr } from "./dataAttr"

const View = React.lazy(() => import("./link-mention-view").then((m) => ({ default: m.LinkMentionView })))

/** The chip, drawn the first time one shows; until then its words, inline (a block would break the line). */
function LazyLinkMention({ ref: _ref, ...props }: ReactNodeViewProps<HTMLElement>) {
  return (
    <React.Suspense fallback={<NodeViewWrapper as="span">{mediaLinkOf("linkMention", props.node.attrs)?.text}</NodeViewWrapper>}>
      <View {...props} />
    </React.Suspense>
  )
}

/**
 * A link mention (small-details L19): a link drawn as a chip with the page's
 * icon and title, as the paste menu's Mention makes it. In HTML it is the link
 * itself (<a data-type="link-mention" href>), so anything that doesn't know it
 * reads a link; it is parsed ahead of the link mark (priority).
 */
export const LinkMention = Node.create({
  name: "linkMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute("href"),
        renderHTML: (attrs) => {
          const link = mediaLinkOf("linkMention", attrs)
          return link ? { href: link.href } : {}
        },
      },
      title: dataAttr("title", "data-title"),
      icon: dataAttr("icon", "data-icon"),
      siteName: dataAttr("siteName", "data-site"),
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="link-mention"]', priority: 60 }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const text = mediaLinkOf("linkMention", node.attrs)?.text ?? (node.attrs.title || "")
    return ["a", mergeAttributes({ "data-type": "link-mention" }, HTMLAttributes), text]
  },

  renderText({ node }) {
    return mediaLinkOf("linkMention", node.attrs)?.text ?? ""
  },

  addNodeView() {
    return ReactNodeViewRenderer(LazyLinkMention, { as: "span" })
  },
})
