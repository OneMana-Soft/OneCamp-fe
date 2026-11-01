"use client"

import * as React from "react"
import "./table.css"
import { ChevronRight, Plus } from "@/lib/icons"
import { iconMarkup } from "@/lib/iconMarkup"
import { TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { computedOf, optionsOf, type TableField, type TableRow } from "@/services/tableService"
import { shownValues, type RowEdits } from "@/lib/tables/useCellCommit"
import { optionChip, tintedFields } from "@/components/table/optionChip"
import { useKeptRows, useViewWindow } from "@/components/table/viewWindow"
import { placeOfRow } from "@/lib/tables/viewPlaces"
import { dayOf, formatNumber, listText, numberFormatOf } from "@/lib/tables/cellFormat"
import { shortDate } from "@/lib/utils/date/shortDate"
import { showFormulaValue } from "@/lib/tables/formula"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { kindText, statusGroupOf } from "@/lib/fieldTypes/kindsMore"
import { Skeleton } from "@/components/ui/skeleton"
import { groupedBody, toggleShut, type GroupLayout, type Grouping } from "@/lib/tables/groups"
import { GroupHeaderItem, headerPx } from "@/components/table/groups/GroupHeaders"
import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { matchesByRow, type FindMarks } from "@/lib/tables/findMarks"
import type { TransformMatch } from "@/lib/tables/transform"

/** A value as one short line of plain markup, for a list row's meta. */
export function brief(f: TableField, v: unknown, tinted: boolean): React.ReactNode {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null
  switch (f.type) {
    case "number": {
      const n = formatNumber(v, numberFormatOf(f))
      return n ? `${n.prefix}${n.text}${n.suffix}` : null
    }
    case "date": {
      const d = dayOf(v)
      return d ? shortDate(d) : null
    }
    case "checkbox":
      return v ? `${f.name} ✓` : null
    case "select":
    case "multi_select":
    case "status": {
      const labels = Array.isArray(v) ? (v as string[]) : [String(v)]
      const opts = optionsOf(f)
      const status = f.type === "status"
      return (
        <span className="inline-flex gap-1">
          {labels.slice(0, 2).map((l) => {
            const o = opts.find((x) => x.label === l)
            return (
              <React.Fragment key={l}>
                {optionChip({ label: l, color: o?.color, tinted: tinted || status, group: status && o ? statusGroupOf(o) : undefined, className: "h-5" })}
              </React.Fragment>
            )
          })}
        </span>
      )
    }
    case "formula":
    case "rollup": {
      const s = showFormulaValue(v, computedOf(f).result, numberFormatOf(f))
      return s.kind === "number" || s.kind === "text" ? s.text : null
    }
    case "relation":
      return Array.isArray(v) ? listText(v.slice(0, 2)) || null : null
    // Its files by how many, as the grid's chips count those that don't fit: their names are its own cell's.
    case "attachment":
      return Array.isArray(v) ? `${v.length} ${v.length === 1 ? "file" : "files"}` : null
    default: {
      // Tables B1's kinds: a duration's clock, a rating's stars, an id, a moment, people by name.
      const k = kindText(f, v)
      return k !== null ? k || null : String(v)
    }
  }
}

/** A list row's height: every row is one, so the window is worked out, never measured. */
const LIST_ROW_PX = 60
/** Rows drawn before the list's frame has been measured: a phone's screenful. */
const FIRST_SCREEN_ROWS = 14
/** How near the last row read the list gets before the page reads more: about three screens. */
const NEAR_END_ROWS = 40
/** The values named under a row's title. */
const META_FIELDS = 3
/**
 * How far a row brought into sight (a find's step, a row added) stops from the list box's edges: its scroll
 * margin's 12 px (table.css), which the page keeps too. The virtualizer checks its scroll a frame later at the
 * edge it aligned to, so the box keeps the room itself, or it takes the margin back (DESIGN-BUILD-67 MUST 1).
 */
const ROW_CLEAR_PX = 12

/**
 * A table on a phone with more than four fields (content.md T22): each row a
 * 60 px line with its primary value and two or three others under it; a tap
 * opens the record panel as a sheet. The grid stays one toggle away.
 *
 * Only the rows in view (and a few either side) are in the page, through the
 * grid's window (viewWindow): drawing every row held took a phone 15 s to
 * show the first of 10,000. A view the server answers in windows (tables
 * T5c) gives its count: the places of rows not read yet are held, drawn as
 * placeholders, and the rows added here (its last `tail`) are kept at its end.
 */
export function TableRowList({
  fields,
  rows,
  count,
  tail = 0,
  onOpen,
  onAdd,
  empty,
  onNearEnd,
  scrollTo,
  edits,
  grouping,
  hues,
  found,
}: {
  fields: TableField[]
  /** The view's rows read, from its first, then its last `tail` rows, added here. */
  rows: TableRow[]
  /** How many rows the view has, read or not: rows' own length unless it reads in windows. */
  count?: number
  tail?: number
  onOpen: (rowId: string) => void
  onAdd?: () => void
  empty?: React.ReactNode
  /** The list nears the last row read, or passes it: the place of the last row in sight. */
  onNearEnd?: (last: number) => void
  /** A row to bring into view (one just added), with the window's own scroll. */
  scrollTo?: string | null
  /** What each row shows over its copy until it's read again (useCellCommit). */
  edits: ReadonlyMap<string, RowEdits>
  /** A grouped view (tables V2b): a header above each group, and the rows of its open groups; until its counts come, rows on their way. */
  grouping?: Grouping | null
  /** Each row's colour, as the view colours rows (V3). */
  hues?: ReadonlyMap<string, CampHue> | null
  /**
   * A find over the view (G2b-2): the rows with matches tinted and their
   * matched values shown, the row it's at marked as the grid marks its cell
   * and brought into sight at every step.
   */
  found?: FindMarks | null
}) {
  const counts = grouping?.counts
  const body = React.useMemo(() => (grouping ? (counts ? groupedBody(rows, grouping, counts, tail) : { rows: [], layout: null }) : null), [grouping, counts, rows, tail])
  const length = body ? (body.layout?.length ?? Math.min(count ?? rows.length, FIRST_SCREEN_ROWS)) : (count ?? rows.length)
  const layout = body?.layout
  const groups = React.useMemo(
    () => layout && grouping && counts && { layout, levels: grouping.levels, all: fields, onToggle: (path: string[]) => grouping.onShut(toggleShut(grouping.shut, path, counts)), partial: grouping.partial },
    [layout, grouping, counts, fields],
  )
  return (
    <div data-table-list="" aria-busy={(!!body && !layout) || undefined}>
      {length === 0 ? empty : null}
      <ListBody fields={fields} rows={body?.rows ?? rows} count={length} tail={tail} onOpen={onOpen} onNearEnd={onNearEnd} scrollTo={scrollTo} edits={edits} groups={groups || null} hues={hues} found={found} />
      {onAdd ? (
        <button type="button" onClick={onAdd} className="flex h-11 w-full items-center gap-2 text-ui text-ink-3 active:bg-press">
          <Plus className="size-4" aria-hidden="true" /> New row
        </button>
      ) : null}
    </div>
  )
}

/** What every row of the list draws: its title's field, the fields under it, and the columns whose chips are tinted. */
interface ListLook {
  primary: TableField | undefined
  rest: TableField[]
  tinted: Set<string>
  /** The view colours its rows (V3): every row keeps room for the stripe, coloured or not, so their text lines up. */
  striped: boolean
}

/**
 * The list's rows: the window and the rows in it. A scroll renders this and
 * the rows entering, never the list's add button or empty state.
 */
const ListBody = React.memo(function ListBody({
  fields,
  rows,
  count,
  tail,
  onOpen,
  onNearEnd,
  scrollTo,
  edits,
  groups,
  hues,
  found,
}: {
  fields: TableField[]
  rows: TableRow[]
  count: number
  tail: number
  onOpen: (rowId: string) => void
  onNearEnd?: (last: number) => void
  scrollTo?: string | null
  edits: ReadonlyMap<string, RowEdits>
  groups: { layout: GroupLayout; levels: Grouping["levels"]; all: TableField[]; onToggle: (path: string[]) => void; partial?: boolean } | null
  hues?: ReadonlyMap<string, CampHue> | null
  found?: FindMarks | null
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const layout = groups?.layout
  const sizeOf = React.useMemo(() => layout && ((p: number) => (layout.header(p) ? headerPx(true) : LIST_ROW_PX)), [layout])
  const { virtualizer, items, padTop, padBottom, rowAt } = useViewWindow({
    given: rows.length,
    count,
    tail,
    rowPx: LIST_ROW_PX,
    sizeOf,
    readTo: layout?.readTo,
    scrollRef,
    overscan: 8,
    initialRect: { width: 390, height: 720 },
    scrollPaddingStart: ROW_CLEAR_PX,
    scrollPaddingEnd: ROW_CLEAR_PX,
    firstScreen: FIRST_SCREEN_ROWS,
    nearEnd: NEAR_END_ROWS,
    onNearEnd,
  })
  // As the grid orders and tints them (fieldOrder, optionChip tintedFields).
  const striped = !!hues
  const look = React.useMemo<ListLook>(() => {
    const [primary, ...rest] = fieldOrder(fields)
    return { primary, rest, tinted: tintedFields(fields), striped }
  }, [fields, striped])
  const keep = useKeptRows(sameListRow)
  // Once, when the row is among those given: a later refresh never pulls the
  // list back to it. A row added here is at the view's end, its last place.
  const scrolledTo = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!scrollTo || scrolledTo.current === scrollTo) return
    const index = rows.findIndex((r) => r.id === scrollTo)
    if (index < 0) return
    scrolledTo.current = scrollTo
    virtualizer.scrollToIndex(layout ? layout.placeOf(index) : placeOfRow(index, rows.length, count, tail), { align: "auto" })
  }, [scrollTo, rows, count, tail, virtualizer, layout])
  // A find's marks (G2b-2): each row's matched fields, and the match it's at. At every step that row comes into
  // sight, as the grid brings its cell, by its place in the view while it isn't read yet; once per match, so rows
  // arriving never pull the list back to it.
  const byRow = React.useMemo(() => matchesByRow(found?.matches), [found?.matches])
  const current = found?.current
  const shownMatch = React.useRef<TransformMatch | null>(null)
  const pageTo = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!current || shownMatch.current === current) return
    shownMatch.current = current
    const index = rows.findIndex((r) => r.id === current.row)
    const place = index >= 0 ? (layout ? layout.placeOf(index) : placeOfRow(index, rows.length, count, tail)) : layout ? -1 : current.at
    if (place < 0) return
    virtualizer.scrollToIndex(place, { align: "auto" })
    pageTo.current = current.row
  }, [current, rows, count, tail, virtualizer, layout])
  // The list's box can reach past the screen's edge (the bar and its Replace row sit above it on a phone): once the
  // row is drawn, the page brings it in too, as little as it must, once per match: 12 px clear of the edge (its
  // scroll margin, table.css) and under the bar pinned over the page, never behind it (usePinnedPad).
  React.useEffect(() => {
    const id = pageTo.current
    const li = id ? [...(scrollRef.current?.querySelectorAll<HTMLElement>("li[data-row]") ?? [])].find((x) => x.dataset.row === id) : null
    if (!li) return
    pageTo.current = null
    li.scrollIntoView?.({ block: "nearest" })
  })
  return (
    <div ref={scrollRef} className={TABLE_VIEW_BODY} data-list-scroll="">
      <ul className="v3-grid-list" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        {items.map(({ index }) => {
          const spot = layout?.at(index)
          if (spot && "group" in spot)
            return groups && <GroupHeaderItem key={`g${JSON.stringify(spot.group.key)}`} {...spot} place={index} setSize={count} height={headerPx(true)} levels={groups.levels} all={groups.all} onToggle={groups.onToggle} partial={groups.partial} />
          const row = rows[spot ? spot.row : rowAt(index)]
          if (!row) return listPlaceholder(index)
          // The same element as last time while sameListRow holds: React skips it.
          return keep(row.id, { row, place: index, count, look, onOpen, edits: edits.get(row.id), hue: hues?.get(row.id), found: byRow.get(row.id), foundAt: current?.row === row.id ? (current.field ?? "") : undefined }, (p) => <ListRow key={row.id} {...p} />)
        })}
      </ul>
    </div>
  )
})

interface ListRowProps {
  row: TableRow
  /** Its place in the view, which the list's reader is told. */
  place: number
  /** How many rows the view has. */
  count: number
  look: ListLook
  onOpen: (rowId: string) => void
  /** The edits its copy doesn't show yet: it shows them, as saving while one is on its way. */
  edits?: RowEdits
  /** Its colour, as the view colours rows (V3): a stripe at its edge. */
  hue?: CampHue
  /** A find's matched fields in this row (G2b-2): the row is tinted, and they lead its values, by name and value. */
  found?: string[]
  /** The field of the find's match when it's in this row ("" for a match without a field): marked as the grid marks its cell. */
  foundAt?: string
}

/** Whether a row drawn with a draws as it would with b (ListBody keeps its element). */
const sameListRow = (a: ListRowProps, b: ListRowProps) =>
  a.row.id === b.row.id && a.row.values === b.row.values && a.place === b.place && a.count === b.count && a.look === b.look && a.onOpen === b.onOpen && a.edits === b.edits && a.hue === b.hue && a.found === b.found && a.foundAt === b.foundAt

/** One row of the list: one render as it enters the window, its chips and icon drawn as plain markup. */
/** A matched value's mark: "at" for the find's match, "" for another. */
const foundMark = (field: string, at: string | undefined): "at" | "" => (field === at ? "at" : "")

/**
 * The values under a row's title: the first META_FIELDS its summary names; with
 * a find's matches in the row (G2b-2), those fields first, the one it's at
 * leading, so a match in a field the summary leaves out shows by name and
 * value; then the summary's own, to the same count.
 */
function rowMeta(look: ListLook, values: ReturnType<typeof shownValues>, found: string[] | undefined, foundAt: string | undefined) {
  const marked = found?.length ? look.rest.filter((f) => found.includes(f.id)) : []
  const lead = marked.findIndex((f) => f.id === foundAt)
  if (lead > 0) marked.unshift(...marked.splice(lead, 1))
  const meta: { f: TableField; node: React.ReactNode; found?: "at" | "" }[] = []
  for (const f of marked.length ? [...marked, ...look.rest.filter((f) => !marked.includes(f))] : look.rest) {
    if (meta.length === META_FIELDS) break
    const node = brief(f, values[f.id], look.tinted.has(f.id))
    if (node !== null) meta.push({ f, node, found: marked.includes(f) ? foundMark(f.id, foundAt) : undefined })
  }
  return meta
}

function ListRow({ row, place, count, look, onOpen, edits, hue, found, foundAt }: ListRowProps) {
  const values = shownValues(row, edits)
  const saving = !!edits && Object.keys(edits.saving).length > 0
  const { primary, striped } = look
  const meta = rowMeta(look, values, found, foundAt)
  const titleFound = primary && found?.includes(primary.id) ? foundMark(primary.id, foundAt) : undefined
  return (
    <li data-row={row.id} data-found={foundAt !== undefined ? "at" : found ? "" : undefined} aria-setsize={count} aria-posinset={place + 1} aria-busy={saving || undefined} data-saving={saving || undefined} className={cn(hue && "relative")}>
      {hue ? <span aria-hidden="true" data-row-hue={hue} className={cn("absolute inset-y-2 left-0 w-[3px] rounded-sm bg-hue", HUE_CLASS[hue])} /> : null}
      <button type="button" onClick={() => onOpen(row.id)} className={cn("flex h-[60px] w-full items-center gap-3 py-2 text-left active:bg-press", striped && "pl-3")}>
        <span className="min-w-0 flex-1">
          <span data-found-value={titleFound} className="block truncate text-ui font-medium text-ink">{primary ? String(values[primary.id] ?? "") || "Untitled" : "Untitled"}</span>
          {meta.length ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-meta text-ink-3">
              {meta.map((m, i) => (
                <React.Fragment key={m.f.id}>
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {/* Each value named, as a board card names its details: "1,200 · 1 · 11 Oct" said nothing of what they were (QA PTC-46). */}
                  <span className="shrink-0 truncate" data-found-value={m.found}>
                    <span className="text-ink-3">{m.f.name} </span>
                    {m.node}
                  </span>
                </React.Fragment>
              ))}
            </span>
          ) : null}
        </span>
        {iconMarkup(ChevronRight, { className: "size-4 shrink-0 text-ink-4", "aria-hidden": true })}
      </button>
    </li>
  )
}

/**
 * A row of the view on its way from the server (a window not read yet): its
 * height held, so the scrollbar is the view's, with quiet bars where its
 * title and values will be. Plain markup: one is drawn for each place a fast
 * scroll passes.
 */
function listPlaceholder(place: number) {
  return (
    <li key={`~${place}`} aria-hidden="true" data-placeholder="" className="flex h-[60px] flex-col justify-center gap-2 py-2">
      <Skeleton className="h-2.5 w-40 max-w-[55%]" />
      <Skeleton className="h-2 w-28 max-w-[40%]" />
    </li>
  )
}
