"use client"

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { commentsMessageRow, rowCommentsChanged } from "@/lib/tables/rowComments"
import { aiFillHeard, aiFillMessage } from "@/lib/tables/aiFills"
import { readPages } from "@/lib/http/readPages"
import { rulesToSpec, summariesToSpec, type RowSpec } from "@/lib/tables/query"
import type { ViewRules } from "@/lib/tables/viewRules"
import type { SummaryFn } from "@/lib/tables/display"
import type { GroupCount, QuerySummaries, QuerySummaryRequest } from "@/lib/querySpec/types"
import { refusalReason } from "@/lib/utils/apiError"
import { unprocessableReason, workingOutOf, type WorkingOut } from "@/lib/tables/unprocessable"
import { eachRowOnce, isComputed, listRows, queryRows, rowsByIds, tableBundleKey, type RowsWindow, type TableBundle, type TableRow } from "@/services/tableService"
import type { RefusedSums, RowsChanged } from "@/lib/tables/types"
import { windowRead, type WindowReadRules } from "@/lib/tables/windowReads"

/** Rows the bundle carries, and each page read after it. */
export const ROW_PAGE = 500
/** The most rows the page reads on its own; past it, the reader chooses "Load all". */
export const ROWS_HELD_MAX = 10_000
/** Rows a window of a view asks the server for: the most it answers (business/QuerySpec MaxPage). */
export const WINDOW_ROWS = 500
/** Rows read past the last one in sight, so a scroll seldom meets a placeholder. */
const READ_AHEAD = 250
/** Pages asked for at once. */
const PAGES_AT_ONCE = 4
/** How long a burst of live messages settles before the table is asked for again. */
const HEARD_SETTLE_MS = 300
/** The count and sums (each a pass over the whole view) are asked again at most this often while rows change, and once after (CR-62). */
const RESUM_MS = 2000
/** A count that left out the sums and groups asked (past their budget, V-48) is asked again after each wait in turn. */
const LEFT_OUT_MS = [5000, 15_000, 45_000]
/** What a grouped view says once its last re-ask left the groups out too, its rows shown ungrouped (CR-76 MF1), before its Try again. */
const GROUPS_LEFT_OUT = "Grouped this way, the rows take too long to count right now, so they show ungrouped: filter the view to fewer rows."
/** What a view says once its last re-ask left the bar's sums out too (V-118), before its Try again: a stored column's sum is the loaded rows', a formula's or a rollup's says this, never on its way for good. */
const SUMS_LEFT_OUT = "The rows take too long to add up right now: filter the view to fewer rows."

/**
 * What a view asks of a table's rows: its rules, and whether it may read
 * them in windows from the server (the grid and the phone's list, without a
 * search), which it does when the table is past the bundle's page and the
 * server answers every rule (lib/tables/query rulesToSpec).
 */
export interface RowView {
  rules: ViewRules
  windows: boolean
  /** A summary bar's choices and hidden fields: a view read in windows asks the server for them beside its count. */
  summary?: Record<string, SummaryFn>
  hidden?: readonly string[]
  /** The groups this reader collapsed, each a key a level down to it: windows leave their rows out. */
  shut?: readonly string[][]
  /** Its colours: a scale's field's least and most are asked beside the count. */
  colors?: unknown
}

/** The rows read after the bundle's first page, for one table, in its order. */
interface Read {
  tableId: string
  rows: TableRow[]
  /** A page came back short: the table's end has been read. */
  ended: boolean
}

/** A view's windows (tables T5c): the rows it holds, one run of its places read in its order. */
interface Windows {
  tableId: string
  /** The spec's key: another spec's windows are another view's. */
  key: string
  rows: TableRow[]
  /** The run's first place: 0, or where the view jumped (lib/tables/windowReads). */
  from: number
  /** The cursor after the run: "" before the first read, null at the view's end. */
  next: string | null
  /** How many rows the view shows, once the server has counted them. */
  total: number | null
  /** The count stopped at the server's cap (business/RowQuery CountCap): the view has at least total rows. */
  capped: boolean
  /** Bumped when the windows are read again from the first: a window asked for before lands nowhere. */
  round: number
  /** The bar's, over every row the view keeps; asked, the requests they answer. */
  summaries: QuerySummaries | null
  asked: string
  /** Every group's count, or the server's words why it won't count them; the groups collapsed as the rows were read. */
  groups: GroupCount[] | null
  refused: string | null
  shut: readonly string[][]
  /** Counts in a row that left out the sums and groups asked (business/RowQuery SummaryBudget): each asked again (LEFT_OUT_MS). */
  leftOut: number
  /** A formula's or a rollup's sums the server refused (RefusedSums), or null. */
  refusedSums: RefusedSums | null
  /** The server refused a window (a 422, refused says its words): no more are read until the view's rules change. */
  stopped: boolean
  /** The server is still filling a formula or a rollup the first window reads (airtable-03b): how far, until it's read again (WORKING_AGAIN_MS). */
  working: WorkingOut | null
}

/** What a refresh asks for: the bundle, every page read after it, and the pages holding some rows. */
interface Job {
  bundle: boolean
  pages: boolean
  rows: Set<string>
  /** The windows again, a group collapsed or opened: the count stands. */
  shut?: boolean
  /** The count and sums again, after a wait. */
  sums?: boolean
}

const NO_ROWS: TableRow[] = []
/** How long a view whose formula is still being filled first waits to read again (airtable-03b); each wait after is twice the last (CR-95 M2). */
export const WORKING_AGAIN_MS = 2_000
/** The longest a view still being filled waits to read again: a fill that runs long is asked about twice a minute. */
export const WORKING_MOST_MS = 30_000
const NO_SHUT: string[][] = []
const noWindows = (tableId: string, key: string): Windows => ({ tableId, key, rows: NO_ROWS, from: 0, next: "", total: null, capped: false, round: 0, summaries: null, asked: "", groups: null, refused: null, shut: NO_SHUT, leftOut: 0, refusedSums: null, stopped: false, working: null })

/** A grouped view never jumps: its groups are counted from the first row. */
const readRulesOf = (v: { isCounted: boolean; count: number; tail: readonly TableRow[]; grouped: boolean }, jumps: boolean): WindowReadRules => ({
  end: v.isCounted ? v.count - v.tail.length : Infinity,
  around: READ_AHEAD,
  window: WINDOW_ROWS,
  jumps: jumps && !v.grouped,
})

/** A count's spec: the view's, with the bar's summaries (a window's never has them). */
const counting = (spec: RowSpec, asks: QuerySummaryRequest[]): RowSpec => (asks.length ? { ...spec, summaries: asks } : spec)

/** A count's answer, the spec it answered (the one asked, less the sums refused), and the sums refused. */
interface Counted {
  c: RowsWindow
  spec: RowSpec
  refusedSums: RefusedSums | null
}

/**
 * A count, with the bar's sums. A formula's or a rollup's go with the rest
 * (airtable-03): the server works them out over every row the reader may see,
 * from the Computed Store or the reader's own read. Refused (a 422 in its
 * words: one the store doesn't keep for this reader, past what one read works
 * out), it counts again without them, so the count, the other sums and the
 * groups still answer, and only those columns say why.
 */
async function countOf(tableId: string, spec: RowSpec, computed: ReadonlySet<string>, signal?: AbortSignal): Promise<Counted> {
  try {
    return { c: await queryRows(tableId, { spec, n: 1, count: true }, signal), spec, refusedSums: null }
  } catch (e) {
    const theirs = spec.summaries?.filter((s) => computed.has(s.field)) ?? []
    const why = unprocessableReason(e)
    if (!why || theirs.length === 0) throw e
    const again: RowSpec = { ...spec, summaries: spec.summaries?.filter((s) => !computed.has(s.field)) }
    if (!again.summaries?.length) delete again.summaries
    return { c: await queryRows(tableId, { spec: again, n: 1, count: true }, signal), spec: again, refusedSums: { why, fields: theirs.map((s) => s.field) } }
  }
}

/**
 * A count's sums and groups, as spec asked them: one that left them out keeps
 * those shown, and counts it (a view of no rows has no groups). Past the last
 * re-ask, groups still left out are refused, so the rows show ungrouped with
 * the reason, never on their way for good; a count that has them drops it.
 */
function withSums(cur: Windows, c: RowsWindow, spec: RowSpec, asked: string, refusedSums: RefusedSums | null = null): Windows {
  const groupsOut = !!spec.groups && !c.groups && c.total !== 0
  // Every sum asked was a formula's, and refused: none is the answer, not one on its way.
  const none = refusedSums && !spec.summaries ? {} : null
  // A window refused keeps its words: a count isn't the windows.
  if (!groupsOut && (!spec.summaries || c.summaries)) return { ...cur, summaries: c.summaries ?? none, asked, groups: c.groups ?? null, leftOut: 0, refused: cur.stopped ? cur.refused : null, refusedSums }
  const leftOut = cur.leftOut + 1
  return { ...cur, asked, leftOut, refused: groupsOut && leftOut > LEFT_OUT_MS.length ? GROUPS_LEFT_OUT : cur.refused, refusedSums }
}

/** A window's spec: each level leaves out its groups collapsed, the last 1,000 (the server's most). */
function withShut(spec: RowSpec, shut: string[][]): RowSpec {
  if (!spec.groups || !shut.length) return spec
  return {
    ...spec,
    groups: spec.groups.map((g, i) => {
      const collapsed = shut.filter((p) => p.length === i + 1).slice(-1000).map((p) => JSON.stringify(p))
      return collapsed.length ? { ...g, collapsed } : g
    }),
  }
}

const sameRow = (a: TableRow, b: TableRow) =>
  a.values === b.values &&
  a.updated_at === b.updated_at &&
  a.position === b.position &&
  a.position_key === b.position_key &&
  a.version === b.version &&
  String(a.ai_kept ?? "") === String(b.ai_kept ?? "")

/** Whether a change of many rows only changed rows' cells, which their pages read again alone. */
function onlyUpdated(m: Omit<Partial<RowsChanged>, "action">): boolean {
  return !m.more && !m.moved && !m.created?.length && !m.deleted?.length && !m.restored?.length && Array.isArray(m.updated) && m.updated.length > 0
}

/** Fresh copies put in place of the rows held: only rows already held change, in their places. */
export function putBack(held: TableRow[], fresh: TableRow[]): TableRow[] {
  const byId = new Map(fresh.map((r) => [r.id, r]))
  let changed = false
  const out = held.map((r) => {
    const f = byId.get(r.id)
    if (!f || sameRow(f, r)) return r
    changed = true
    return f
  })
  return changed ? out : held
}

/** Rows not held already: a window can bring back a row moved since it was read, or one added here. */
function notHeld(rows: TableRow[], held: TableRow[][]): TableRow[] {
  const ids = new Set(held.flatMap((rs) => rs.map((r) => r.id)))
  const out = rows.filter((r) => !ids.has(r.id))
  return out.length === rows.length ? rows : out
}

/**
 * A view's run of windows read again from its place, as far as upTo rows: a
 * row was made, deleted or moved, so the windows read before may no longer meet.
 */
async function readWindowsAgain(
  tableId: string,
  spec: RowSpec,
  from: number,
  upTo: number,
  count: RowSpec | null,
  computed: ReadonlySet<string>,
): Promise<{ rows: TableRow[]; next: string | null; counted: Counted | null }> {
  // A count that fails keeps the one shown until the next refresh counts.
  const counted = count && countOf(tableId, count, computed).catch(() => null)
  const rows: TableRow[] = []
  let next: string | null = ""
  while (next !== null && rows.length < upTo) {
    const w = await queryRows(tableId, { spec, ...(next ? { cursor: next } : from > 0 ? { at: from } : { cursor: undefined }), n: WINDOW_ROWS })
    rows.push(...w.rows)
    next = w.next || null
  }
  return { rows: eachRowOnce(rows), next, counted: await counted }
}

/**
 * A table's bundle and every row its page holds (TAB-BUG-2). The bundle
 * carries the first 500 rows; the pages after them are read from the rows
 * endpoint as the views need them: one at a time as the grid nears the end
 * of what's held (more), all of them, up to 10,000, for a board, a calendar,
 * a search, or a filter or a sort the server can't answer (people, links, an
 * index not whole) (all), and past that when the reader asks (all(true),
 * "Load all"). A row added here is read with the rest (reveal), within those
 * 10,000; past them it waits for "Load all", as the rest do.
 *
 * A view that reads windows (RowView, tables T5c) is answered by the server
 * instead, in its order: a window of 500 at a time around the places in
 * sight, on by cursor or straight to a far place (a jump); its count
 * beside the first. Nothing is held past what's read, and nothing is loaded
 * all at once: a formula's or a rollup's rules go there too (airtable-03),
 * never to "Load all", and a window the server refuses says why in its words
 * (refused, stopped). A row added here is kept at the end (tail) until the
 * person moves on (unpin), whatever the view's rules say.
 *
 * The table is asked for again when its live topic says it changed: only the
 * rows that changed, by id (tables A7), or everything held: a view's windows
 * are read again from the first when rows were made, deleted or moved. A row
 * saved here is put back as its save answered it (put). Refreshes run one at
 * a time, in order, so an older answer never lands over a newer one.
 */
export function useTableRows(tableId: string, view?: RowView) {
  const [read, setRead] = React.useState<Read>({ tableId, rows: NO_ROWS, ended: false })
  const [wanted, setWanted] = React.useState({ tableId, rows: ROW_PAGE })
  const [readingFor, setReadingFor] = React.useState<string | null>(null)
  const [failedFor, setFailedFor] = React.useState<string | null>(null)
  // A bundle this hook asked for is followed by its own page reads; one SWR
  // fetched by itself (the tab coming back into focus) reads them here.
  const refreshing = React.useRef(0)
  const onBundle = React.useRef<() => void>(() => {})
  const summed = React.useRef({ at: 0, later: null as ReturnType<typeof setTimeout> | null, ask: () => {} })
  // The fills heard on the table's topic so far (V-124), and by the time the
  // window read the server last answered went out: a fill heard after it
  // isn't in that answer.
  const heardNow = React.useRef(0)
  const heardAtRead = React.useRef(0)

  const { data, isLoading, isError, mutate } = useFetch<{ data: TableBundle }>(
    tableId ? tableBundleKey(tableId) : "",
    undefined,
    { onSuccess: () => onBundle.current() },
    // A deleted/inaccessible table 404s/403s; the page shows its own state
    // instead of the global error toast.
    OWN_ERRORS,
  )
  const bundle = data?.data

  const mine: Read = read.tableId === tableId ? read : { tableId, rows: NO_ROWS, ended: false }
  const want = wanted.tableId === tableId ? wanted.rows : ROW_PAGE
  const first = bundle?.rows ?? NO_ROWS
  const total = bundle ? (bundle.row_count ?? (bundle.rows_truncated ? null : first.length)) : null
  const truncated = !!bundle && (!!bundle.rows_truncated || (total !== null && total > first.length))

  // The view's windows: a table past the bundle's page whose view the server
  // answers whole.
  const fields = bundle?.fields
  const answers = bundle?.row_query
  const viewRules = view?.rules
  const viewWindows = !!view?.windows
  const spec = React.useMemo(() => (viewWindows && viewRules && fields ? rulesToSpec(viewRules, fields, answers) : null), [viewWindows, viewRules, fields, answers])
  const windowed = !!spec && truncated
  const key = windowed ? JSON.stringify(spec) : ""
  const grouped = !!spec?.groups
  const viewSummary = view?.summary
  const viewHidden = view?.hidden
  const viewColors = view?.colors
  // The summary bar's choices, and a colour scale's range whether or not the view has a bar (CR-67).
  const asks = React.useMemo(() => (fields && (viewSummary || viewColors) ? summariesToSpec(fields, viewSummary ?? null, viewHidden ?? [], viewColors) : []), [fields, viewSummary, viewHidden, viewColors])
  const askKey = JSON.stringify(asks)
  // A formula's and a rollup's, as the spec names them: their sums are refused alone (countOf).
  const computedRefs = React.useMemo(() => new Set((fields ?? []).filter(isComputed).map((f) => `field:${f.id}`)), [fields])
  const [win, setWin] = React.useState<Windows>(() => noWindows(tableId, ""))
  const myWin = windowed && win.tableId === tableId && win.key === key ? win : noWindows(tableId, key)
  // Groups not counted have no headers to open.
  const shutKey = JSON.stringify((!myWin.refused && view?.shut) || NO_SHUT)
  const shut = React.useMemo(() => JSON.parse(shutKey) as string[][], [shutKey])
  const windowSpec = React.useMemo(() => spec && withShut(spec, shut), [spec, shut])
  const [pinned, setPinned] = React.useState({ tableId, rows: NO_ROWS })
  const tail = windowed && pinned.tableId === tableId ? pinned.rows : NO_ROWS
  // A ref: scrolling renders (wake) only when the places in sight need a read.
  const sight = React.useRef({ tableId, key, first: 0, last: 0 })
  const [wake, setWake] = React.useState(0)
  // Off once a server answers a jump without its place (it reads none).
  const jumps = React.useRef(true)

  // Offsets read so far: the bundle's page, then the pages after it.
  const readEnd = first.length + (truncated ? mine.rows.length : 0)
  const paged = React.useMemo(() => (truncated && mine.rows.length ? eachRowOnce([...first, ...mine.rows]) : first), [truncated, first, mine.rows])
  // A view in the table's own order (no filter, no sort) begins with the
  // bundle's page: it is shown while the view's first window is on its way,
  // rather than placeholders over rows already here.
  const opening = windowed && !spec?.filter && !spec?.sorts && !grouped && myWin.from === 0 && myWin.next === "" && myWin.rows.length === 0
  const base = opening ? first : myWin.rows
  const shown = React.useMemo(() => (tail.length ? [...notHeld(base, [tail]), ...tail] : base), [base, tail])
  const rows = windowed ? shown : paged
  const complete = windowed ? myWin.from === 0 && myWin.next === null : !truncated || mine.ended || (total !== null && readEnd >= total)
  // Stopped at the rows held on its own: past them only on "Load all".
  const capped = !windowed && !complete && want <= ROWS_HELD_MAX && readEnd >= ROWS_HELD_MAX
  const reading = readingFor === tableId
  const failed = failedFor === tableId
  // How many rows the view has in all, read or not: the grid's length. A
  // view without a filter has every row of the table until the server counts.
  // A grouped view's count holds its collapsed rows.
  const runEnd = myWin.from + base.length
  const viewCount = myWin.next === null && !(grouped && myWin.total !== null) ? runEnd : Math.max(myWin.total ?? (spec?.filter ? 0 : (total ?? 0)), runEnd)
  const count = windowed ? viewCount + tail.length : rows.length
  // Whether count is the view's own (a filtered view's, once the server has
  // counted it or its last window has been read), and whether that count
  // stopped at the server's cap.
  const isCounted = !windowed || myWin.next === null || myWin.total !== null || !spec?.filter
  const countCapped = windowed && myWin.next !== null && myWin.capped

  const stale = JSON.stringify(myWin.shut) !== shutKey && (myWin.rows.length > 0 || myWin.next !== "")

  const latest = React.useRef({ tableId, mine, first, readEnd, total, want, mutate, windowed, spec, windowSpec, shut, key, myWin, tail, asks, askKey, computedRefs, count, isCounted, grouped, reading })
  latest.current = { tableId, mine, first, readEnd, total, want, mutate, windowed, spec, windowSpec, shut, key, myWin, tail, asks, askKey, computedRefs, count, isCounted, grouped, reading }


  // Back under one page, the bundle holds every row: pages read before go,
  // so they can't come back as rows if the table grows again.
  React.useEffect(() => {
    if (bundle && !truncated && mine.rows.length) setRead({ tableId, rows: NO_ROWS, ended: false })
  }, [bundle, truncated, mine.rows.length, tableId])

  // Page reads stop when the reader leaves the table (or the page): leaving
  // mid-read kept fetching up to 9,500 rows, and a late page from the table
  // left could land over the next one's. A view's window read stops when the
  // view changes too.
  const reads = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => reads.current?.abort(), [tableId, key])

  // The pages wanted and not yet read.
  React.useEffect(() => {
    if (windowed || !bundle || !truncated || reading || failed || mine.ended) return
    const to = Math.min(want, total ?? Infinity)
    if (readEnd >= to) return
    const at = mine.rows.length
    const ac = new AbortController()
    reads.current = ac
    setReadingFor(tableId)
    readPages((offset, limit) => listRows(tableId, offset, limit, ac.signal), { pageSize: ROW_PAGE, from: readEnd, to, concurrency: PAGES_AT_ONCE })
      .then(({ items, ended }) =>
        // Kept only where it follows on: a refresh that changed what's held
        // since means these offsets may no longer meet it.
        setRead((r) => (r.tableId !== tableId && at === 0 ? { tableId, rows: items, ended } : r.tableId === tableId && r.rows.length === at ? { tableId, rows: [...r.rows, ...items], ended } : r)),
      )
      .catch(() => {
        if (!ac.signal.aborted) setFailedFor(tableId)
      })
      .finally(() => setReadingFor((t) => (t === tableId ? null : t)))
  }, [windowed, bundle, truncated, reading, failed, mine.ended, mine.rows.length, want, total, readEnd, tableId])

  // The view's next read (lib/tables/windowReads). The count lands when it
  // lands: a window's rows never wait for it (counting a filter over every
  // row can take longer than reading a window of them).
  React.useEffect(() => {
    // Refused, or filling, a view reads no more while next is null: the
    // fill's timer reads it again with next "" (its progress kept).
    if (!windowed || !spec || !windowSpec || reading || failed || stale || (myWin.next === null && (myWin.stopped || !!myWin.working))) return
    const { from, next, round } = myWin
    const held = myWin.rows.length
    const seen = sight.current.tableId === tableId && sight.current.key === key ? sight.current : { first: 0, last: 0 }
    const step = windowRead({ from, held, next }, seen, readRulesOf(latest.current, jumps.current))
    if (!step) return
    const ac = new AbortController()
    reads.current = ac
    setReadingFor(tableId)
    // Kept only where the windows weren't read again from the first since,
    // and, for a window, where the run is still as it was asked for.
    const ours = (cur: Windows) => {
      const base = cur.tableId === tableId && cur.key === key ? cur : noWindows(tableId, key)
      return base.round === round ? base : null
    }
    const asWas = (cur: Windows) => {
      const base = ours(cur)
      return base && base.from === from && base.rows.length === held ? base : null
    }
    if (next === "") {
      const { asks, askKey, computedRefs } = latest.current
      countOf(tableId, counting(spec, asks), computedRefs, ac.signal)
        .then(({ c, spec: answered, refusedSums }) =>
          setWin((cur) => {
            const base = ours(cur)
            return base ? withSums({ ...base, total: c.total ?? null, capped: !!c.total_capped }, c, answered, askKey, refusedSums) : cur
          }),
        )
        // No count: the rules bar offers to count again, or says why groups weren't.
        .catch(
          (e) =>
            grouped &&
            setWin((cur) => {
              const base = ours(cur)
              return base ? { ...base, refused: refusalReason(e) ?? null } : cur
            }),
        )
    }
    heardAtRead.current = heardNow.current
    const at = step.read === "on" ? 0 : step.at
    const where = step.read === "on" ? { cursor: next || undefined } : at > 0 ? { at } : { cursor: undefined }
    queryRows(tableId, { spec: windowSpec, ...where, n: step.read === "back" ? step.n : WINDOW_ROWS }, ac.signal)
      .then((w) =>
        setWin((cur) => {
          const base = asWas(cur)
          if (!base) return cur
          const tail = latest.current.tail
          if (step.read === "on") return { ...base, rows: [...base.rows, ...notHeld(w.rows, [base.rows, tail])], next: w.next || null, shut, working: null }
          // A server that reads no place answers with its first rows and no
          // `at`: they go nowhere, and the view reads on in order from now.
          if ((w.at ?? 0) !== at) {
            jumps.current = false
            return { ...base }
          }
          const there = { ...base, from: at, rows: notHeld(w.rows, [tail]), next: w.next || null, working: null }
          if (step.read === "jump") return there
          // Read back: the rows before the run, unless the run holds them
          // all already (rows moved since), when it starts again there.
          const before = notHeld(w.rows, [base.rows, tail])
          return before.length ? { ...base, from: Math.max(0, from - before.length), rows: [...before, ...base.rows] } : there
        }),
      )
      .catch((e) => {
        if (ac.signal.aborted) return
        // Refused in its words (a 422: a formula or a rollup the server doesn't
        // keep, past what one read works out): the view says why and reads no
        // more, never "Couldn't load the rows" and a Try again refused again.
        // Still being filled (airtable-03b): how far, and read again a little later (the effect below).
        const working = workingOutOf(e)
        if (working) {
          return setWin((cur) => {
            const base = asWas(cur)
            return base ? { ...base, next: null, working } : cur
          })
        }
        // Any other answer ends a fill's wait (DB-42): its progress would
        // stand for good, read no more, and hide the error and its Try again.
        const why = unprocessableReason(e)
        if (!why) {
          setWin((cur) => {
            const base = ours(cur)
            return base?.working ? { ...base, working: null } : cur
          })
          return setFailedFor(tableId)
        }
        setWin((cur) => {
          const base = asWas(cur)
          return base ? { ...base, next: null, refused: why, stopped: true, working: null } : cur
        })
      })
      .finally(() => setReadingFor((t) => (t === tableId ? null : t)))
  }, [windowed, spec, windowSpec, shut, grouped, stale, key, reading, failed, myWin, wake, tableId])

  // A view whose formula or rollup the server is still filling is read again
  // from the first, every WORKING_AGAIN_MS, saying how far meanwhile, until a
  // window is answered (airtable-03b): it was refused, and stayed so once filled.
  // Each wait is twice the last, up to WORKING_MOST_MS; a hidden page doesn't
  // ask, and asks at once when it's shown again (CR-95 M2), or when the
  // table's topic says a fill ended (V-124: fillsHeard).
  const working = windowed ? myWin.working : null
  const filling = working !== null
  const [pageHidden, setPageHidden] = React.useState(false)
  React.useEffect(() => {
    if (!filling || typeof document === "undefined") return
    const seen = () => setPageHidden(document.hidden)
    seen()
    document.addEventListener("visibilitychange", seen)
    return () => document.removeEventListener("visibilitychange", seen)
  }, [filling])
  const fillAsks = React.useRef(0)
  const fillMissed = React.useRef(false)
  const [fillsHeard, setFillsHeard] = React.useState(0)
  // The bar's: the fills it has taken, and the fields of those heard since
  // ("any" when a fill's end named none).
  const sumsSeen = React.useRef(0)
  const sumsHeard = React.useRef<Set<string> | "any">(new Set())
  React.useEffect(() => {
    if (!working) {
      fillAsks.current = 0
      fillMissed.current = false
      return
    }
    // A fill heard after the read the server refused went out: that answer is
    // older than the fill's end. One heard before it is in its answer. Both
    // counts are refs: fillsHeard only wakes this, and can trail a read that
    // went out in the same flush.
    if (heardAtRead.current !== heardNow.current) fillMissed.current = true
    if (pageHidden) {
      fillMissed.current = true
      return
    }
    const wait = fillMissed.current ? 0 : Math.min(WORKING_AGAIN_MS * 2 ** fillAsks.current, WORKING_MOST_MS)
    fillMissed.current = false
    const t = setTimeout(() => {
      fillAsks.current++
      setWin((cur) => (cur.tableId === tableId && cur.key === key && cur.working ? { ...noWindows(tableId, key), round: cur.round + 1, working: cur.working } : cur))
    }, wait)
    return () => clearTimeout(t)
  }, [working, pageHidden, tableId, key, fillsHeard])

  // The bar's, asked again when the reader picks others (the windows stay),
  // a little later when a count left them out (V-48), and when a fill ends
  // and they were left out or refused (V-124): in the topic's queue, behind
  // any read already on its way.
  const counted = myWin.total !== null
  const { asked, round, leftOut } = myWin
  const countAgain = React.useCallback(
    (signal?: AbortSignal) => {
      if (!spec) return Promise.resolve()
      const count = counting(spec, asks)
      const mine = (cur: Windows) => cur.tableId === tableId && cur.key === key && cur.round === round
      return (
        countOf(tableId, count, computedRefs, signal)
          .then(({ c, spec: answered, refusedSums }) => setWin((cur) => (mine(cur) ? withSums(cur, c, answered, askKey, refusedSums) : cur)))
          // One that fails leaves the bar as it was (a new choice says it's of the rows loaded), or says why groups weren't.
          .catch((e) => {
            const why = grouped && refusalReason(e)
            if (why) setWin((cur) => (mine(cur) ? { ...cur, refused: why, leftOut: 0 } : cur))
          })
      )
    },
    [spec, asks, tableId, key, round, askKey, grouped, computedRefs],
  )
  const sumsShort = leftOut > 0 || myWin.refusedSums !== null
  React.useEffect(() => {
    if (!windowed || !counted) return
    // A fill's end is taken only when something waits on it: sums left out,
    // or refused ones of the fields it filled (any, when it named none). One
    // heard while a count is on its way waits for that count's answer.
    const fieldsHeard = sumsHeard.current
    const refused = latest.current.myWin.refusedSums
    const filled = sumsSeen.current !== fillsHeard && (leftOut > 0 || (!!refused && (fieldsHeard === "any" || refused.fields.some((f) => fieldsHeard.has(f)))))
    if (sumsShort) {
      sumsSeen.current = fillsHeard
      sumsHeard.current = new Set()
    }
    // A count asked before the fill ended (a row added meanwhile, the topic
    // going live) may still be on its way; landing after this one, it would
    // put the fill's words back for good.
    if (filled) {
      summed.current.ask()
      return
    }
    const wait = asked === askKey ? LEFT_OUT_MS[leftOut - 1] : 0
    if (wait === undefined) return
    const ac = new AbortController()
    const t = setTimeout(() => void countAgain(ac.signal), wait)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [windowed, counted, asked, leftOut, askKey, countAgain, fillsHeard, sumsShort])
  // The notice's Try again, once the last re-ask left the groups or the sums out: one count now, the rows ungrouped and the sums the loaded rows' till it has them.
  const [recounting, setRecounting] = React.useState(false)
  const recount = React.useCallback(() => {
    setRecounting(true)
    void countAgain().finally(() => setRecounting(false))
  }, [countAgain])

  // Fresh copies put where the rows are held, the bundle's page in its cache.
  const put = React.useCallback((fresh: TableRow[]) => {
    if (fresh.length === 0) return
    const { tableId, mutate } = latest.current
    void mutate(
      (d) => {
        if (!d?.data?.rows) return d
        const rows = putBack(d.data.rows, fresh)
        return rows === d.data.rows ? d : { ...d, data: { ...d.data, rows } }
      },
      { revalidate: false },
    )
    setRead((r) => (r.tableId === tableId ? { ...r, rows: putBack(r.rows, fresh) } : r))
    setWin((w) => {
      const rows = w.tableId === tableId ? putBack(w.rows, fresh) : w.rows
      return rows === w.rows ? w : { ...w, rows }
    })
    setPinned((p) => {
      const rows = p.tableId === tableId ? putBack(p.rows, fresh) : p.rows
      return rows === p.rows ? p : { ...p, rows }
    })
  }, [])

  const waiting = React.useRef<Job | null>(null)
  const run = React.useCallback(
    async (job: Job) => {
      const { tableId, mine, first, mutate, windowed, spec, windowSpec, shut, key, myWin, tail, asks, askKey, computedRefs } = latest.current
      if (windowed && spec && windowSpec) {
        // Rows held are read by id; one not held is past what's read, and
        // comes with its window. Rows made, deleted or moved, or a change too
        // big to name, read the windows again from the first, as far as they
        // were read, and put them in place at once.
        const held = new Set([...myWin.rows, ...tail].map((r) => r.id))
        const ids = [...job.rows].filter((id) => held.has(id))
        const again = job.pages || job.bundle
        // A row changed, held or not, may change what the bar sums, and the groups.
        let resum = !again && (job.rows.size > 0 || !!job.sums) && (asks.length > 0 || !!spec.groups)
        const s = summed.current
        const wait = s.at + RESUM_MS - Date.now()
        if (resum && wait > 0) {
          resum = false
          s.later ??= setTimeout(() => {
            s.later = null
            s.ask()
          }, wait)
        } else if (resum) s.at = Date.now()
        refreshing.current += job.bundle ? 1 : 0
        try {
          // A read that fails keeps what's held: the next change, or the
          // tab's next focus (the bundle), reads it again.
          const count = counting(spec, asks)
          const [, rows, fresh, sums] = await Promise.all([
            job.bundle ? mutate().catch(() => undefined) : undefined,
            again || job.shut ? readWindowsAgain(tableId, windowSpec, myWin.from, Math.max(myWin.rows.length, WINDOW_ROWS), again ? count : null, computedRefs).catch(() => null) : null,
            ids.length ? rowsByIds(tableId, ids).catch(() => null) : null,
            resum ? countOf(tableId, count, computedRefs).catch(() => null) : null,
          ])
          if (rows) {
            setWin((cur) => {
              if (cur.tableId !== tableId || cur.key !== key) return cur
              // Read again, a view the server had refused (a lock held a moment) reads on. A run
              // that jumped since keeps its rows: they were read after the change.
              const read =
                cur.from !== myWin.from
                  ? cur
                  : { ...cur, rows: notHeld(rows.rows, [latest.current.tail]), next: rows.next, round: cur.round + 1, shut, ...(cur.stopped && { refused: null, stopped: false }) }
              const c = rows.counted
              return c ? withSums({ ...read, total: c.c.total ?? cur.total, capped: !!c.c.total_capped }, c.c, c.spec, askKey, c.refusedSums) : read
            })
          }
          if (sums) {
            setWin((cur) => (cur.tableId === tableId && cur.key === key ? withSums(cur, sums.c, sums.spec, askKey, sums.refusedSums) : cur))
            // A row changed group: the windows hold it where it was, and every group after would be a row off.
            const sizes = (gs?: GroupCount[] | null) => JSON.stringify(gs?.map((g) => g.count))
            // The queue's loop runs it next.
            if (sums.c.groups && sizes(sums.c.groups) !== sizes(myWin.groups)) (waiting.current ??= { bundle: false, pages: false, rows: new Set() }).shut = true
          }
          if (fresh) put(fresh)
        } finally {
          refreshing.current -= job.bundle ? 1 : 0
        }
        return
      }
      const count = mine.rows.length
      const everyPage = job.pages && count > 0
      // Rows held are read by id (one in the bundle's page read the bundle: 534
      // ms at 100,000 rows); a row not held is new, and the bundle says so.
      const held = new Set([...first, ...mine.rows].map((r) => r.id))
      let bundleToo = job.bundle
      const ids: string[] = []
      for (const id of job.rows) {
        if (held.has(id)) ids.push(id)
        else bundleToo = true
      }
      if (everyPage && bundleToo) ids.length = 0
      refreshing.current += bundleToo ? 1 : 0
      try {
        // As above: a read that fails keeps what's held until the next.
        const [, all, fresh] = await Promise.all([
          bundleToo ? mutate().catch(() => undefined) : undefined,
          everyPage
            ? readPages((offset, limit) => listRows(tableId, offset, limit), { pageSize: ROW_PAGE, from: ROW_PAGE, to: ROW_PAGE + count, concurrency: PAGES_AT_ONCE }).catch(() => null)
            : null,
          ids.length ? rowsByIds(tableId, ids).catch(() => null) : null,
        ])
        if (all) setRead((r) => (r.tableId === tableId ? { tableId, rows: all.items, ended: all.ended } : r))
        if (fresh) put(fresh)
      } finally {
        refreshing.current -= bundleToo ? 1 : 0
      }
    },
    [put],
  )

  const draining = React.useRef<Promise<void> | null>(null)
  const queue = React.useCallback(
    (add: (j: Job) => void): Promise<void> => {
      const j = waiting.current ?? (waiting.current = { bundle: false, pages: false, rows: new Set() })
      add(j)
      if (!draining.current) {
        draining.current = (async () => {
          try {
            while (waiting.current) {
              const next = waiting.current
              waiting.current = null
              await run(next)
            }
          } finally {
            draining.current = null
          }
        })()
      }
      return draining.current
    },
    [run],
  )

  // A group collapsed or opened: the windows again, the rows read drawn till they come.
  React.useEffect(() => {
    if (stale) void queue((j) => (j.shut = true))
  }, [stale, shutKey, queue])

  const refresh = React.useCallback(
    (rowId?: string) =>
      queue((j) => {
        if (rowId) j.rows.add(rowId)
        else j.bundle = j.pages = true
      }),
    [queue],
  )
  /** The bundle alone: the table's own name and settings, its fields and its first page. */
  const refreshTable = React.useCallback(() => queue((j) => (j.bundle = true)), [queue])
  summed.current.ask = () => void queue((j) => (j.sums = true))
  React.useEffect(() => {
    const s = summed.current
    return () => clearTimeout(s.later ?? undefined)
  }, [])
  onBundle.current = () => {
    const { windowed, myWin, mine } = latest.current
    if (!refreshing.current && (windowed ? myWin.rows.length : mine.rows.length)) void queue((j) => (j.pages = true))
  }

  // The table's live topic, once a burst settles: a row changed (the page
  // holding it), a row was added or the table's own settings changed (the
  // bundle: a new row is the last), or anything else (everything held: rows
  // went, or a column's cells changed). A change of many rows at once (the
  // row ledger's "changed") names them: rows only changed are read again
  // where they're held; rows made, deleted, brought back or moved, and a
  // change too big to name, read everything held again.
  const heardJob = React.useRef<Job>({ bundle: false, pages: false, rows: new Set() })
  const heardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const heard = React.useCallback(
    (message: string) => {
      let data: ({ action?: unknown; row_id?: unknown; fill?: unknown } & Omit<Partial<RowsChanged>, "action">) | undefined
      try {
        data = (JSON.parse(message) as { data?: typeof data })?.data
      } catch {
        // not one of ours: everything is asked for again
      }
      // An AI fill moved on: its cells come as their own "updated".
      const fill = aiFillMessage(data)
      if (fill) {
        aiFillHeard(fill.table_id || tableId, fill)
        return
      }
      // A formula's or a rollup's fill ended (V-124): the waits above ask at
      // once; a read worked out the cells it read, so nothing else is read.
      if (data?.action === "computed") {
        // The fields it filled, as the bar names them ("any" when it names none).
        const ids = (data as { fields?: unknown }).fields
        const refs = Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids.map((id: string) => `field:${id}`) : null
        const seen = sumsHeard.current
        sumsHeard.current = refs && seen !== "any" ? new Set([...seen, ...refs]) : "any"
        heardNow.current += 1
        setFillsHeard(heardNow.current)
        return
      }
      const j = heardJob.current
      // A row's threads changed: its page is read again for its comment
      // count, and whatever shows its threads reads them again. A row
      // changed, or given a page (its record's doc), is read again too.
      const commented = commentsMessageRow(data)
      if (commented) {
        j.rows.add(commented)
        rowCommentsChanged(commented)
      } else if ((data?.action === "updated" || data?.action === "page") && typeof data.row_id === "string" && data.row_id) j.rows.add(data.row_id)
      // Who edits the table changed (V-170): the bundle says again whether its reader does.
      else if (data?.action === "created" || data?.action === "table" || data?.action === "editing") j.bundle = true
      else if (data?.action === "changed" && onlyUpdated(data)) for (const id of data.updated ?? []) j.rows.add(id)
      else j.bundle = j.pages = true
      if (heardTimer.current) clearTimeout(heardTimer.current)
      heardTimer.current = setTimeout(() => {
        const settled = heardJob.current
        heardJob.current = { bundle: false, pages: false, rows: new Set() }
        void queue((next) => {
          next.bundle ||= settled.bundle
          next.pages ||= settled.pages
          for (const id of settled.rows) next.rows.add(id)
        })
      }, HEARD_SETTLE_MS)
    },
    [queue, tableId],
  )
  React.useEffect(
    () => () => {
      if (heardTimer.current) clearTimeout(heardTimer.current)
    },
    [],
  )
  useMqttTopic({ topic: bundle?.mqtt_topic || "", onMessage: heard, onLive: () => void queue((j) => (j.bundle = j.pages = true)) })

  /**
   * The view reached places (the last in sight, and the first): a window view
   * reads around them (lib/tables/windowReads); the pages read one more, up to 10,000.
   */
  const more = React.useCallback(
    (last?: number, first?: number) => {
      const v = latest.current
      const { windowed, key, myWin } = v
      if (windowed) {
        // No place, or not a number (a press passes its event): the view reads on.
        const placed = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.max(n, 0) : undefined)
        const at = placed(last) ?? myWin.from + myWin.rows.length
        sight.current = { tableId, key, first: Math.min(placed(first) ?? at, at), last: at }
        // A render only when the places in sight need a read: one under way reads them as it ends.
        if (!v.reading && windowRead({ from: myWin.from, held: myWin.rows.length, next: myWin.next }, sight.current, readRulesOf(v, jumps.current))) setWake((n) => n + 1)
        return
      }
      setWanted((w) => {
        const now = w.tableId === tableId ? w.rows : ROW_PAGE
        const end = latest.current.readEnd
        if (now > end) return w.tableId === tableId ? w : { tableId, rows: now } // still reading on
        const next = end + ROW_PAGE
        return { tableId, rows: Math.min(next, Math.max(now, ROWS_HELD_MAX)) }
      })
    },
    [tableId],
  )
  const all = React.useCallback(
    // A window view holds no more than it reaches, and loads nothing at once.
    (beyond = false) => {
      if (latest.current.windowed) return
      setWanted((w) => ({ tableId, rows: Math.max(w.tableId === tableId ? w.rows : ROW_PAGE, beyond ? Infinity : ROWS_HELD_MAX) }))
    },
    [tableId],
  )
  const retry = React.useCallback(() => setFailedFor(null), [])
  // Rows added here are the table's last: read through to them when they're
  // among the rows held, up to 10,000 (or every row, after "Load all"). Past
  // that nothing more is read: a board's new card on a 100,000-row table read
  // every row to reach it. A window view keeps them at its end until the
  // person moves on. Whether they will be held.
  const reveal = React.useCallback(
    (added: TableRow[]): boolean => {
      const { total, want, windowed } = latest.current
      if (windowed) {
        setPinned((p) => {
          const kept = p.tableId === tableId ? p.rows : NO_ROWS
          return { tableId, rows: [...kept, ...notHeld(added, [kept])] }
        })
        for (const r of added) void refresh(r.id)
        return true
      }
      const last = total === null ? null : total + added.length
      const limit = Math.max(want, ROWS_HELD_MAX)
      const held = last === null || last <= limit
      if (held) setWanted((w) => ({ tableId, rows: Math.max(w.tableId === tableId ? w.rows : ROW_PAGE, last ?? limit) }))
      for (const r of added) void refresh(r.id)
      return held
    },
    [tableId, refresh],
  )
  /** The person moved on from the rows added here: they go to their places in the view, which is read again. */
  const unpin = React.useCallback(() => {
    if (!latest.current.tail.length) return
    setPinned({ tableId, rows: NO_ROWS })
    void queue((j) => (j.pages = true))
  }, [tableId, queue])

  return {
    bundle,
    isLoading,
    isError,
    rows,
    total,
    complete,
    capped,
    reading,
    failed,
    more,
    all,
    retry,
    refresh,
    refreshTable,
    reveal,
    put,
    /** Whether the view's rows are the server's windows, in its order (its rules are applied). */
    windowed,
    /** How many rows the view has, read or not: rows, and the places of those not read yet. */
    count,
    /** Whether count is the view's own, not a guess while the server counts a filtered view. */
    counted: isCounted,
    /** The server's count stopped at its cap: the view has at least count rows. */
    countCapped,
    /** The bar's, over every row the view keeps (a view read in windows). */
    summaries: windowed ? myWin.summaries : null,
    /** The server left them out (as Windows says). */
    leftOut: windowed && myWin.leftOut > 0,
    /** A grouped view read in windows: as Windows says. */
    groups: windowed ? myWin.groups : null,
    refused: windowed ? myWin.refused : null,
    /** The server is still filling a formula or a rollup the view reads: its words and how far (airtable-03b), or null. */
    workingOut: working,
    /** The server refused the view's windows: refused says its words, and none are read until its rules change. */
    stopped: windowed && myWin.stopped,
    /** A formula's or a rollup's sums the server refused, by field: those columns say why (RefusedSums). */
    refusedSums: windowed ? myWin.refusedSums : null,
    /** Why the bar's sums aren't the whole view's, once the last re-ask left them out too (V-118), or null. */
    sumsOut: windowed && asks.length > 0 && myWin.leftOut > LEFT_OUT_MS.length ? SUMS_LEFT_OUT : null,
    /** The notice's Try again, once the last re-ask left the groups (refused says so) or the sums (sumsOut) out, and whether it's counting. */
    recount: windowed && myWin.leftOut > LEFT_OUT_MS.length ? recount : null,
    recounting,
    shutRead: windowed ? myWin.shut : NO_SHUT,
    /** The first row read's place: 0, or where the view jumped. */
    from: windowed ? myWin.from : 0,
    /** How many of rows, at their end, were added here and are kept at the view's end (its last count). */
    tail: tail.length,
    unpin,
  }
}

export type TableRows = ReturnType<typeof useTableRows>
