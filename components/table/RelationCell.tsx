"use client"

// RelationCell links a table row to OneCamp entities (tasks, docs, boards,
// users, projects), reusing the access-scoped unified search (req 4.2), or to
// rows of a table, found by name (pickRows). Linked refs are stored on the row
// as [{id,label,type}] so the grid renders without re-resolving each entity; a
// link to a table's row is stored by id, and comes back with the row's name.

import { displayNameOf } from "@/lib/personName"
import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useGlobalSearch, SearchResult } from "@/services/searchService"
import Link from "next/link"
import { Loader2, Search, X, Plus } from "@/lib/icons"
import { pickRows, RelationRef, RelationTarget } from "@/services/tableService"

// Pull a {id,label,type} ref out of a unified-search result, scoped to the
// allowed target type ("any" accepts the linkable kinds).
function refFromResult(r: SearchResult, target: RelationTarget): RelationRef | null {
  const accept = (t: string) => target === "any" || target === t
  if (r.type === "doc" && r.doc?.doc_uuid && accept("doc"))
    return { id: r.doc.doc_uuid, label: r.doc.doc_title || "Untitled doc", type: "doc" }
  if (r.type === "board" && r.board?.board_uuid && accept("board"))
    return { id: r.board.board_uuid, label: r.board.board_title || "Untitled board", type: "board" }
  if (r.type === "task" && r.task?.task_uuid && accept("task"))
    return { id: r.task.task_uuid, label: r.task.task_name || "Untitled task", type: "task" }
  if (r.type === "project" && r.project?.project_uuid && accept("project"))
    return { id: r.project.project_uuid, label: r.project.project_name || "Untitled project", type: "project" }
  if (r.type === "user" && r.user?.user_uuid && accept("user"))
    return { id: r.user.user_uuid, label: displayNameOf(r.user) || "User", type: "user" }
  return null
}

export function RelationCell({
  value,
  target,
  tableId,
  readOnly,
  onLink,
  onCommit,
}: {
  value: unknown
  target: RelationTarget
  /** For a link to a table's rows: the table. */
  tableId?: string
  /** The links show, but can't be changed here: the reader can't open the table they go to. */
  readOnly?: boolean
  /** Links to a table's rows change one at a time, through this; other links through onCommit. */
  onLink?: (change: { add?: string[]; remove?: string[] }) => void
  onCommit: (value: RelationRef[]) => void
}) {
  const rowsOf = target === "table" ? tableId : undefined
  const refs: RelationRef[] = Array.isArray(value) ? (value as RelationRef[]) : []
  const { search } = useGlobalSearch()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<RelationRef[]>([])
  const [loading, setLoading] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = React.useRef(0)

  React.useEffect(() => {
    if (!open) {
      if (timer.current) clearTimeout(timer.current)
      reqId.current++ // a search still running is for a picker that's closed
      setQuery("")
      setItems([])
      setLoading(false)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (timer.current) clearTimeout(timer.current)
    // A table's rows show before anything is typed; anything else is searched for.
    if (!q && !rowsOf) {
      reqId.current++ // a search still running was for text that's gone
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqId.current
    timer.current = setTimeout(async () => {
      let mapped: RelationRef[] = []
      try {
        if (rowsOf) {
          const rows = await pickRows(rowsOf, q)
          mapped = rows.map((r) => ({ id: r.id, label: r.label, type: "row", table_id: rowsOf }))
        } else {
          const res = await search(q)
          for (const r of res?.page ?? []) {
            const ref = refFromResult(r, target)
            if (ref) mapped.push(ref)
            if (mapped.length >= 8) break
          }
        }
      } catch {
        // surfaced by the interceptor; nothing to offer
      }
      if (myReq !== reqId.current) return
      setItems(mapped)
      setLoading(false)
    }, rowsOf && !q ? 0 : 180)
  }, [query, open, search, target, rowsOf])

  const add = (ref: RelationRef) => {
    if (refs.some((x) => x.id === ref.id)) return
    if (onLink) onLink({ add: [ref.id] })
    else onCommit([...refs, ref])
  }
  const remove = (id: string) => {
    if (onLink) onLink({ remove: [id] })
    else onCommit(refs.filter((x) => x.id !== id))
  }

  return (
    <div className={cn("relative flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1", !readOnly && refs.length > 0 && "pr-7")}>
      {refs.map((ref) =>
        ref.type === "more" ? (
          // The links past those a cell shows, counted.
          <span key="more" className="px-1 py-0.5 text-xs text-muted-foreground">
            {ref.label}
          </span>
        ) : (
        <span key={ref.id} className="inline-flex max-w-full items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs">
          {ref.type === "row" && ref.table_id && !readOnly ? (
            <Link href={`/app/tables/${ref.table_id}`} className="hover:underline" title={`Open ${ref.label}'s table`}>
              {ref.label}
            </Link>
          ) : (
            ref.label
          )}
          {!readOnly && (
            <button onClick={() => remove(ref.id)} className="opacity-60 hover:opacity-100" title="Unlink" aria-label={`Unlink ${ref.label}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
        ),
      )}
      {readOnly ? null : (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Add a link"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              // With links in the cell, the add control sits at its right edge
              // and shows on the row under the pointer, so two links stay on one
              // line instead of pushing the row to twice its height.
              refs.length > 0 && "absolute right-1 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
            )}
          >
            <Plus className="h-3 w-3" /> {refs.length === 0 ? "Link" : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input dense
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={rowsOf ? "Search rows…" : `Search ${target === "any" ? "entities" : target + "s"}...`}
              className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!loading && (query.trim() || rowsOf) && items.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">{rowsOf && !query.trim() ? "That table has no rows yet" : "Nothing found"}</div>
            )}
            {!loading && !query.trim() && !rowsOf && (
              <div className="py-6 text-center text-xs text-muted-foreground">Type to search</div>
            )}
            {!loading &&
              items.map((ref) => {
                const linked = refs.some((x) => x.id === ref.id)
                return (
                  <button
                    key={`${ref.type}-${ref.id}`}
                    disabled={linked}
                    onClick={() => {
                      add(ref)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      linked ? "cursor-default opacity-50" : "hover:bg-muted",
                    )}
                  >
                    {ref.type !== "row" && (
                      <span className="shrink-0 text-2xs text-muted-foreground first-letter:uppercase">{ref.type}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{ref.label}</span>
                  </button>
                )
              })}
          </div>
        </PopoverContent>
      </Popover>
      )}
    </div>
  )
}
