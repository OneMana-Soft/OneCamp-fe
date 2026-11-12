"use client"

// The entity-link search box and what it finds, a chunk of its own
// (components/entityLink/EntityLinkPicker, an event's Linked row). Drawn only
// while its picker is open, so each opening starts with nothing typed. It
// offers the kinds its caller links, docs and boards unless told, each hit
// read once (lib/search/hitRef) and named by its title and its kind, the word
// the table's relation picker writes (components/search/hitKindWord).

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { ErrorState } from "@/components/ui/error-state"
import { useSearchPicks } from "@/hooks/useSearchPicks"
import { hitRef, type HitRefKind } from "@/lib/search/hitRef"
import { HitKindWord } from "@/components/search/hitKindWord"
import { FileText, LayoutDashboard, ListTodo, Loader2, Check, Search } from "@/lib/icons"

/** What the search links: a doc, a board or a task. */
export type LinkKind = Exclude<HitRefKind, "project">

const LOOK: Record<LinkKind, { plural: string; Icon: typeof FileText; tile: string }> = {
  doc: { plural: "docs", Icon: FileText, tile: "bg-success/10 text-success-ink" },
  board: { plural: "boards", Icon: LayoutDashboard, tile: "bg-sky-500/10 text-sky-600" },
  task: { plural: "tasks", Icon: ListTodo, tile: "bg-brand-muted text-brand-text" },
}

const DOCS_AND_BOARDS = ["doc", "board"] as const

/** "docs and boards", "docs, boards or tasks". */
function listOf(kinds: readonly LinkKind[], last: "and" | "or"): string {
  const words = kinds.map((k) => LOOK[k].plural)
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}` : (words[0] ?? "")
}

export function EntityLinkSearch<K extends LinkKind>({
  onPick,
  isLinked,
  kinds = DOCS_AND_BOARDS as readonly LinkKind[] as readonly K[],
}: {
  onPick: (refType: K, refUUID: string, title: string) => void
  isLinked: (refType: K, refUUID: string) => boolean
  /** What it offers: docs and boards unless said. */
  kinds?: readonly K[]
}) {
  const [query, setQuery] = React.useState("")
  const { items, searching, failed, retry } = useSearchPicks(query, (r) => {
    const hit = hitRef(r)
    return hit && (kinds as readonly HitRefKind[]).includes(hit.kind) ? { ...hit, kind: hit.kind as K } : null
  })
  const all = listOf(kinds, "and")

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input dense
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${all}…`}
          className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-[16rem] overflow-y-auto p-1">
        {searching && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        )}
        {!searching && failed && <ErrorState compact subject={all} onRetry={retry} />}
        {!searching && !failed && query.trim() && items.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No {listOf(kinds, "or")} found</div>
        )}
        {!searching && !query.trim() && (
          <div className="py-6 text-center text-xs text-muted-foreground">Type to search {all}</div>
        )}
        {!searching &&
          items.map((item) => {
            const linked = isLinked(item.kind, item.id)
            const { Icon, tile } = LOOK[item.kind]
            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                disabled={linked}
                onClick={() => onPick(item.kind, item.id, item.title)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  linked ? "cursor-default opacity-60" : "hover:bg-muted",
                )}
              >
                <span data-link-kind={item.kind} className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", tile)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <HitKindWord kind={item.kind} />
                {linked && <Check className="h-4 w-4 shrink-0 text-success-ink" />}
              </button>
            )
          })}
      </div>
    </>
  )
}
