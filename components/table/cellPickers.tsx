"use client"

/**
 * The grid's cell pickers: a select's options, a date's calendar and a link's
 * search. A chunk of its own (cellPickerPart, loaded the first time a picker
 * opens and warmed once the table is drawn): a grid of thousands of cells
 * draws its chips and days, never a picker until one opens. Each is mounted
 * while its popover is open, so what was typed into it goes when it closes.
 */

import * as React from "react"
import { Check, Loader2, Search } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { useGlobalSearch, type SearchResult } from "@/services/searchService"
import { pickRows, type FieldOption, type RelationRef, type RelationTarget } from "@/services/tableService"
import { campHueOf } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { RefGlyph } from "@/components/table/RelationCell"
import { displayNameOf } from "@/lib/personName"

/** An option's tile in a picker: its 6 px dot. */
function OptionDot({ color }: { color?: string }) {
  const hue = campHueOf(color)
  return (
    <span className="inline-flex size-6 items-center justify-center">
      <span aria-hidden="true" className={cn("size-2 rounded-[4px]", hue ? cn(HUE_CLASS[hue], "bg-hue") : "bg-ink-3")} />
    </span>
  )
}

/**
 * A select's or a multi-select's options, found by typing: a pick toggles an
 * option of a multi-select, and chooses (or, by Clear, clears) a select's.
 */
export function OptionPicker({
  name,
  options,
  selected,
  multi,
  onPick,
  onClear,
}: {
  name: string
  options: FieldOption[]
  selected: string[]
  multi: boolean
  onPick: (label: string) => void
  onClear: () => void
}) {
  const [q, setQ] = React.useState("")
  const list = React.useRef<CommandListHandle>(null)
  const items: CommandListItem[] = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    // Each option by its id; a cell holds the label.
    const out: CommandListItem[] = options
      .filter((o) => !ql || o.label.toLowerCase().includes(ql))
      .map((o) => ({
        id: o.id,
        label: o.label,
        tile: <OptionDot color={o.color} />,
        trailing: selected.includes(o.label) ? <Check className="size-4 text-camp-moss" aria-hidden="true" /> : undefined,
      }))
    if (!multi && selected.length && !ql) out.push({ id: "__clear", label: "Clear", text: "Clear", tile: <span className="size-6" /> })
    return out
  }, [options, q, selected, multi])
  return (
    <CommandList
      ref={list}
      label={`${name} options`}
      className="w-64"
      items={items}
      query={q}
      onSelect={(item) => {
        if (item.id === "__clear") return onClear()
        const label = options.find((o) => o.id === item.id)?.label
        if (label !== undefined) onPick(label)
      }}
      maxHeight={280}
      empty={options.length === 0 ? "No options yet. Add some in the column menu." : `No options match “${q}”`}
      header={
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder={multi ? "Find options" : "Find an option"}
          aria-label="Find an option"
          className="h-7 w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
        />
      }
    />
  )
}

/** A date's calendar, and Clear. */
export function DayPicker({ day, onPick }: { day: Date | undefined; onPick: (d: Date | undefined) => void }) {
  return (
    <>
      <Calendar mode="single" selected={day} defaultMonth={day} onSelect={onPick} initialFocus />
      <div className="flex justify-end p-2 pt-0">
        <Button variant="ghost" size="xs" disabled={!day} onClick={() => onPick(undefined)}>
          Clear
        </Button>
      </div>
    </>
  )
}

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

/**
 * A link's picker: a table's rows, shown before anything is typed and found
 * by name (pickRows), or items found by search. A pick toggles a link; a pick
 * of an item closes the picker.
 */
export function RelationPicker({
  refs,
  target,
  rowsOf,
  tableName,
  onToggle,
  onClose,
}: {
  refs: RelationRef[]
  target: RelationTarget
  /** For a link to a table's rows: the table. */
  rowsOf?: string
  tableName?: string
  onToggle: (ref: RelationRef) => void
  onClose: () => void
}) {
  const { search } = useGlobalSearch()
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<RelationRef[]>([])
  const [loading, setLoading] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = React.useRef(0)
  const list = React.useRef<CommandListHandle>(null)

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      reqId.current++ // a search still running is for a picker that's closed
    },
    [],
  )

  React.useEffect(() => {
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
    timer.current = setTimeout(
      async () => {
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
      },
      rowsOf && !q ? 0 : 180,
    )
  }, [query, search, target, rowsOf])

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
        onToggle(ref)
        if (!rowsOf) onClose()
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
  )
}
