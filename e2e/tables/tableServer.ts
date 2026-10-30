import { expect, type Browser, type BrowserContextOptions, type Page, type Request, type Route, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "../stubbedApp"

/** A second person, for a table to have two editors. */
export const PRIYA = {
  user_uuid: "8a1d4e2b-6c3f-4b7a-9e5d-1f2a3b4c5d6e",
  user_name: "priya",
  user_full_name: "Priya Shah",
  user_email_id: "priya@example.com",
  user_is_admin: false,
}

export type Person = typeof SAM
type Values = Record<string, unknown>
interface Field {
  id: string
  name: string
  type: string
  config?: Record<string, unknown>
}
interface Row {
  id: string
  position: number
  values: Values
  updated_at: string
}

/** A view's query as the page sends it (POST /tables/{id}/query; business/QuerySpec's shape). */
type Condition = { field: string; operator: string; values?: ({ text: string } | { number: number })[] }
type Group = { op: "and" | "or" | "not"; filters: (Group | Condition)[] }
export interface ViewQuery {
  spec: {
    filter?: Group
    groups?: { field: string; desc?: boolean; collapsed?: string[]; granularity?: string }[]
    sorts?: { field: string; desc?: boolean }[]
    summaries?: { field: string; fns: string[] }[]
  }
  cursor?: string
  n: number
  count?: boolean
}

/** Where the table's files are served from in a test (a test answers it on its context). */
export const FILES_HOST = "https://files.e2e.test"

/** Rows the bundle carries, as the API's does. */
const BUNDLE_ROWS = 500

/** The least time a test that opens a table page has (attach). */
const PAGE_TEST_BUDGET = 90_000

/**
 * The order a sort puts text in, numbers by their value ("9" before "10"),
 * through one collator: localeCompare with a locale makes its own for each
 * comparison, so sorting a 100,000-row view took ~4.7 s (~0.16 s this way),
 * on the thread that runs the test's own waits.
 */
const TEXT_ORDER = new Intl.Collator("en", { numeric: true })

/** A table's fields as the API lists them, each config as stored text. */
const fieldsJson = (table: string, fields: Field[]) => fields.map((f, i) => ({ id: f.id, table_id: table, name: f.name, type: f.type, config: JSON.stringify(f.config ?? {}), position: i }))

/**
 * One table on a fake server that every browser in a test shares, answering
 * as the API does: the bundle (its first 500 rows and the count), the rows
 * endpoint, row writes and the table's own settings. It keeps every write, so
 * a test can say what each person sent. No live message reaches a page: each
 * holds its copy until it asks again, as when MQTT is down.
 */
export class TableServer {
  readonly id = "6c0f5a1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b"
  name = "Deals"
  visibility: "workspace" | "private" = "workspace"
  readonly fields: Field[]
  rows: Row[]
  readonly writes: { kind: "create" | "patch" | "update" | "table" | "field" | "view" | "form"; rowId?: string; body: Record<string, unknown> }[] = []
  /** The table's own forms (B5), as GET /tables/{id}/forms lists them. */
  readonly forms: Record<string, unknown>[] = []
  /** Other tables' fields, by table id, for a link's or a rollup's settings (tables B2). */
  readonly linked = new Map<string, Field[]>()
  /** Why the preview can't read a formula, by the formula's text, as the server says it; every other formula gives a number. */
  readonly previewErrors = new Map<string, string>()
  /** Rows' pages (rows as pages), by row: none until one is made, or a test seeds one. */
  readonly pages = new Map<string, { doc: string; body: string }>()
  /** The rows whose pages were made here. */
  readonly pagesMade: string[] = []
  /** Who else is on the table, and where (tables A7): set, the bundle names a presence topic and /presence answers them. */
  here: Record<string, unknown>[] | null = null
  /**
   * The table's cell index answers its views (tables T5c): the bundle says so,
   * and /query answers a view's windows in its order, as business/RowQuery
   * does, for the filters and sorts these tests use.
   */
  answersQuery = false
  /**
   * How many counts to come answer without their sums and groups, as
   * business/RowQuery does when those run past their budget (SummaryBudget,
   * V-48): the count and the window stand.
   */
  countsLeavingOut = 0
  /**
   * Why the server won't work out a view's window or count (business/RowQuery
   * ErrTooManyToWorkOut: a formula or a rollup past what one read works out),
   * by the query: in those words it answers a 422. None by default. A
   * formula or a rollup still being filled (airtable-03b) answers its words
   * with the code "working_out" and how far the fill has got.
   */
  refuses: (q: ViewQuery) => string | { msg: string; progress: { done: number; total: number } } | null = () => null
  /** How many windows of a view's rows answer a 500 (a server fault), before the refusals; none by default. */
  windowsFailing = 0
  /** Every view query a page sent, in order. */
  readonly queries: ViewQuery[] = []
  /** The workspace's optional features, as /config/client answers them (AI's, for an AI column's fill). */
  features: Record<string, boolean> | null = null
  /**
   * A column's AI fill (TABLES-LEAD-26): fillAnswers answer its requests in
   * turn (POST .../ai-fill), aiFill is the fill as GET /ai-fills lists it and
   * a stop stops, and undos keeps each change set an undo named.
   */
  readonly fillAnswers: Record<string, unknown>[] = []
  readonly fillAsks: Record<string, unknown>[] = []
  /** Whether the person manages the table, as the bundle says. */
  canManage = true
  /**
   * The table's saved views (migration 512), as the bundle lists them for its
   * reader: one made "personal" is the reader's own (owner_id), as on the server.
   */
  savedViews: { id: string; table_id: string; name: string; type: string; config: string; position: number; owner_id?: string; locked?: boolean }[] = []
  /** Each Excel export a page asked for (POST /tables/{id}/export): its body, as sent. */
  readonly exports: Record<string, unknown>[] = []
  /** The export answers as for a table the reader can't open: not found. */
  exportRefused = false
  private reader = ""
  aiFill: { id: string; table_id: string; field_id: string; started_by?: string; change_set?: string; total: number; asked: number; filled: number; state: string } | null = null
  readonly undos: string[] = []

  constructor(fields: Field[], rows: Values[]) {
    // Its own copy: a field's change in one test isn't the next test's field.
    this.fields = fields.map((f) => ({ ...f, config: f.config ? { ...f.config } : undefined }))
    this.rows = rows.map((values, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, position: i, values, updated_at: new Date(0).toISOString() }))
  }

  /** A row's values now, on the server. */
  valuesOf(index: number): Values {
    return this.rows[index].values
  }

  /** The people a row's cells name, as the server names them for each reader (tables B1). */
  readonly people: Person[] = [SAM, PRIYA]

  /** A row's cells as a read gives them: people named, as the server names a link to people. */
  private named(values: Values): Values {
    const kinds = new Set(["people", "created_by", "modified_by"])
    const out: Values = { ...values }
    for (const f of this.fields) {
      const refs = out[f.id]
      if (!kinds.has(f.type) || !Array.isArray(refs)) continue
      out[f.id] = refs.map((r: { id: string }) => {
        const who = this.people.find((p) => p.user_uuid === r.id)
        return who ? { id: r.id, type: "user", label: who.user_full_name } : { id: r.id, type: "user" }
      })
    }
    return out
  }

  private rowJson(r: Row) {
    return { id: r.id, table_id: this.id, values: JSON.stringify(this.named(r.values)), position: r.position, created_at: r.updated_at, updated_at: r.updated_at }
  }

  private table() {
    return { id: this.id, name: this.name, visibility: this.visibility, created_by: SAM.user_uuid, created_at: new Date(0).toISOString(), updated_at: new Date().toISOString() }
  }

  private bundle() {
    const rows = [...this.rows].sort((a, b) => a.position - b.position)
    return {
      table: this.table(),
      fields: fieldsJson(this.id, this.fields),
      views: this.savedViews,
      rows: rows.slice(0, BUNDLE_ROWS).map((r) => this.rowJson(r)),
      can_manage: this.canManage,
      mqtt_topic: `table/${this.id}`,
      ...(this.here ? { presence_topic: `here/${this.id}` } : {}),
      rows_truncated: rows.length > BUNDLE_ROWS,
      row_count: rows.length,
      ...(this.answersQuery ? { row_query: { indexed: true, sorts_text: true } } : {}),
    }
  }

  /** A cell's text as a filter or a sort on the server reads it: trimmed, in lower case. */
  private textOf(r: Row, field: string): string {
    const v = r.values[field.replace(/^field:/, "")]
    return v === undefined || v === null ? "" : String(v).trim().toLowerCase()
  }

  /** Whether a row passes a filter: the operators these tests send, on text and numbers, and a people cell on me. */
  private passes(r: Row, f: Group | Condition): boolean {
    if ("op" in f) {
      if (f.op === "not") return !f.filters.every((g) => this.passes(r, g))
      return f.op === "and" ? f.filters.every((g) => this.passes(r, g)) : f.filters.some((g) => this.passes(r, g))
    }
    const have = this.textOf(r, f.field)
    const want = f.values?.[0]
    if (want && "number" in want) {
      const n = Number(r.values[f.field.replace(/^field:/, "")])
      if (!Number.isFinite(n)) return f.operator === "is_not"
      return { is: n === want.number, is_not: n !== want.number, gt: n > want.number, lt: n < want.number, gte: n >= want.number, lte: n <= want.number }[f.operator] ?? true
    }
    const w = want && "text" in want ? want.text.trim().toLowerCase() : ""
    // QuerySpec Me: whoever asks, as the API reads it for the reader.
    if (w === "@me") {
      const named = ((r.values[f.field.replace(/^field:/, "")] ?? []) as { id: string }[]).some((p) => p.id === this.reader)
      return f.operator === "is_not" ? !named : named
    }
    switch (f.operator) {
      case "contains":
        return have.includes(w)
      case "is":
        return have === w
      case "is_not":
        return have !== w
      case "empty":
        return have === ""
      case "not_empty":
        return have !== ""
    }
    return true
  }

  /** Views worked out, by spec, until the next write: a deep scroll asks for many windows of one view. */
  private readonly views = new Map<string, { rows: Row[]; at: number }>()

  /** A view's rows in its order: its filter, then its sorts (blanks last), then the table's order. */
  /** A view's summaries as business/RowQuery works out the bar's defaults: a number's sum (null of none), the rows' count and a field's filled. */
  private summed(asks: { field: string; fns: string[] }[], rows: Row[]) {
    return Object.fromEntries(
      asks.map((a) => {
        const nums = rows.map((r) => r.values[a.field.replace(/^field:/, "")]).filter((v): v is number => typeof v === "number")
        const of = (fn: string) => (fn === "sum" ? (nums.length ? nums.reduce((s, n) => s + n, 0) : null) : fn === "count" ? rows.length : fn === "filled" ? nums.length : null)
        return [a.field, Object.fromEntries(a.fns.map((fn) => [fn, of(fn)]))]
      }),
    )
  }

  private viewOf(spec: ViewQuery["spec"]): Row[] {
    const key = JSON.stringify(spec)
    const kept = this.views.get(key)
    if (kept && kept.at === this.writes.length && kept.rows.length <= this.rows.length) return kept.rows
    const rows = this.worked(spec)
    this.views.set(key, { rows, at: this.writes.length })
    return rows
  }

  /** A row's key at each group level, as business/RowQuery keys a choice or a number: its value as it is ("" for none). */
  private pathOf(r: Row, groups: NonNullable<ViewQuery["spec"]["groups"]>): string[] {
    return groups.map((g) => {
      const v = r.values[g.field.replace(/^field:/, "")]
      return v === undefined || v === null ? "" : String(v)
    })
  }

  /** A group level's order of a key: a choice's by its options' place, anything else by its text. */
  private placeOf(field: string, key: string): string | number {
    const options = this.fields.find((f) => `field:${f.id}` === field)?.config?.options as { label: string }[] | undefined
    const at = options ? options.findIndex((o) => o.label === key) : -1
    return at >= 0 ? at : key.toLowerCase()
  }

  /** A view's rows in its order: its filter, its groups (blanks last), its sorts, then the table's; a window's without the groups it collapsed. */
  private worked(spec: ViewQuery["spec"]): Row[] {
    const rows = [...this.rows].sort((a, b) => a.position - b.position).filter((r) => !spec.filter || this.passes(r, spec.filter))
    const groups = spec.groups ?? []
    const sorts = spec.sorts ?? []
    if (!sorts.length && !groups.length) return rows
    const keys = [...groups.map((g) => ({ field: g.field, desc: g.desc, group: true })), ...sorts]
    const ordered = rows
      .map((r, i) => ({ r, i, keys: keys.map((s) => ("group" in s ? this.placeOf(s.field, this.pathOf(r, [s])[0]) : this.textOf(r, s.field))) }))
      .sort((a, b) => {
        for (let k = 0; k < keys.length; k++) {
          const x = a.keys[k]
          const y = b.keys[k]
          if ((x === "") !== (y === "")) return x === "" ? 1 : -1
          const c = typeof x === "number" && typeof y === "number" ? x - y : TEXT_ORDER.compare(String(x), String(y))
          if (c !== 0) return keys[k].desc ? -c : c
        }
        return a.i - b.i
      })
      .map((x) => x.r)
    const shut = groups.flatMap((g) => g.collapsed ?? []).map((c) => JSON.parse(c) as string[])
    if (!shut.length) return ordered
    return ordered.filter((r) => {
      const path = this.pathOf(r, groups)
      return !shut.some((s) => s.every((k, i) => path[i] === k))
    })
  }

  /** Every level's groups of a view's rows, depth first, with their counts and the bar's summaries (business/RowQuery groups.go). */
  private grouped(spec: ViewQuery["spec"], rows: Row[]) {
    const groups = spec.groups ?? []
    const out: { key: string[]; count: number; rows: Row[] }[] = []
    let open: typeof out = []
    let prev: string[] = []
    rows.forEach((r, i) => {
      const path = this.pathOf(r, groups)
      let d = 0
      while (i > 0 && d < path.length && path[d] === prev[d]) d++
      open = open.slice(0, d)
      for (let l = d; l < path.length; l++) {
        const g = { key: path.slice(0, l + 1), count: 0, rows: [] as Row[] }
        out.push(g)
        open.push(g)
      }
      for (const g of open) {
        g.count++
        g.rows.push(r)
      }
      prev = path
    })
    return out.map((g) => ({ key: g.key, count: g.count, ...(spec.summaries ? { summaries: this.summed(spec.summaries, g.rows) } : {}) }))
  }

  private answer(route: Route, req: Request) {
    const origin = req.headers()["origin"] || "*"
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    }
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const url = new URL(req.url())
    const json = (status: number, body: unknown) => route.fulfill({ status, headers, json: body })
    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
    const parts = url.pathname.slice(url.pathname.indexOf("/tables")).split("/").filter(Boolean)
    // ["tables"], ["tables", id], ["tables", id, "rows"], ["tables", id, "rows", rowId, "patch"], ...
    if (parts.length === 1 && req.method() === "GET") return json(200, { data: [this.table()] })
    const theirs = this.linked.get(parts[1])
    if (theirs && parts[2] === "fields" && req.method() === "GET") return json(200, { data: fieldsJson(parts[1], theirs) })
    if (parts[1] !== this.id) return json(404, { msg: "table not found" })
    // Its fields alone, as a sheet's import into it reads them.
    if (parts.length === 3 && parts[2] === "fields" && req.method() === "GET") return json(200, { data: fieldsJson(this.id, this.fields) })
    if (parts.length === 3 && parts[2] === "ai-fills" && req.method() === "GET") return json(200, { data: this.aiFill ? [this.aiFill] : [] })
    if (parts.length === 5 && parts[2] === "fields" && parts[4] === "ai-fill" && req.method() === "POST") {
      this.fillAsks.push(body)
      const answer = this.fillAnswers.shift()
      return answer ? json(200, { data: answer }) : json(404, { msg: "not in this test" })
    }
    if (parts.length === 6 && parts[2] === "fields" && parts[4] === "ai-fill" && parts[5] === "stop" && req.method() === "POST") {
      if (this.aiFill?.state === "running") this.aiFill = { ...this.aiFill, state: "stopped" }
      return json(200, { data: this.aiFill })
    }
    // The table's own forms (B5): listed, saved (a link of its own) and deleted, as the server keeps them.
    if (parts[2] === "forms") {
      if (parts.length === 3 && req.method() === "GET") return json(200, { data: { forms: this.forms, can_edit: true } })
      if (parts.length === 3 && req.method() === "POST") {
        this.writes.push({ kind: "form", body })
        const at = this.forms.findIndex((f) => f.id === body.id)
        const saved = { ...body, id: body.id || `f0000000-0000-4000-8000-${String(this.forms.length).padStart(12, "0")}`, token: `t${String(this.forms.length).padStart(23, "0")}`, submissions: 0 }
        if (at >= 0) this.forms[at] = saved
        else this.forms.unshift(saved)
        return json(200, { data: saved })
      }
      if (parts.length === 5 && parts[4] === "delete" && req.method() === "POST") {
        this.writes.push({ kind: "form", body: { id: parts[3], action: "delete" } })
        const at = this.forms.findIndex((f) => f.id === parts[3])
        if (at >= 0) this.forms.splice(at, 1)
        return json(at >= 0 ? 200 : 404, { msg: at >= 0 ? "Deleted" : "Form not found" })
      }
    }
    // A saved view made, changed, deleted or locked, as the server keeps it.
    if (parts[2] === "views" && req.method() === "POST") {
      this.writes.push({ kind: "view", body: { ...body, view: parts[3], action: parts[4] ?? "create" } })
      const written = { name: String(body.name), type: String(body.type || "grid"), config: JSON.stringify(body.config ?? {}), position: Number(body.position) || 0 }
      if (parts.length === 3) {
        const made = { id: `5a7e0000-0000-4000-8000-${String(this.savedViews.length).padStart(12, "0")}`, table_id: this.id, ...written, locked: false, ...(body.personal ? { owner_id: this.reader } : {}) }
        this.savedViews.push(made)
        return json(201, { data: made })
      }
      const v = this.savedViews.find((x) => x.id === parts[3])
      if (!v) return json(404, { msg: "view not found" })
      if (parts[4] === "delete") this.savedViews = this.savedViews.filter((x) => x !== v)
      else if (parts[4] === "lock") v.locked = body.locked === true
      else Object.assign(v, written)
      return json(200, { msg: "ok" })
    }
    if (parts.length === 3 && parts[2] === "undo" && req.method() === "POST") {
      this.undos.push(String(body.change_set ?? ""))
      return json(200, { data: { change_set: "u0000001", reversed: body.change_set, kind: "ai", changes: this.aiFill?.filled ?? 0, skipped: 0 } })
    }
    // A field's change: kept, and its config as the server keeps it.
    if (parts.length === 5 && parts[2] === "fields" && parts[4] === "update" && req.method() === "POST") {
      this.writes.push({ kind: "field", body: { ...body, field: parts[3] } })
      const f = this.fields.find((x) => x.id === parts[3])
      if (f && typeof body.name === "string") f.name = body.name
      if (f && body.config && typeof body.config === "object") f.config = { ...(body.config as Record<string, unknown>), result: f.config?.result }
      return json(200, { msg: "ok" })
    }
    // A formula being written: what the editor previews.
    if (parts.length === 4 && parts[2] === "formula" && parts[3] === "preview") {
      const error = this.previewErrors.get(String(body.formula ?? ""))
      return json(200, { data: { result: "number", values: [], ...(error ? { error } : {}) } })
    }
    if (parts.length === 2 && req.method() === "GET") return json(200, { data: this.bundle() })
    if (parts.length === 3 && parts[2] === "update" && req.method() === "POST") {
      this.writes.push({ kind: "table", body })
      if (typeof body.name === "string") this.name = body.name
      if (body.visibility === "private" || body.visibility === "workspace") this.visibility = body.visibility
      return json(200, { data: this.table() })
    }
    if (parts.length === 3 && parts[2] === "presence" && req.method() === "POST") return json(200, { data: this.here ?? [] })
    if (parts.length === 3 && parts[2] === "export" && req.method() === "POST") {
      // A workbook as business/DataTable writes one, named as uploadsafe names it.
      this.exports.push(body)
      if (this.exportRefused) return json(404, { msg: "table not found" })
      return route.fulfill({
        status: 200,
        headers: {
          ...headers,
          "access-control-expose-headers": "Content-Disposition",
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${this.name}.xlsx"; filename*=UTF-8''${encodeURIComponent(this.name)}.xlsx`,
        },
        body: Buffer.from("PK\u0003\u0004"),
      })
    }
    if (parts.length === 3 && parts[2] === "query" && req.method() === "POST" && this.answersQuery) {
      // A window of a view's rows, keyset from a cursor (here an offset), or its count.
      const q = body as unknown as ViewQuery
      this.queries.push(q)
      if (!q.count && this.windowsFailing > 0) {
        this.windowsFailing--
        return json(500, { msg: "internal error" })
      }
      const why = this.refuses(q)
      if (typeof why === "string") return json(422, { msg: why })
      if (why) return json(422, { msg: why.msg, code: "working_out", progress: why.progress })
      const shown = this.viewOf(q.spec ?? {})
      if (q.count) {
        const whole = this.countsLeavingOut <= 0
        if (!whole) this.countsLeavingOut--
        return json(200, {
          data: {
            rows: [],
            total: shown.length,
            ...(q.spec?.summaries && whole ? { summaries: this.summed(q.spec.summaries, shown) } : {}),
            ...(q.spec?.groups && whole ? { groups: this.grouped(q.spec, shown) } : {}),
          },
        })
      }
      const at = Number(q.cursor || 0)
      const n = Math.min(q.n || 500, 500)
      const next = at + n < shown.length ? { next: String(at + n) } : {}
      return json(200, { data: { rows: shown.slice(at, at + n).map((r) => this.rowJson(r)), ...next } })
    }
    if (parts.length === 3 && parts[2] === "rows" && req.method() === "GET" && url.searchParams.has("ids")) {
      // Rows by id (tables A7), in the order asked, without rows gone since.
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean)
      return json(200, { data: ids.flatMap((id) => this.rows.filter((r) => r.id === id)).map((r) => this.rowJson(r)) })
    }
    if (parts.length === 3 && parts[2] === "rows" && req.method() === "GET") {
      const offset = Number(url.searchParams.get("offset") || 0)
      const limit = Math.min(Number(url.searchParams.get("limit") || 500), 1000)
      const rows = [...this.rows].sort((a, b) => a.position - b.position).slice(offset, offset + limit)
      return json(200, { data: rows.map((r) => this.rowJson(r)) })
    }
    if (parts.length === 3 && parts[2] === "rows" && req.method() === "POST") {
      this.writes.push({ kind: "create", body })
      const at = this.rows.length ? Math.max(...this.rows.map((r) => r.position)) + 1 : 0
      const r: Row = { id: `00000000-0000-4000-9000-${String(this.rows.length).padStart(12, "0")}`, position: typeof body.position === "number" ? body.position : at, values: (body.values as Values) ?? {}, updated_at: new Date().toISOString() }
      this.rows.push(r)
      return json(201, { data: this.rowJson(r) })
    }
    if (parts.length === 4 && parts[2] === "files" && req.method() === "GET") {
      // A file's address, as the API answers whoever may read the table: a
      // place on a file host the test answers (filesHost).
      return json(200, { msg: "Got the url!", url: `${FILES_HOST}/${parts[3]}` })
    }
    if (parts.length === 5 && parts[2] === "rows" && parts[4] === "page") {
      // A row's page (GET reads it with the row, POST makes it once).
      const r = this.rows.find((x) => x.id === parts[3])
      if (!r) return json(404, { msg: "row not found" })
      let page = this.pages.get(r.id)
      if (req.method() === "POST") {
        const made = !page
        if (!page) {
          page = { doc: `d0c00000-0000-4000-8000-${String(this.pages.size + 1).padStart(12, "0")}`, body: "" }
          this.pages.set(r.id, page)
          this.pagesMade.push(r.id)
        }
        return json(200, { data: { doc_uuid: page.doc, made } })
      }
      return json(200, { data: page ? { doc_uuid: page.doc, body: page.body, level: "edit" } : { level: "edit" } })
    }
    if (parts.length === 5 && parts[2] === "rows" && req.method() === "POST") {
      const r = this.rows.find((x) => x.id === parts[3])
      if (!r) return json(404, { msg: "row not found" })
      const values = (body.values as Values) ?? {}
      if (parts[4] === "patch") {
        this.writes.push({ kind: "patch", rowId: r.id, body })
        r.values = { ...r.values, ...values }
      } else if (parts[4] === "update") {
        this.writes.push({ kind: "update", rowId: r.id, body })
        r.values = values
      } else return json(404, { msg: "not in this test" })
      r.updated_at = new Date().toISOString()
      return json(200, { data: this.rowJson(r) })
    }
    return json(404, { msg: "not in this test" })
  }

  /**
   * Answers a page's calls as a person, with this table's calls answered here.
   * A test that attaches a page has 90 s at least, not Playwright's default 30:
   * open allows a page 120 s to load and 60 s to show its table, and a machine
   * running gates side by side can take most of that (two people's pages and
   * their reloads ran past 30 s at a load average near 50).
   */
  async attach(page: Page, testInfo: TestInfo, person: Person) {
    this.reader = person.user_uuid
    if (testInfo.timeout > 0 && testInfo.timeout < PAGE_TEST_BUDGET) testInfo.setTimeout(PAGE_TEST_BUDGET)
    const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
    await stubBackend(page, testInfo, {
      "/user/profile": { msg: "ok", data: person },
      "/auth/token": { data: { token: `e2e-${person.user_name}` } },
      // The workspace's members: a people field's picker lists them.
      "/user/allUsers": { msg: "ok", users: this.people },
      ...(this.features ? { "/config/client": { msg: "ok", data: { features: this.features } } } : {}),
    })
    // Registered after the stub, so it answers first for the table's calls.
    await page.route(
      (url) => url.origin !== app.origin && url.pathname.includes("/tables"),
      (route) => this.answer(route, route.request()),
    )
  }

  /** Opens the table as a person, in a browser context of their own; on one of its saved views, given its id. */
  async open(browser: Browser, testInfo: TestInfo, person: Person, options: BrowserContextOptions = {}, view?: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 }, ...options })
    // The first-run keys tip sits over the grid's rows; it's been seen.
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    await this.attach(page, testInfo, person)
    await page.goto(`/app/tables/${this.id}${view ? `?v=${view}` : ""}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-table-page]")).toBeVisible({ timeout: 60_000 })
    return { page, close: () => context.close() }
  }
}
