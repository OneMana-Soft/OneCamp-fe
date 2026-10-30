import { expect, test, type Locator, type Page, type Request, type Route, type TestInfo } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables S1, step 7: a spreadsheet becomes tables of the person's own, or its
// rows come into a table they have. The server reads the file and previews
// what it found (business/DataTable sheetImport.go); the person chooses, and
// the import runs as one job (business/ContentIO).

const JOB = "10b00000-0000-4000-8000-000000000001"
const CSV = { name: "vendors.csv", mimeType: "text/csv", buffer: Buffer.from("Vendor,Spend,Signed\nAcme,1200,01/10/2026\nGlobex,800,12/09/2026\n") }

/**
 * The API's Content IO routes for one spreadsheet's import, as
 * business/ContentIO answers them: the file goes in (a job, queued), a read
 * of the job finds it ready with its preview, and once chosen with confirm it
 * runs, and the next read finds it done. It keeps what the page sent.
 */
class SheetImport {
  /** Each POST /doc/import's form, as sent. */
  readonly started: string[] = []
  /** Each POST /doc/import/{id}/choose's body. */
  readonly chosen: { choices: { sheets: Record<string, unknown>[] } & Record<string, unknown>; confirm: boolean }[] = []
  private status: "queued" | "ready" | "running" | "done" = "queued"

  constructor(
    private readonly preview: Record<string, unknown>,
    private readonly done: Record<string, unknown>,
  ) {}

  private job() {
    const job = { id: JOB, kind: "import", format: "csv", filename: CSV.name, status: this.status, progress: this.status === "done" ? 100 : 0, created_at: new Date(0).toISOString() }
    if (this.status === "ready") return { ...job, preview: this.preview }
    return this.status === "done" ? { ...job, ...this.done } : job
  }

  /** Registered after the page's other stubs, so it answers first for these calls. */
  async attach(page: Page, testInfo: TestInfo) {
    const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
    await page.route(
      (url) => url.origin !== app.origin && /\/(doc\/import|content-io\/)/.test(url.pathname),
      (route) => this.answer(route, route.request()),
    )
  }

  private answer(route: Route, req: Request) {
    const headers = {
      "access-control-allow-origin": req.headers()["origin"] || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    }
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const json = (body: unknown) => route.fulfill({ status: 200, headers, json: body })
    const path = new URL(req.url()).pathname
    if (path.endsWith("/content-io/capabilities")) {
      return json({ capabilities: { export: true, export_formats: ["md"], import_extensions: [".csv", ".tsv", ".xlsx", ".xlsm", ".ods"], max_import_bytes: 10 << 20, max_direct_bytes: 5 << 20 } })
    }
    if (path.endsWith("/doc/import") && req.method() === "POST") {
      this.started.push(req.postData() ?? "")
      this.status = "queued"
      return json({ job: this.job() })
    }
    if (path.endsWith(`/doc/import/${JOB}/choose`) && req.method() === "POST") {
      const body = req.postDataJSON() as SheetImport["chosen"][number]
      this.chosen.push(body)
      this.status = body.confirm ? "running" : "queued"
      return json({ job: this.job() })
    }
    if (path.endsWith(`/content-io/jobs/${JOB}`) && req.method() === "GET") {
      // Each read finds the job's next step: the file read, or the rows in.
      if (this.status === "queued") this.status = "ready"
      else if (this.status === "running") this.status = "done"
      return json({ job: this.job() })
    }
    return route.fulfill({ status: 404, headers, json: { msg: "not in this test" } })
  }
}

const sample = [
  ["Acme", "1200", "01/10/2026"],
  ["Globex", "800", "12/09/2026"],
]

for (const device of [
  { name: "at 1280, by mouse", options: {}, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())
  const pick = async (page: Page, select: Locator, option: string) => {
    await press(select)
    await press(page.getByRole("option", { name: option, exact: true }))
  }

  test(`${device.name}, a spreadsheet from the tables list becomes a table as chosen, and opens`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Supplier", type: "text" }], [{ vendor: "Acme" }, { vendor: "Globex" }])
    server.name = "Vendors"
    const imports = new SheetImport(
      {
        signs: { decimal: ".", group: "," },
        day_first: true,
        zone: "UTC",
        sheets: [
          {
            index: 0,
            name: "Vendors",
            rows: 2,
            fields: [
              { key: "c0", name: "Vendor", type: "text" },
              { key: "c1", name: "Spend", type: "number" },
              { key: "c2", name: "Signed", type: "date" },
            ],
            sample,
            notes: [{ field: "c2", code: "day_first", msg: "Read day first: 01/10/2026 is 1 October." }],
          },
        ],
      },
      { made: 2, created: [{ kind: "table", uuid: server.id, title: "Vendors" }], show: { kind: "table", uuid: server.id, title: "Vendors" } },
    )
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 900 }, ...device.options })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await imports.attach(page, testInfo)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-tables-list]")).toBeVisible({ timeout: 60_000 })

    await press(page.getByRole("button", { name: "Import a spreadsheet", exact: true }))
    const dialog = page.getByRole("dialog", { name: "Import a spreadsheet" })
    await dialog.locator("[data-import-input]").setInputFiles(CSV)
    await expect.poll(() => imports.started[0] ?? "").toContain('name="into"\r\n\r\ntable')

    // The server's preview: each column with its guessed kind, its first values and its notes.
    const columns = dialog.getByRole("list", { name: "Columns of Vendors" })
    await expect(columns.getByRole("textbox", { name: "Name of column 1" })).toHaveValue("Vendor", { timeout: 20_000 })
    await expect(columns.getByText("Acme · Globex")).toBeVisible()
    await expect(columns.getByText("Read day first: 01/10/2026 is 1 October.")).toBeVisible()
    await columns.getByRole("textbox", { name: "Name of column 1" }).fill("Supplier")
    await pick(page, columns.getByRole("combobox", { name: "Kind of Signed" }), "Text")
    // A kind the person chose has no note about the one guessed.
    await expect(columns.getByText("Read day first: 01/10/2026 is 1 October.")).toHaveCount(0)

    const go = dialog.getByRole("button", { name: "Import 2 rows", exact: true })
    // On a phone the sheet's actions stay pinned in sight below its columns.
    if (device.touch) await expect(go).toBeInViewport()
    await press(go)
    await expect.poll(() => imports.chosen.length).toBe(1)
    expect(imports.chosen[0].confirm).toBe(true)
    expect(imports.chosen[0].choices.sheets).toEqual([
      {
        index: 0,
        bring: true,
        fields: [
          { key: "c0", name: "Supplier", type: "text", leave: false },
          { key: "c1", name: "Spend", type: "number", leave: false },
          { key: "c2", name: "Signed", type: "text", leave: false },
        ],
      },
    ])

    await expect(dialog.getByText("2 rows imported into a new table.")).toBeVisible({ timeout: 20_000 })
    await press(dialog.getByRole("button", { name: "Open Vendors", exact: true }))
    await expect(page).toHaveURL(new RegExp(`/app/tables/${server.id}`))
    await expect(page.locator("[data-table-page]")).toBeVisible({ timeout: 60_000 })
    await expect(dialog).toHaveCount(0)
    await context.close()
  })

  test(`${device.name}, a sheet's rows come into the table from its More menu, matched by a column`, async ({ browser }, testInfo) => {
    const server = new TableServer(
      [
        { id: "item", name: "Item", type: "text" },
        { id: "spend", name: "Spend", type: "number" },
      ],
      [{ item: "Acme", spend: 1000 }],
    )
    server.name = "Vendors"
    const imports = new SheetImport(
      {
        signs: { decimal: ".", group: "," },
        day_first: true,
        zone: "UTC",
        sheets: [
          {
            index: 0,
            name: "Sheet1",
            into: server.id,
            into_name: "Vendors",
            rows: 2,
            fields: [
              { key: "c0", name: "Item", type: "text", field: "item" },
              { key: "c1", name: "Spend", type: "number", field: "spend" },
              { key: "c2", name: "Signed", type: "date" },
            ],
            sample,
          },
        ],
      },
      { made: 2, show: { kind: "table", uuid: server.id, title: "Vendors" } },
    )
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    await imports.attach(page, testInfo)

    await press(page.getByRole("button", { name: "More", exact: true }))
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Import rows…" }))
    const dialog = page.getByRole("dialog", { name: "Import rows into Vendors" })
    await dialog.locator("[data-import-input]").setInputFiles(CSV)
    // The file comes into this table from the start: its first sheet, here.
    await expect.poll(() => imports.started[0] ?? "").toContain(`"sheets":[{"index":0,"into":"${server.id}"}]`)

    // Each column into the field the server matched by name; a column with none is left out.
    await expect(dialog.getByRole("combobox", { name: "Field for Item" })).toHaveText("Item", { timeout: 20_000 })
    await expect(dialog.getByRole("combobox", { name: "Field for Spend" })).toHaveText("Spend")
    await expect(dialog.getByRole("combobox", { name: "Field for Signed" })).toHaveText("Leave out")
    await pick(page, dialog.getByRole("combobox", { name: "Match rows by" }), "Item")

    const go = dialog.getByRole("button", { name: "Import 2 rows", exact: true })
    if (device.touch) await expect(go).toBeInViewport()
    await press(go)
    await expect.poll(() => imports.chosen.length).toBe(1)
    expect(imports.chosen[0].confirm).toBe(true)
    expect(imports.chosen[0].choices.sheets).toEqual([
      {
        index: 0,
        bring: true,
        into: server.id,
        match_by: "c0",
        fields: [
          { key: "c0", field: "item", leave: false },
          { key: "c1", field: "spend", leave: false },
          { key: "c2", field: "", leave: true },
        ],
      },
    ])

    await expect(dialog.getByText("2 rows imported into Vendors.")).toBeVisible({ timeout: 20_000 })
    await press(dialog.getByRole("button", { name: "Done", exact: true }))
    await expect(dialog).toHaveCount(0)
    await close()
  })
}
