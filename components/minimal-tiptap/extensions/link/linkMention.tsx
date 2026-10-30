"use client"

import * as React from "react"
import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps, type ReactNodeViewProps } from "@tiptap/react"
import { mediaLinkOf } from "@/lib/codec/mediaLink"
import { dataAttr } from "./dataAttr"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { LINK_CLASS } from "./link"

/**
 * The room either side of a link mention, its chip's and the plain link's alike, so the words around it stand where
 * they did when one gives way to the other.
 */
export const MENTION_ROOM = "px-0.5"

/**
 * The link the chip stands for, inline (a block would break the line): drawn while the chip's code comes, and in its
 * place when that code can't come (no network), where it still opens, as the chip does, in a new tab. It reads as the
 * doc's other links do and keeps the chip's room. 'online' or the chip's next draw asks again.
 */
function PlainLink({ node }: Pick<NodeViewProps, "node">) {
  const link = mediaLinkOf("linkMention", node.attrs)
  return (
    <NodeViewWrapper as="span">
      {link ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" title={link.href} className={`${LINK_CLASS} ${MENTION_ROOM}`}>
          {link.text}
        </a>
      ) : null}
    </NodeViewWrapper>
  )
}

const View = lazyPiece(() => import("./link-mention-view").then((m) => ({ default: m.LinkMentionView })), { failed: PlainLink })

/** The chip, drawn the first time one shows; until then, the plain link. */
function LazyLinkMention({ ref: _ref, ...props }: ReactNodeViewProps<HTMLElement>) {
  return (
    <React.Suspense fallback={<PlainLink node={props.node} />}>
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
