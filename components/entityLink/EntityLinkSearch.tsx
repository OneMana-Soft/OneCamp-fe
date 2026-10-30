"use client"

// The entity-link picker's search box and what it finds, a chunk of its own
// (components/entityLink/EntityLinkPicker). Drawn only while the picker is
// open, so each opening starts with nothing typed.

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { ErrorState } from "@/components/ui/error-state"
import { useSearchPicks } from "@/hooks/useSearchPicks"
import type { SearchResult } from "@/services/searchService"
import { FileText, LayoutDashboard, Loader2, Check, Search } from "@/lib/icons"
import type { LinkRefType } from "@/services/entityLinkService"

interface PickerItem {
  refType: LinkRefType
  refUUID: string
  title: string
}

/** A doc or board the search found, as the picker offers it. */
function pickLinkable(r: SearchResult): PickerItem | null {
  if (r.type === "doc" && r.doc?.doc_uuid) return { refType: "doc", refUUID: r.doc.doc_uuid, title: r.doc.doc_title || "Untitled doc" }
  if (r.type === "board" && r.board?.board_uuid) return { refType: "board", refUUID: r.board.board_uuid, title: r.board.board_title || "Untitled board" }
  return null
}

export function EntityLinkSearch({
  onPick,
  isLinked,
}: {
  onPick: (refType: LinkRefType, refUUID: string, title: string) => void
  isLinked: (refType: LinkRefType, refUUID: string) => boolean
}) {
  const [query, setQuery] = React.useState("")
  const { items, searching, failed, retry } = useSearchPicks(query, pickLinkable)

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input dense
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs and boards…"
          className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-[16rem] overflow-y-auto p-1">
        {searching && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        )}
        {!searching && failed && <ErrorState compact subject="docs and boards" onRetry={retry} />}
        {!searching && !failed && query.trim() && items.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No docs or boards found</div>
        )}
        {!searching && !query.trim() && (
          <div className="py-6 text-center text-xs text-muted-foreground">Type to search docs and boards</div>
        )}
        {!searching &&
          items.map((item) => {
            const linked = isLinked(item.refType, item.refUUID)
            const Icon = item.refType === "doc" ? FileText : LayoutDashboard
            return (
              <button
                key={`${item.refType}-${item.refUUID}`}
                type="button"
                disabled={linked}
                onClick={() => onPick(item.refType, item.refUUID, item.title)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  linked ? "cursor-default opacity-60" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                    item.refType === "doc" ? "bg-success/10 text-success-ink" : "bg-sky-500/10 text-sky-600",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {linked && <Check className="h-4 w-4 shrink-0 text-success-ink" />}
              </button>
            )
          })}
      </div>
    </>
  )
}
