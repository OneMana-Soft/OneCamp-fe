"use client"

// RelationCell links a table row to OneCamp entities (tasks, docs, boards,
// users, projects), reusing the access-scoped unified search (req 4.2). Linked
// refs are stored on the row as [{id,label,type}] so the grid renders without
// re-resolving each entity.

import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useGlobalSearch, SearchResult } from "@/services/searchService"
import { Loader2, Search, X, Plus } from "@/lib/icons"
import { RelationRef, RelationTarget } from "@/services/tableService"

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
    return { id: r.user.user_uuid, label: r.user.user_name || r.user.user_full_name || "User", type: "user" }
  return null
}

export function RelationCell({
  value,
  target,
  onCommit,
}: {
  value: unknown
  target: RelationTarget
  onCommit: (value: RelationRef[]) => void
}) {
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
      setQuery("")
      setItems([])
      return
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (timer.current) clearTimeout(timer.current)
    if (!q) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqId.current
    timer.current = setTimeout(async () => {
      const res = await search(q)
      if (myReq !== reqId.current) return
      const mapped: RelationRef[] = []
      for (const r of res?.page ?? []) {
        const ref = refFromResult(r, target)
        if (ref) mapped.push(ref)
        if (mapped.length >= 8) break
      }
      setItems(mapped)
      setLoading(false)
    }, 180)
  }, [query, open, search, target])

  const add = (ref: RelationRef) => {
    if (refs.some((x) => x.id === ref.id)) return
    onCommit([...refs, ref])
  }
  const remove = (id: string) => onCommit(refs.filter((x) => x.id !== id))

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1">
      {refs.map((ref) => (
        <span key={ref.id} className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs">
          {ref.label}
          <button onClick={() => remove(ref.id)} className="opacity-60 hover:opacity-100" title="Unlink">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" /> {refs.length === 0 ? "Link" : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${target === "any" ? "entities" : target + "s"}...`}
              className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching...
              </div>
            )}
            {!loading && query.trim() && items.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">Nothing found</div>
            )}
            {!loading && !query.trim() && (
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
                    <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">{ref.type}</span>
                    <span className="min-w-0 flex-1 truncate">{ref.label}</span>
                  </button>
                )
              })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default RelationCell
