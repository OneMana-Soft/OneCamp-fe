"use client"

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { readPages } from "@/lib/http/readPages"
import { eachRowOnce, listRows, tableBundleKey, type TableBundle, type TableRow } from "@/services/tableService"

/** Rows the bundle carries, and each page read after it. */
export const ROW_PAGE = 500
/** The most rows the page reads on its own; past it, the reader chooses "Load all". */
export const ROWS_HELD_MAX = 10_000
/** Pages asked for at once. */
const PAGES_AT_ONCE = 4
/** How long a burst of live messages settles before the table is asked for again. */
const HEARD_SETTLE_MS = 300

/** The rows read after the bundle's first page, for one table, in its order. */
interface Read {
  tableId: string
  rows: TableRow[]
  /** A page came back short: the table's end has been read. */
  ended: boolean
}

/** What a refresh asks for: the bundle, every page read after it, and the pages holding some rows. */
interface Job {
  bundle: boolean
  pages: boolean
  rows: Set<string>
}

const NO_ROWS: TableRow[] = []

const sameRow = (a: TableRow, b: TableRow) =>
  a.values === b.values && a.updated_at === b.updated_at && a.position === b.position && String(a.ai_kept ?? "") === String(b.ai_kept ?? "")

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

/**
 * A table's bundle and every row its page holds (TAB-BUG-2). The bundle
 * carries the first 500 rows; the pages after them are read from the rows
 * endpoint as the views need them: one at a time as the grid nears the end
 * of what's held (more), all of them, up to 10,000, for a board, a calendar,
 * a filter, a sort or a search (all), and past that when the reader asks
 * (all(true), "Load all"). A row added here is read with the rest (reveal),
 * within those 10,000; past them it waits for "Load all", as the rest do.
 *
 * The table is asked for again when its live topic says it changed: only the
 * page holding a row that changed, or everything held. Refreshes run one at
 * a time, in order, so an older answer never lands over a newer one.
 */
export function useTableRows(tableId: string) {
  const [read, setRead] = React.useState<Read>({ tableId, rows: NO_ROWS, ended: false })
  const [wanted, setWanted] = React.useState({ tableId, rows: ROW_PAGE })
  const [readingFor, setReadingFor] = React.useState<string | null>(null)
  const [failedFor, setFailedFor] = React.useState<string | null>(null)
  // A bundle this hook asked for is followed by its own page reads; one SWR
  // fetched by itself (the tab coming back into focus) reads them here.
  const refreshing = React.useRef(0)
  const onBundle = React.useRef<() => void>(() => {})

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
  // Offsets read so far: the bundle's page, then the pages after it.
  const readEnd = first.length + (truncated ? mine.rows.length : 0)
  const rows = React.useMemo(() => (truncated && mine.rows.length ? eachRowOnce([...first, ...mine.rows]) : first), [truncated, first, mine.rows])
  const complete = !truncated || mine.ended || (total !== null && readEnd >= total)
  // Stopped at the rows held on its own: past them only on "Load all".
  const capped = !complete && want <= ROWS_HELD_MAX && readEnd >= ROWS_HELD_MAX
  const reading = readingFor === tableId
  const failed = failedFor === tableId

  const latest = React.useRef({ tableId, mine, readEnd, total, want, mutate })
  latest.current = { tableId, mine, readEnd, total, want, mutate }

  // Back under one page, the bundle holds every row: pages read before go,
  // so they can't come back as rows if the table grows again.
  React.useEffect(() => {
    if (bundle && !truncated && mine.rows.length) setRead({ tableId, rows: NO_ROWS, ended: false })
  }, [bundle, truncated, mine.rows.length, tableId])

  // Page reads stop when the reader leaves the table (or the page): leaving
  // mid-read kept fetching up to 9,500 rows, and a late page from the table
  // left could land over the next one's.
  const reads = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => reads.current?.abort(), [tableId])

  // The pages wanted and not yet read.
  React.useEffect(() => {
    if (!bundle || !truncated || reading || failed || mine.ended) return
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
  }, [bundle, truncated, reading, failed, mine.ended, mine.rows.length, want, total, readEnd, tableId])

  const run = React.useCallback(async (job: Job) => {
    const { tableId, mine, mutate } = latest.current
    const offsets = new Set<number>()
    let bundleToo = job.bundle
    for (const id of job.rows) {
      const at = mine.rows.findIndex((r) => r.id === id)
      if (at >= 0) offsets.add(ROW_PAGE + Math.floor(at / ROW_PAGE) * ROW_PAGE)
      else bundleToo = true // in the bundle's page, or not held: the bundle says
    }
    const count = mine.rows.length
    const everyPage = job.pages && count > 0
    refreshing.current += bundleToo ? 1 : 0
    try {
      const [, all, ...some] = await Promise.all([
        bundleToo ? mutate().catch(() => undefined) : undefined,
        everyPage
          ? readPages((offset, limit) => listRows(tableId, offset, limit), { pageSize: ROW_PAGE, from: ROW_PAGE, to: ROW_PAGE + count, concurrency: PAGES_AT_ONCE }).catch(() => null)
          : null,
        ...(everyPage ? [] : [...offsets].map((offset) => listRows(tableId, offset, ROW_PAGE).catch(() => null))),
      ])
      if (all) setRead((r) => (r.tableId === tableId ? { tableId, rows: all.items, ended: all.ended } : r))
      const fresh = some.flatMap((p) => p ?? [])
      if (fresh.length) setRead((r) => (r.tableId === tableId ? { ...r, rows: putBack(r.rows, fresh) } : r))
    } finally {
      refreshing.current -= bundleToo ? 1 : 0
    }
  }, [])

  const job = React.useRef<Job | null>(null)
  const draining = React.useRef<Promise<void> | null>(null)
  const queue = React.useCallback(
    (add: (j: Job) => void): Promise<void> => {
      const j = job.current ?? (job.current = { bundle: false, pages: false, rows: new Set() })
      add(j)
      if (!draining.current) {
        draining.current = (async () => {
          try {
            while (job.current) {
              const next = job.current
              job.current = null
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
  onBundle.current = () => {
    if (!refreshing.current && latest.current.mine.rows.length) void queue((j) => (j.pages = true))
  }

  // The table's live topic, once a burst settles: a row changed (the page
  // holding it), a row was added or the table's own settings changed (the
  // bundle: a new row is the last), or anything else (everything held: rows
  // went, or a column's cells changed).
  const heardJob = React.useRef<Job>({ bundle: false, pages: false, rows: new Set() })
  const heardTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const heard = React.useCallback(
    (message: string) => {
      let data: { action?: unknown; row_id?: unknown } | undefined
      try {
        data = (JSON.parse(message) as { data?: typeof data })?.data
      } catch {
        // not one of ours: everything is asked for again
      }
      const j = heardJob.current
      if (data?.action === "updated" && typeof data.row_id === "string" && data.row_id) j.rows.add(data.row_id)
      else if (data?.action === "created" || data?.action === "table") j.bundle = true
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
    [queue],
  )
  React.useEffect(
    () => () => {
      if (heardTimer.current) clearTimeout(heardTimer.current)
    },
    [],
  )
  useMqttTopic({ topic: bundle?.mqtt_topic || "", onMessage: heard })

  const more = React.useCallback(
    (beyond = false) =>
      setWanted((w) => {
        const now = w.tableId === tableId ? w.rows : ROW_PAGE
        const end = latest.current.readEnd
        if (now > end) return w.tableId === tableId ? w : { tableId, rows: now } // still reading on
        const next = end + ROW_PAGE
        return { tableId, rows: beyond ? next : Math.min(next, Math.max(now, ROWS_HELD_MAX)) }
      }),
    [tableId],
  )
  const all = React.useCallback(
    (beyond = false) => setWanted((w) => ({ tableId, rows: Math.max(w.tableId === tableId ? w.rows : ROW_PAGE, beyond ? Infinity : ROWS_HELD_MAX) })),
    [tableId],
  )
  const retry = React.useCallback(() => setFailedFor(null), [])
  // Rows added here are the table's last: read through to them when they're
  // among the rows held, up to 10,000 (or every row, after "Load all"). Past
  // that nothing more is read: a board's new card on a 100,000-row table read
  // every row to reach it. Whether they will be held.
  const reveal = React.useCallback(
    (added: TableRow[]): boolean => {
      const { total, want } = latest.current
      const last = total === null ? null : total + added.length
      const limit = Math.max(want, ROWS_HELD_MAX)
      const held = last === null || last <= limit
      if (held) setWanted((w) => ({ tableId, rows: Math.max(w.tableId === tableId ? w.rows : ROW_PAGE, last ?? limit) }))
      for (const r of added) void refresh(r.id)
      return held
    },
    [tableId, refresh],
  )

  return { bundle, isLoading, isError, rows, total, complete, capped, reading, failed, more, all, retry, refresh, refreshTable, reveal }
}

export type TableRows = ReturnType<typeof useTableRows>
