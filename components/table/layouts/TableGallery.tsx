"use client"

import * as React from "react"
import "../table.css"
import { TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { useViewWindow } from "@/components/table/viewWindow"
import { brief } from "@/components/table/TableRowList"
import { filesOf } from "@/components/table/FilesCell"
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon"
import { tintedFields } from "@/components/table/optionChip"
import { Skeleton } from "@/components/ui/skeleton"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { useMediaFetch } from "@/hooks/useFetch"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { rowAtPlace } from "@/lib/tables/viewPlaces"
import { shownValues, type RowEdits } from "@/lib/tables/useCellCommit"
import { isImageByExtension } from "@/lib/utils/file/getAttachmentType"
import { cn } from "@/lib/utils/helpers/cn"
import type { CampHue } from "@/lib/campHue"
import { tableFilesUrl, type TableField, type TableFile, type TableRow } from "@/services/tableService"
import type { GetMediaURLRes } from "@/types/file"

// B4's gallery (airtable-05, notion-db-04): the view's rows as cards, each
// with a cover from its first attachments field holding an image, its title,
// and the fields the view shows under it. It reads the view as the grid and
// the list do: the server's windows in the view's order (tables T5c), the
// view's colours as a band on each card (V3), and its hidden fields left
// off. A card opens the row's record.
//
// Only the lines of cards in sight (and a few either side) are in the page,
// through the grid's window over lines: every card is one height, so a line
// is never measured, and a place not read yet is a quiet card of its own.

/** A card's height, its cover's and the gap between cards: every card is one, so lines are worked out, never measured. */
const CARD_PX = 252
const COVER_PX = 120
const GAP_PX = 12
/** The narrowest a card gets before a line holds one fewer. */
const MIN_CARD_PX = 232
/** The fields named under a card's title. */
const CARD_FIELDS = 4
/** Lines drawn before the frame is measured, and how near the last line read the view reads on. */
const FIRST_LINES = 4
const NEAR_END_LINES = 6

/** What every card draws: its title's field, the fields under it, its cover's, and the columns whose chips are tinted. */
interface CardLook {
  primary: TableField | undefined
  rest: TableField[]
  cover: TableField | undefined
  tinted: Set<string>
}

/** The first image among a row's files in the cover field. */
function coverOf(look: CardLook, values: Record<string, unknown>): TableFile | undefined {
  if (!look.cover) return undefined
  return filesOf(values[look.cover.id]).find((f) => (f.mime ? f.mime.startsWith("image/") : isImageByExtension(f.name)))
}

/** A card's cover: the image, fetched as the attachment viewer fetches it, or the file's glyph while it comes. */
function Cover({ tableId, file }: { tableId: string; file: TableFile | undefined }) {
  const { data } = useMediaFetch<GetMediaURLRes>(file ? `${tableFilesUrl(tableId)}/${file.id}` : "")
  return (
    <div className="relative flex shrink-0 items-center justify-center overflow-hidden bg-sunken" style={{ height: COVER_PX }} data-cover={file ? "image" : "none"}>
      {file && data?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed URL the server gives per reader; the optimiser can't fetch it
        <img src={data.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : file ? (
        <FileTypeIcon name={file.name} fileType={file.mime} size={24} />
      ) : null}
    </div>
  )
}

interface CardProps {
  tableId: string
  row: TableRow
  place: number
  count: number
  look: CardLook
  onOpen: (rowId: string) => void
  edits?: RowEdits
  hue?: CampHue
}

const sameCard = (a: CardProps, b: CardProps) =>
  a.row === b.row && a.place === b.place && a.count === b.count && a.look === b.look && a.onOpen === b.onOpen && a.edits === b.edits && a.hue === b.hue && a.tableId === b.tableId

/** One card: its colour's band, its cover, its title and the fields the view shows, each named. */
const Card = React.memo(function Card({ tableId, row, place, count, look, onOpen, edits, hue }: CardProps) {
  const values = shownValues(row, edits)
  const saving = !!edits && Object.keys(edits.saving).length > 0
  const { primary, rest, tinted } = look
  const shown: { f: TableField; node: React.ReactNode }[] = []
  for (const f of rest) {
    if (shown.length === CARD_FIELDS) break
    if (f.id === look.cover?.id) continue
    const node = brief(f, values[f.id], tinted.has(f.id))
    if (node !== null) shown.push({ f, node })
  }
  const title = primary ? String(values[primary.id] ?? "") || "Untitled" : "Untitled"
  return (
    <li aria-setsize={count} aria-posinset={place + 1} aria-busy={saving || undefined} data-saving={saving || undefined} data-card="" className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="relative flex w-full flex-col overflow-hidden rounded-xl bg-raised text-left shadow-e1 ring-1 ring-line transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={{ height: CARD_PX }}
      >
        {hue ? <span aria-hidden="true" data-row-hue={hue} className={cn("absolute inset-x-0 top-0 z-10 h-1 bg-hue", HUE_CLASS[hue])} /> : null}
        {look.cover ? <Cover tableId={tableId} file={coverOf(look, values)} /> : null}
        <span className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
          <span className="truncate text-ui font-medium text-ink">{title}</span>
          {shown.map((s) => (
            <span key={s.f.id} className="flex min-w-0 items-center gap-2 text-meta">
              <span className="w-20 shrink-0 truncate text-ink-3">{s.f.name}</span>
              <span className="min-w-0 truncate text-ink-2">{s.node}</span>
            </span>
          ))}
        </span>
      </button>
    </li>
  )
}, sameCard)

/** A place of the view on its way from the server: a quiet card, its height held. */
function cardPlaceholder(place: number) {
  return (
    <li key={`~${place}`} aria-hidden="true" data-placeholder="">
      <Skeleton className="w-full rounded-xl" style={{ height: CARD_PX }} />
    </li>
  )
}

export function TableGallery({
  tableId,
  fields,
  hidden,
  rows,
  count,
  tail = 0,
  hues,
  edits,
  onOpen,
  onNearEnd,
  empty,
}: {
  tableId: string
  fields: TableField[]
  /** The fields the view hides: no card names them. */
  hidden?: readonly string[]
  /** The view's rows read, from its first, then its last `tail` rows, added here. */
  rows: TableRow[]
  /** How many rows the view has, read or not: rows' own length unless it reads in windows. */
  count?: number
  tail?: number
  hues?: ReadonlyMap<string, CampHue> | null
  edits: ReadonlyMap<string, RowEdits>
  onOpen: (rowId: string) => void
  /** The gallery nears the last row read, or passes it: the place of the last row in sight. */
  onNearEnd?: (last: number) => void
  empty?: React.ReactNode
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // As many cards to a line as fit at their narrowest, one at the least (a phone).
  const cols = Math.max(1, Math.floor((width - 2 * GAP_PX + GAP_PX) / (MIN_CARD_PX + GAP_PX)) || 1)
  const total = count ?? rows.length
  const lines = Math.ceil(total / cols)
  const read = rows.length - tail
  const nearEnd = React.useCallback((lastLine: number) => onNearEnd?.(Math.min(total - 1, lastLine * cols + cols - 1)), [onNearEnd, total, cols])
  const { items, padTop, padBottom } = useViewWindow({
    given: Math.ceil(read / cols),
    count: lines,
    tail: 0,
    rowPx: CARD_PX + GAP_PX,
    scrollRef,
    overscan: 2,
    initialRect: { width: 1280, height: 800 },
    firstScreen: FIRST_LINES,
    nearEnd: NEAR_END_LINES,
    onNearEnd: onNearEnd ? nearEnd : undefined,
  })
  const look = React.useMemo<CardLook>(() => {
    const off = new Set(hidden ?? [])
    const [primary, ...others] = fieldOrder(fields)
    const rest = others.filter((f) => !off.has(f.id))
    return { primary, rest, cover: rest.find((f) => f.type === "attachment"), tinted: tintedFields(fields) }
  }, [fields, hidden])
  if (total === 0) return <div className={TABLE_VIEW_BODY}>{empty}</div>
  return (
    <div ref={scrollRef} className={TABLE_VIEW_BODY} data-gallery-scroll="">
      <div className="px-4 py-3 sm:px-6" style={{ paddingTop: padTop + GAP_PX, paddingBottom: padBottom + GAP_PX }}>
        {items.map(({ index: line }) => (
          <ul key={line} aria-label={line === 0 ? "Gallery" : undefined} className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP_PX, marginBottom: GAP_PX }}>
            {Array.from({ length: Math.min(cols, total - line * cols) }, (_, k) => {
              const place = line * cols + k
              const row = rows[rowAtPlace(place, rows.length, total, tail)]
              if (!row) return cardPlaceholder(place)
              return <Card key={row.id} tableId={tableId} row={row} place={place} count={total} look={look} onOpen={onOpen} edits={edits.get(row.id)} hue={hues?.get(row.id)} />
            })}
          </ul>
        ))}
      </div>
    </div>
  )
}
