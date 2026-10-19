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

/** Rows the bundle carries, as the API's does. */
const BUNDLE_ROWS = 500

/** The least time a test that opens a table page has (attach). */
const PAGE_TEST_BUDGET = 90_000

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
  readonly writes: { kind: "create" | "patch" | "update" | "table"; rowId?: string; body: Record<string, unknown> }[] = []
  /** Rows' pages (rows as pages), by row: none until one is made, or a test seeds one. */
  readonly pages = new Map<string, { doc: string; body: string }>()
  /** The rows whose pages were made here. */
  readonly pagesMade: string[] = []

  constructor(fields: Field[], rows: Values[]) {
    this.fields = fields
    this.rows = rows.map((values, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, position: i, values, updated_at: new Date(0).toISOString() }))
  }

  /** A row's values now, on the server. */
  valuesOf(index: number): Values {
    return this.rows[index].values
  }

  private rowJson(r: Row) {
    return { id: r.id, table_id: this.id, values: JSON.stringify(r.values), position: r.position, created_at: r.updated_at, updated_at: r.updated_at }
  }

  private table() {
    return { id: this.id, name: this.name, visibility: this.visibility, created_by: SAM.user_uuid, created_at: new Date(0).toISOString(), updated_at: new Date().toISOString() }
  }

  private bundle() {
    const rows = [...this.rows].sort((a, b) => a.position - b.position)
    return {
      table: this.table(),
      fields: this.fields.map((f, i) => ({ id: f.id, table_id: this.id, name: f.name, type: f.type, config: JSON.stringify(f.config ?? {}), position: i })),
      views: [],
      rows: rows.slice(0, BUNDLE_ROWS).map((r) => this.rowJson(r)),
      can_manage: true,
      mqtt_topic: `table/${this.id}`,
      rows_truncated: rows.length > BUNDLE_ROWS,
      row_count: rows.length,
    }
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
    if (parts[1] !== this.id) return json(404, { msg: "table not found" })
    if (parts.length === 2 && req.method() === "GET") return json(200, { data: this.bundle() })
    if (parts.length === 3 && parts[2] === "update" && req.method() === "POST") {
      this.writes.push({ kind: "table", body })
      if (typeof body.name === "string") this.name = body.name
      if (body.visibility === "private" || body.visibility === "workspace") this.visibility = body.visibility
      return json(200, { data: this.table() })
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
    if (testInfo.timeout > 0 && testInfo.timeout < PAGE_TEST_BUDGET) testInfo.setTimeout(PAGE_TEST_BUDGET)
    const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
    await stubBackend(page, testInfo, {
      "/user/profile": { msg: "ok", data: person },
      "/auth/token": { data: { token: `e2e-${person.user_name}` } },
    })
    // Registered after the stub, so it answers first for the table's calls.
    await page.route(
      (url) => url.origin !== app.origin && url.pathname.includes("/tables"),
      (route) => this.answer(route, route.request()),
    )
  }

  /** Opens the table as a person, in a browser context of their own. */
  async open(browser: Browser, testInfo: TestInfo, person: Person, options: BrowserContextOptions = {}): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 }, ...options })
    // The first-run keys tip sits over the grid's rows; it's been seen.
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    await this.attach(page, testInfo, person)
    await page.goto(`/app/tables/${this.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-table-page]")).toBeVisible({ timeout: 60_000 })
    return { page, close: () => context.close() }
  }
}
