"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Globe } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { mediaLinkOf } from "@/lib/codec/mediaLink"
import { shapeLabel } from "@/lib/links/urlLabel"
import { docFileOf, viewableFileUrl } from "@/lib/docFiles"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"

/**
 * A link mention (small-details L19): the page's icon and title in a chip, in
 * the line, opening the page in a new tab. Its title is the page's own, as
 * the server read it; until then, or for a page it couldn't read, the link's
 * label from its shape.
 */
export function LinkMentionView({ node, selected }: NodeViewProps) {
  const guest = useGuestReader()
  const link = mediaLinkOf("linkMention", node.attrs)
  const href = link?.href ?? ""
  const title = (node.attrs.title as string) || (href && shapeLabel(href)) || href.replace(/^https?:\/\/(www\.)?/, "")
  const [iconOk, setIconOk] = React.useState(false)
  // Only ever the doc's own file (storeFromLink kept it): an address anywhere else would tell that site who reads it.
  const icon = typeof node.attrs.icon === "string" && docFileOf(node.attrs.icon) ? node.attrs.icon : ""

  return (
    <NodeViewWrapper as="span" data-link-mention="" className="align-baseline">
      <a
        href={href || undefined}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={href}
        draggable={false}
        contentEditable={false}
        className={cn(
          "inline-flex max-w-[22rem] items-baseline gap-1 rounded-md px-0.5 text-brand-text no-underline outline-none transition-colors duration-[90ms] hover:bg-hover",
          "focus-visible:ring-2 focus-visible:ring-brand",
          selected && "bg-press ring-2 ring-brand",
        )}
      >
        <span className="relative top-[0.125em] inline-flex size-[1em] shrink-0 items-center justify-center">
          {icon ? (
            <img src={viewableFileUrl(icon, guest)} alt="" aria-hidden="true" onLoad={() => setIconOk(true)} className={cn("size-[1em] rounded-[2px]", !iconOk && "hidden")} />
          ) : null}
          {!iconOk ? <Globe className="size-[0.9em] text-ink-3" aria-hidden="true" /> : null}
        </span>
        <span className="truncate font-medium">{title}</span>
      </a>
    </NodeViewWrapper>
  )
}
