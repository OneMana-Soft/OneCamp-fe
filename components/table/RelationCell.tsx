"use client"

// RelationCell links a table row to OneCamp entities (tasks, docs, boards,
// users, projects), reusing the access-scoped unified search (req 4.2), or to
// rows of a table, found by name (pickRows). A row keeps each link as
// {id, type}; the server names each item for each reader, and sends the ones
// a reader can't open without a name, shown here as one "can't open" chip. A
// link to a table's row is stored by id, and comes back with the row's name.

import * as React from "react"
import { PopoverContent } from "@/components/ui/popover"
import { LazyPopover } from "./LazyPopover"
import { cn } from "@/lib/utils/helpers/cn"
import Link from "next/link"
import { CircleDot, FileText, Folder, LayoutDashboard, Link2, Lock, User, X, Plus } from "@/lib/icons"
import { TableGlyph } from "@/components/table/TableGlyph"
import { isHiddenRef, relationWrite, RelationRef, RelationTarget } from "@/services/tableService"
import { cellPickers, PickerLoading } from "./cellPickerPart"
import { hiddenText } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"
import { tablePath } from "@/lib/tables/route"

/** A linked thing's 14 px glyph: a table row's tile, a page, a task's ring, a project, a person. */
export function RefGlyph({ item: r }: { item: RelationRef }) {
  if (r.type === "row" && r.table_id) return <TableGlyph id={r.table_id} size="sm" className="!size-3.5 !rounded-[4px] [&_svg]:!size-2.5" />
  const Icon = r.type === "doc" ? FileText : r.type === "board" ? LayoutDashboard : r.type === "task" ? CircleDot : r.type === "project" ? Folder : r.type === "user" ? User : Link2
  return <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
}

/** Where a linked chip goes: a table's row opens in its record panel. */
function hrefOf(r: RelationRef): string | null {
  if (r.type === "row" && r.table_id) return tablePath(r.table_id, { row: r.id })
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
  const [open, setOpen] = React.useState(false)

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
            <cellPickers.View
              fallback={<PickerLoading />}
              render={(m) => <m.RelationPicker refs={refs} target={target} rowsOf={rowsOf} tableName={tableName} onToggle={toggle} onClose={() => setOpen(false)} />}
            />
          </PopoverContent>
        </LazyPopover>
      )}
    </div>
  )
}
