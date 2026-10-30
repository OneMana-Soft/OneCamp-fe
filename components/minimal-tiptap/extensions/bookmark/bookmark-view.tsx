"use client"

import * as React from "react"
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Globe, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { isSafeHref } from "@/lib/utils/safeHref"
import { shapeLabel } from "@/lib/links/urlLabel"
import { docFileOf, viewableFileUrl } from "@/lib/docFiles"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { fillPreview } from "../smart-paste/linkActions"
import { trackPos } from "../smart-paste/smartPaste"
import { LinkField } from "../links-media/LinkField"

const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return href
  }
}

/**
 * A picture kept with the doc, drawn only once it has loaded (a broken one is
 * no picture). Only ever the doc's own file: an address anywhere else, written
 * into the doc by hand, would tell that site who reads it.
 */
function Kept({ src, className, guest }: { src: string | null; className: string; guest: boolean }) {
  const [ok, setOk] = React.useState(false)
  if (!src || !docFileOf(src)) return null
  return <img src={viewableFileUrl(src, guest)} alt="" aria-hidden="true" loading="lazy" onLoad={() => setOk(true)} className={cn(className, !ok && "invisible")} />
}

/**
 * A bookmark (editor.md P1-4; small-details L19): the page's title, two lines
 * of its description, its icon and site, and its picture on the right, as the
 * server read them. The whole card is the link, opening in a new tab. A page
 * the server couldn't read is the same card with its address, never an error;
 * someone who can edit can try again from the block menu (Refresh preview).
 * With no link yet (from "/"), it asks for one.
 */
export function BookmarkView({ node, editor, getPos, selected, updateAttributes }: NodeViewProps) {
  const guest = useGuestReader()
  const href = typeof node.attrs.href === "string" ? node.attrs.href : ""
  const [loading, setLoading] = React.useState(false)

  const make = React.useCallback(
    async (link: string) => {
      updateAttributes({ href: link })
      const pos = typeof getPos === "function" ? getPos() : null
      if (pos == null) return
      setLoading(true)
      await fillPreview(editor, trackPos(editor, pos, 1), link)
      setLoading(false)
    },
    [editor, getPos, updateAttributes],
  )

  if (!href) {
    return (
      <NodeViewWrapper data-bookmark="" contentEditable={false} className="select-none">
        {editor.isEditable ? (
          <LinkField label="Paste a link to make a bookmark" action="Make bookmark" onSubmit={(l) => void make(l)} selected={selected} />
        ) : null}
      </NodeViewWrapper>
    )
  }

  const safe = isSafeHref(href) && /^https?:\/\//i.test(href)
  const title = (node.attrs.title as string) || shapeLabel(href) || hostOf(href)
  const description = node.attrs.description as string | null
  const site = (node.attrs.siteName as string) || hostOf(href)
  const filled = !!node.attrs.title

  return (
    <NodeViewWrapper data-bookmark="" contentEditable={false} className="select-none my-1">
      <a
        href={safe ? href : undefined}
        target="_blank"
        rel="noopener noreferrer nofollow"
        draggable={false}
        aria-busy={loading || undefined}
        className={cn(
          "group/bookmark flex min-h-[88px] overflow-hidden rounded-[12px] bg-raised text-ink no-underline shadow-e1 outline-none transition-shadow duration-[140ms] ease-[var(--ease-out)] hover:shadow-e2",
          "focus-visible:ring-2 focus-visible:ring-brand",
          drawnSelected(editor, selected) && "ring-2 ring-brand ring-offset-2 ring-offset-sheet",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
          <span className={cn("truncate text-ui-sm font-medium", !filled && "text-ink-2")}>{title}</span>
          {description ? <span className="line-clamp-2 text-meta text-ink-3">{description}</span> : null}
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-2">
            {loading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : node.attrs.icon ? (
              <Kept src={node.attrs.icon} guest={guest} className="size-4 shrink-0 rounded-[3px]" />
            ) : (
              <Globe className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            )}
            <span className="truncate">{site}</span>
          </span>
        </span>
        {node.attrs.image ? (
          <span className="relative hidden w-[30%] min-w-[120px] max-w-[220px] shrink-0 bg-sunken sm:block">
            <Kept src={node.attrs.image} guest={guest} className="absolute inset-0 size-full object-cover" />
          </span>
        ) : null}
      </a>
    </NodeViewWrapper>
  )
}
