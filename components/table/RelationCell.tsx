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
import { relationWrite, RelationRef, RelationTarget } from "@/services/tableService"
import { cellPickers, PickerLoading } from "./cellPickerPart"
import { relationAdd, relationMarkup } from "@/components/table/relationFace"

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
  // People are added and removed; anything else is linked.
  const people = target === "user"
  const remove = (id: string) => {
    if (onLink) onLink({ remove: [id] })
    else onCommit(relationWrite(refs.filter((x) => x.id !== id)))
  }
  const toggle = (ref: RelationRef) => (refs.some((x) => x.id === ref.id) ? remove(ref.id) : add(ref))
  return relationMarkup({
    refs,
    room,
    readOnly,
    people,
    remove,
    add: readOnly ? null : (
      <LazyPopover open={open} onOpenChange={setOpen} trigger={relationAdd(refs, people)}>
        <PopoverContent align="start" sideOffset={2} className="w-auto bg-transparent p-0 shadow-none" onOpenAutoFocus={(e) => e.preventDefault()}>
          <cellPickers.View
            fallback={<PickerLoading />}
            render={(m) => <m.RelationPicker refs={refs} target={target} rowsOf={rowsOf} tableName={tableName} onToggle={toggle} onClose={() => setOpen(false)} />}
          />
        </PopoverContent>
      </LazyPopover>
    ),
  })
}
