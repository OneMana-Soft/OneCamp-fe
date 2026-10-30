"use client"

import * as React from "react"
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { useDocIntent } from "@/components/navigationBar/desktop/IntentLink"
import { followHref, onMiddleClick, refreshEntity, useLiveEntity, type DocChipData } from "@/lib/liveEntity"
import { ArrowUpRight, Lock } from "@/lib/icons"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import { takeOpen } from "./opening"

/**
 * A page in the doc, as Notion draws one: its icon and its title as they are
 * now, underlined, the whole line a link. A link to a page that lives
 * elsewhere wears an arrow. A page the reader can't open reads "No access"
 * (and opens on its own page, which offers Request access); a deleted one
 * says so. Resting on it fetches the page, so it opens at once (A2). A guest
 * reads only that it is a page, and it goes nowhere.
 */
export function SubpageView({ node, editor, selected }: NodeViewProps) {
  const docId: string = node.attrs.docId || ""
  const guest = useGuestReader()
  const live = useLiveEntity<DocChipData>("doc", guest ? null : docId)
  const router = useAppRouter()

  // A page "/page" just made opens as soon as its block is drawn, its title ready to type.
  React.useEffect(() => {
    if (docId && takeOpen(docId)) router.push(`/app/doc/${docId}?new=1`)
  }, [docId, router])

  const d = live.data
  const opens = !guest && !!docId && (live.state === "ok" || live.state === "none")
  // Fetched on intent, as the sidebar's links are (A2): a rest, a touch, a focus or the press.
  const intent = useDocIntent(opens ? docId : null)
  const open =(e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (live.state === "error") return refreshEntity("doc", docId)
    if (opens) followHref(`/app/doc/${docId}`, e as React.MouseEvent, router.push)
  }
  const elsewhere = live.state === "ok" && d?.parent_id !== busFor(editor)?.docId

  let lead: React.ReactNode
  let words: React.ReactNode
  switch (guest ? "guest" : live.state) {
    case "guest":
      lead = <DocIcon size={18} />
      words = "Page"
      break
    case "ok":
      lead = <DocIcon icon={d?.icon} size={18} />
      words = d?.title ? d.title : <span className="text-ink-3">Untitled</span>
      break
    case "none":
      lead = <Lock className="size-[18px] text-ink-3" aria-hidden="true" />
      words = <span className="text-ink-3">No access</span>
      break
    case "gone":
      lead = <DocIcon size={18} />
      words = <span className="text-ink-3">Deleted page</span>
      break
    case "error":
      lead = <DocIcon size={18} />
      words = (
        <span className="text-ink-3">
          Couldn&apos;t load this page. Select to try again.
          <SaysLoadFailure />
        </span>
      )
      break
    default:
      lead = <DocIcon size={18} />
      words = <span aria-hidden="true" className="inline-block h-3 w-40 animate-pulse rounded-sm bg-press motion-reduce:animate-none" />
  }

  const acts = opens || live.state === "error"
  return (
    <NodeViewWrapper data-subpage="" data-state={guest ? "guest" : live.state}>
      <div
        contentEditable={false}
        data-subpage-open=""
        role={acts ? "link" : undefined}
        tabIndex={acts ? 0 : undefined}
        aria-label={live.state === "ok" ? `Page: ${d?.title || "Untitled"}` : undefined}
        onClick={acts ? open : undefined}
        onAuxClick={acts ? onMiddleClick<React.MouseEvent>(open) : undefined}
        onKeyDown={(e) => {
          if (acts && e.key === "Enter") open(e)
        }}
        {...intent}
        className={cn(
          "my-0.5 flex min-h-[34px] select-none items-center gap-2 rounded-lg px-1.5 py-1 text-ink",
          acts && "cursor-pointer transition-colors duration-[140ms] ease-[var(--ease-out)] hover:bg-hover motion-reduce:transition-none",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          drawnSelected(editor, selected) && "bg-sel ring-2 ring-brand/40",
        )}
      >
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center">{lead}</span>
        <span className={cn("min-w-0 truncate font-[510]", live.state === "ok" && "underline decoration-line-3 decoration-1 underline-offset-[3px]")}>{words}</span>
        {elsewhere ? <ArrowUpRight className="size-3.5 shrink-0 text-ink-3" aria-label="Elsewhere" /> : null}
      </div>
    </NodeViewWrapper>
  )
}
