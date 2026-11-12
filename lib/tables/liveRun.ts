// A view's run of windows after a burst of live changes (tables L1, Live
// Rows #65; lib/tables/liveRows says what a burst asks): rows deleted
// dropped, cells put in, rows made put in their places, and the windows a
// row whose change may move it can move, read again and put back (liveRun,
// pure: it is handed what it works with). Then the burst itself (V-693): its
// one read by id (planBurst's ask) and the answers put where the rows are
// held and in the view's run. One chunk, with liveRows: lib/tables/useTableRows
// fetches it when the first message is heard, so the 50 ms a burst settles
// hides the fetch, and a table's first screen never carries it
// (app/firstLoad.test.ts TABLE_LAZY). A chunk that doesn't come is a read
// that failed: the burst is kept and read with the next message, or once the
// app is back. Every value comes from a read under the reader's own access;
// nothing is written.

import type { KeyedMutator } from "swr"
import { byPlace, cellsByIds, eachRowOnce, queryRows, rowsByIds, type TableBundle, type TableRow } from "@/services/tableService"
import { withCells, type ByIdRead } from "@/lib/tables/liveRows"
import type { RowSpec } from "@/lib/tables/query"
import type { QuerySummaryRequest } from "@/lib/querySpec/types"
import type { Counted, Windows } from "@/lib/tables/useTableRows"

/** A view's order, as applyRules viewOrder gives it: whether its filters keep a row, and two rows compared (0: a tie, which the table's order breaks). */
export interface RowOrder {
  passes(row: TableRow): boolean
  compare(a: TableRow, b: TableRow): number
}

/** Where a row goes among a run's rows (without it): its index; before the run, or after it, where neither is held; or out of the view. */
export type Place = { at: number } | "before" | "after" | "out"

/** A view's run of windows (lib/tables/useTableRows): its rows from its first place, the cursor after it (null at the view's end), and its count. */
export interface Run {
  rows: readonly TableRow[]
  from: number
  next: string | null
  total: number | null
}

/** What a burst heard, and the read by id's answer. */
export interface RunHeard {
  /** The rows read by id, by id: cells alone (narrowed) or whole rows. */
  fresh: ReadonlyMap<string, TableRow>
  narrowed: boolean
  gone: ReadonlySet<string>
  /** Rows made or brought back, in a view in the table's own order (one with rules reads its windows again). */
  made: ReadonlySet<string>
  /** Rows whose change may move them (hitsRules), but for those kept at the view's end. */
  moved: ReadonlySet<string>
}

/** The run after a burst, and the windows of it to read again: first to last (window k is the run's rows from k * size), or "run": all of it. */
export interface RunChange {
  rows: TableRow[]
  from: number
  total: number | null
  windows: { first: number; last: number } | "run" | null
  /** A row not held may have come into a filtered view, or left it: its count is asked again. */
  recount: boolean
}

/** What a run is worked out with: the table's own order (tableService byPlace), each row once (eachRowOnce), and cells put in a held row (liveRows withCells). */
export interface RunKit {
  byPlace(a: TableRow, b: TableRow): number
  eachRowOnce(rows: TableRow[]): TableRow[]
  withCells(held: TableRow, cells: TableRow): TableRow
}

/** A run's places and windows, worked out with the kit given. */
export function liveRun({ byPlace, eachRowOnce, withCells }: RunKit) {
  /**
   * A row's place among a run of a view's rows, in its order (null: the
   * table's own): the first index whose row comes after it. At the run's first
   * place, past a view's first row (from > 0), it may be anywhere before it:
   * "before"; at its end, short of the view's (next), "after".
   */
  function placeOf(rows: readonly TableRow[], row: TableRow, run: { from: number; next: string | null }, order: RowOrder | null): Place {
    if (order && !order.passes(row)) return "out"
    const cmp = (a: TableRow, b: TableRow) => (order && order.compare(a, b)) || byPlace(a, b)
    let lo = 0
    let hi = rows.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cmp(rows[mid], row) <= 0) lo = mid + 1
      else hi = mid
    }
    if (lo === 0 && run.from > 0) return "before"
    if (lo === rows.length && run.next !== null) return "after"
    return { at: lo }
  }

  /**
   * A run of a view's windows after a burst of live changes (liveRows a, b,
   * c): rows deleted dropped, cells put in, rows made put in their places,
   * and the windows a row whose change may move it can move. A row held at i
   * whose place is now j moves the rows between: the windows over [min(i, j),
   * max(i, j)]; one gone out of the view, or past the run, those from i to the
   * run's end; one before it, those from its first to i. A row not held comes
   * into a run that starts at the view's first row at j: those from j to its
   * end (into a run past the first, it may have come from before it: all of
   * them, as for a row not held deleted there).
   */
  function changeRun(run: Run, heard: RunHeard, order: RowOrder | null, filtered: boolean, size: number): RunChange {
    let { from, total } = run
    let whole = false
    let recount = false
    const held = new Set(run.rows.map((r) => r.id))
    // b. Rows deleted leave; one not held before the run moves every place in it.
    let rows = run.rows.filter((r) => !heard.gone.has(r.id))
    if (total !== null) total -= run.rows.length - rows.length
    if (from > 0 && [...heard.gone].some((id) => !held.has(id))) whole = true
    // a. Cells put in where their rows are held.
    rows = rows.map((r) => {
      const f = heard.fresh.get(r.id)
      if (!f) return r
      if (heard.narrowed) return withCells(r, f)
      return f.values === r.values && f.updated_at === r.updated_at && f.version === r.version ? r : f
    })
    // b. Rows made, in the table's order: in their place, or counted past the run.
    for (const id of heard.made) {
      const f = heard.fresh.get(id)
      if (!f || held.has(id) || order) continue
      const p = placeOf(rows, f, { from, next: run.next }, null)
      if (p === "before") from += 1
      else if (typeof p === "object") rows.splice(p.at, 0, f)
      if (total !== null) total += 1
    }
    // c. Rows whose change may move them: the places between where they were and are.
    let lo = Infinity
    let hi = -Infinity
    let n = 0
    const end = () => Math.max(rows.length - 1, 0)
    for (const id of heard.moved) {
      const f = heard.fresh.get(id)
      if (!f || !order) continue
      const i = rows.findIndex((r) => r.id === id)
      if (i < 0) {
        if (from > 0) whole = true
        else {
          const p = placeOf(rows, f, { from, next: run.next }, order)
          if (typeof p === "object") {
            lo = Math.min(lo, p.at)
            hi = Math.max(hi, end())
            n++
          }
        }
        if (filtered) recount = true
        continue
      }
      const others = rows.slice(0, i).concat(rows.slice(i + 1))
      const p = placeOf(others, rows[i], { from, next: run.next }, order)
      if (typeof p === "object" && p.at === i) continue
      const [a, b] = p === "before" ? [0, i] : p === "after" || p === "out" ? [i, end()] : [Math.min(i, p.at), Math.max(i, p.at)]
      if (p === "out" && total !== null) total -= 1
      lo = Math.min(lo, a)
      hi = Math.max(hi, b)
      n++
    }
    if (whole) return { rows, from, total, windows: "run", recount: false }
    // Several rows moving at once may each land a place off where the others were: as many places either side.
    const pad = Math.max(n - 1, 0)
    const windows = n > 0 ? { first: Math.floor(Math.max(lo - pad, 0) / size), last: Math.floor(Math.min(hi + pad, end()) / size) } : null
    return { rows, from, total, windows, recount }
  }

  /**
   * The run with its windows first to last read again (each from the run's
   * first place, size rows on): those rows put in their places. A window with
   * no next ends the view there; reading the run's last window, the run ends
   * where the last read does. Each row once.
   */
  function spliceWindows(rows: readonly TableRow[], next: string | null, first: number, last: number, read: readonly { rows: TableRow[]; next?: string }[], size: number): { rows: TableRow[]; next: string | null } {
    const mid: TableRow[] = []
    let ended = false
    let after: string | null = null
    for (const w of read) {
      mid.push(...w.rows)
      if (!w.next) {
        ended = true
        break
      }
      after = w.next
    }
    const toEnd = ended || (last + 1) * size >= rows.length
    const out = [...rows.slice(0, first * size), ...mid, ...(toEnd ? [] : rows.slice((last + 1) * size))]
    return { rows: eachRowOnce(out), next: ended ? null : toEnd ? after : next }
  }

  return { placeOf, changeRun, spliceWindows }
}

// The burst (V-693), with the run worked out with the table's own order and cells.
export { planBurst, withCells } from "@/lib/tables/liveRows"

const { changeRun, spliceWindows } = liveRun({ byPlace, eachRowOnce, withCells })

/** A burst's read by id (planBurst's ask): the cells it names, or whole rows; null when it fails. */
export const readAsked = (tableId: string, ask: ByIdRead | null) =>
  ask ? (ask.fields ? cellsByIds(tableId, ask.ids, ask.fields) : rowsByIds(tableId, ask.ids).then((rows) => ({ rows, cells: false }))).catch(() => null) : null

/** Where a burst's answers go (useTableRows): the view as last drawn, the rows it holds, and how its count is asked and put in. */
export interface PlaceHost {
  latest: { current: { tableId: string; key: string; myWin: Windows; spec: RowSpec | null; windowSpec: RowSpec | null; asks: QuerySummaryRequest[]; askKey: string; computedRefs: ReadonlySet<string>; tail: TableRow[] } }
  /** Rows read by id put where they're held: cells alone (merge), or whole rows. */
  put(fresh: TableRow[], merge?: (held: TableRow, cells: TableRow) => TableRow): void
  setPinned(f: (p: { tableId: string; rows: TableRow[] }) => { tableId: string; rows: TableRow[] }): void
  setRead(f: (r: { tableId: string; rows: TableRow[]; ended: boolean }) => { tableId: string; rows: TableRow[]; ended: boolean }): void
  setWin(f: (cur: Windows) => Windows): void
  /** The run is read again, by the queue's next. */
  again(): void
  /** A window read again failed, or its run changed meanwhile: the next message, or the app back, reads the run again. */
  missed(): void
  countOf(tableId: string, spec: RowSpec, computed: ReadonlySet<string>): Promise<Counted>
  counting(spec: RowSpec, asks: QuerySummaryRequest[]): RowSpec
  counted(w: Windows, c: Counted, asked: string): Windows
  notHeld(rows: TableRow[], held: TableRow[][]): TableRow[]
}

/** What a burst heard, and its read by id's answer. */
export interface Heard extends Omit<RunHeard, "fresh"> {
  fresh: TableRow[]
}

/** A burst put in the view's run (liveRun changeRun), and only the windows a row can move read again. */
export async function placeBurst(host: PlaceHost, heard: Heard, order: RowOrder | null, windowRows: number): Promise<void> {
  const { tableId, key, myWin, spec, windowSpec, asks, askKey, computedRefs } = host.latest.current
  if (!spec || !windowSpec) return
  host.put(heard.fresh, heard.narrowed ? withCells : undefined)
  const { gone } = heard
  if (gone.size) host.setPinned((p) => (p.tableId === tableId && p.rows.some((r) => gone.has(r.id)) ? { ...p, rows: p.rows.filter((r) => !gone.has(r.id)) } : p))
  const h = { ...heard, fresh: new Map(heard.fresh.map((r) => [r.id, r])) }
  const c = changeRun(myWin, h, order, !!spec.filter, windowRows)
  // Put in the run as it is by now: a change heard just before may not be drawn yet (myWin is the last drawn).
  host.setWin((cur) => {
    if (cur.tableId !== tableId || cur.key !== key || cur.from !== myWin.from) return cur
    const now = changeRun(cur, h, order, !!spec.filter, windowRows)
    return { ...cur, rows: now.rows, from: now.from, total: now.total }
  })
  if (c.windows === "run") return host.again()
  const w = c.windows
  if (!w && !c.recount) return
  const at = (k: number) => c.from + k * windowRows
  const [reads, counted] = await Promise.all([
    w ? Promise.all(Array.from({ length: w.last - w.first + 1 }, (_, i) => queryRows(tableId, { spec: windowSpec, ...(at(w.first + i) > 0 ? { at: at(w.first + i) } : { cursor: undefined }), n: windowRows }))).catch(() => null) : null,
    c.recount ? host.countOf(tableId, host.counting(spec, asks), computedRefs).catch(() => null) : null,
  ])
  if (w && !reads) host.missed()
  host.setWin((cur) => {
    if (cur.tableId !== tableId || cur.key !== key) return cur
    // The run changed while its windows were read: they're read again on the next message, or the topic back.
    const same = cur.from === c.from && cur.rows.length === c.rows.length
    if (w && !same) host.missed()
    const spliced = same && reads && w ? spliceWindows(cur.rows, cur.next, w.first, w.last, reads, windowRows) : null
    const read = spliced ? { ...cur, rows: host.notHeld(spliced.rows, [host.latest.current.tail]), next: spliced.next } : cur
    return counted ? host.counted(read, counted, askKey) : read
  })
}

/** A table held whole (no windows): its bundle's cache, as the run that read it found it. */
export interface Held {
  tableId: string
  mutate: KeyedMutator<{ data: TableBundle }>
}

/** Rows deleted leave a table held whole with no read: its bundle's page (its count one less each) and the pages read after it. */
export function leaveHeld(host: PlaceHost, { tableId, mutate }: Held, gone: ReadonlySet<string>): void {
  const dropped = (rows: TableRow[]) => rows.filter((r) => !gone.has(r.id))
  void mutate(
    (d) => {
      const rows = d?.data?.rows && dropped(d.data.rows)
      if (!d || !rows || rows.length === d.data.rows.length) return d
      return { ...d, data: { ...d.data, rows, ...(typeof d.data.row_count === "number" && { row_count: d.data.row_count - (d.data.rows.length - rows.length) }) } }
    },
    { revalidate: false },
  )
  host.setRead((r) => (r.tableId === tableId && r.rows.some((x) => gone.has(x.id)) ? { ...r, rows: dropped(r.rows) } : r))
}

/** A burst's read by id put in a table held whole: cells and rows where they're held, and rows made in the table's own order (byPlace), its count one more each. */
export function placeHeld(host: PlaceHost, { mutate }: Held, fresh: { rows: TableRow[]; cells: boolean }, made: ReadonlySet<string>, held: ReadonlySet<string>): void {
  host.put(fresh.rows, fresh.cells ? withCells : undefined)
  const placed = fresh.rows.filter((r) => made.has(r.id) && !held.has(r.id))
  if (placed.length)
    void mutate(
      (d) => {
        const rows = d?.data?.rows
        if (!d || !rows) return d
        const ins = placed.filter((r) => !rows.some((x) => x.id === r.id))
        return ins.length ? { ...d, data: { ...d.data, rows: [...rows, ...ins].sort(byPlace), ...(typeof d.data.row_count === "number" && { row_count: d.data.row_count + ins.length }) } } : d
      },
      { revalidate: false },
    )
}
