"use client"

// RelationCell links a table row to OneCamp entities (tasks, docs, boards,
// users, projects), reusing the access-scoped unified search (req 4.2), or to
// rows of a table, found by name (pickRows). A row keeps each link as
// {id, type}; the server names each item for each reader, and sends the ones
// a reader can't open without a name, shown here as one "can't open" chip. A
// link to a table's row is stored by id, and comes back with the row's name.

import { displayNameOf } from "@/lib/personName"
import * as React from "react"
import { PopoverContent } from "@/components/ui/popover"
import { LazyPopover } from "./LazyPopover"
import { cn } from "@/lib/utils/helpers/cn"
import { useGlobalSearch, SearchResult } from "@/services/searchService"
import Link from "next/link"
import { Check, CircleDot, FileText, Folder, LayoutDashboard, Link2, Loader2, Lock, Search, User, X, Plus } from "@/lib/icons"
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { TableGlyph } from "@/components/table/TableGlyph"
import { isHiddenRef, pickRows, relationWrite, RelationRef, RelationTarget } from "@/services/tableService"
import { hiddenText } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"

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

/** A linked thing's 14 px glyph: a table row's tile, a page, a task's ring, a project, a person. */
function RefGlyph({ item: r }: { item: RelationRef }) {
  if (r.type === "row" && r.table_id) return <TableGlyph id={r.table_id} size="sm" className="!size-3.5 !rounded-[4px] [&_svg]:!size-2.5" />
  const Icon = r.type === "doc" ? FileText : r.type === "board" ? LayoutDashboard : r.type === "task" ? CircleDot : r.type === "project" ? Folder : r.type === "user" ? User : Link2
  return <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
}

/** Where a linked chip goes: a table's row opens in its record panel. */
function hrefOf(r: RelationRef): string | null {
  if (r.type === "row" && r.table_id) return `/app/tables/${r.table_id}?row=${encodeURIComponent(r.id)}`
  if (r.type === "doc") return `/app/doc/${r.id}`
  if (r.type === "board") return `/app/board/${r.id}`
  if (r.type === "project") return `/app/project/${r.id}`
  if (r.type === "task") return `/app/task/${r.id}`
  return null
}

/**
 * A relation cell (content.md T12): the linked records as raised chips on e1
 * (they are records you can open), each with its glyph, lifting to e2 with an
 * unlink × on hover; a 20 px "+" after them on the row under the pointer; and
 * a CommandList picker whose rows toggle (a moss check marks what's linked).
 */
export function RelationCell({
  value,
  room = { max: Infinity, wrap: true },
  target,
  tableId,
  tableName,
  readOnly,
  onLink,
  onCommit,
}: {
  value: unknown
  /** How many chips show before "+N", and whether they wrap (gridCells' chipRoom); all, wrapping, by default. */
  room?: { max: number; wrap: boolean }
  target: RelationTarget
  /** For a link to a table's rows: the table. */
  tableId?: string
  /** That table's name, for the picker's search ("Link a row from Vendors"). */
  tableName?: string
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
  const list = React.useRef<CommandListHandle>(null)

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

  // A cell's write keeps every link it holds, the ones this reader can't open too.
  const add = (ref: RelationRef) => {
    if (refs.some((x) => x.id === ref.id)) return
    if (onLink) onLink({ add: [ref.id] })
    else onCommit(relationWrite([...refs, ref]))
  }
  const remove = (id: string) => {
    if (onLink) onLink({ remove: [id] })
    else onCommit(relationWrite(refs.filter((x) => x.id !== id)))
  }
  const toggle = (ref: RelationRef) => (refs.some((x) => x.id === ref.id) ? remove(ref.id) : add(ref))
  // Items the reader can't open show as one chip, never by name or id.
  const hidden = refs.filter((r) => r.type !== "more" && (isHiddenRef(r) || !r.label)).length
  const named = refs.filter((r) => r.type !== "more" && !isHiddenRef(r) && r.label)
  const shown = named.slice(0, room.max)
  const more = refs.find((r) => r.type === "more")

  const listItems: CommandListItem[] = items.map((ref) => ({
    id: `${ref.type}-${ref.id}`,
    label: ref.label ?? "",
    text: ref.label ?? "",
    tile: (
      <span className="inline-flex size-6 items-center justify-center">
        <RefGlyph item={ref} />
      </span>
    ),
    trailing: refs.some((x) => x.id === ref.id) ? (
      <Check className="size-4 text-camp-moss" aria-label="Linked" />
    ) : ref.type !== "row" ? (
      <span className="text-meta text-ink-3 first-letter:uppercase">{ref.type}</span>
    ) : undefined,
  }))
  const placeholder = rowsOf ? `Link a row from ${tableName || "the table"}` : `Search ${target === "any" ? "tasks, docs and people" : target + "s"}`
  const emptyText = loading
    ? null
    : !query.trim() && !rowsOf
      ? "Type to search"
      : rowsOf && !query.trim()
        ? "That table has no rows yet"
        : `Nothing matches “${query.trim()}”`

  return (
    <div className={cn("relative flex h-full min-h-8 items-center gap-1 px-3", room.wrap ? "flex-wrap content-center py-1" : "overflow-hidden")}>
      {shown.map((ref) => {
        const href = !readOnly ? hrefOf(ref) : null
        return (
          <span
            key={ref.id}
            data-relation-chip=""
            className="group/chip inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 rounded-md bg-raised pl-1.5 pr-1.5 text-meta font-medium text-ink shadow-e1 transition-shadow hover:shadow-e2"
          >
            <RefGlyph item={ref} />
            {href ? (
              <Link href={href} className="truncate rounded-sm" title={`Open ${ref.label}`}>
                {ref.label}
              </Link>
            ) : (
              <span className="truncate">{ref.label}</span>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(ref.id)}
                className="-mr-0.5 hidden size-4 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink group-hover/chip:inline-flex focus-visible:inline-flex [@media(hover:none)]:inline-flex"
                title="Unlink"
                aria-label={`Unlink ${ref.label}`}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        )
      })}
      {named.length > shown.length ? (
        // The named links past those a row has room for, counted.
        <span className="chip h-[22px] shrink-0 text-ink-2" data-relation-more="" title={named.slice(shown.length).map((r) => r.label).join(", ")}>
          +{formatLocale(named.length - shown.length, {})}
        </span>
      ) : null}
      {more ? (
        // The links past those the server sent, counted.
        <span className="chip h-[22px] shrink-0 text-ink-2">{more.label}</span>
      ) : null}
      {hidden > 0 ? (
        <span
          data-relation-hidden=""
          title="You don't have access to what's linked here"
          className="inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 rounded-md bg-hover px-1.5 text-meta text-ink-3 ring-1 ring-inset ring-line"
        >
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{hiddenText(hidden)}</span>
        </span>
      ) : null}
      {readOnly ? null : (
        <LazyPopover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <button
              type="button"
              aria-label="Add a link"
              className={cn(
                "inline-flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-md text-meta text-ink-3 transition-opacity hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                refs.length > 0
                  ? "w-5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                  : "px-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
              )}
            >
              <Plus className="size-3" /> {refs.length === 0 ? "Link" : ""}
            </button>
          }
        >
          <PopoverContent align="start" sideOffset={2} className="w-auto bg-transparent p-0 shadow-none" onOpenAutoFocus={(e) => e.preventDefault()}>
            <CommandList
              ref={list}
              label="Rows to link"
              roomy
              className="w-80"
              items={listItems}
              query={query}
              maxHeight={300}
              onSelect={(item) => {
                const ref = items.find((r) => `${r.type}-${r.id}` === item.id)
                if (!ref) return
                toggle(ref)
                if (!rowsOf) setOpen(false)
              }}
              empty={emptyText}
              after={
                loading ? (
                  <div className="flex h-9 items-center gap-2 px-2 text-ui-sm text-ink-3">
                    <Loader2 className="size-3.5 animate-spin" /> Searching…
                  </div>
                ) : null
              }
              header={
                <span className="flex w-full items-center gap-2">
                  <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (list.current?.onKeyDown(e)) e.preventDefault()
                    }}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className="h-7 min-w-0 flex-1 bg-transparent text-ui font-normal text-ink outline-none placeholder:text-ink-3"
                  />
                </span>
              }
            />
          </PopoverContent>
        </LazyPopover>
      )}
    </div>
  )
}
