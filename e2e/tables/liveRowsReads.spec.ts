import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { afterOf, PRIYA, TableServer } from "./tableServer"

// Tables L1: a live view reads only what changed. Priya changes the table on her page; the server tells every page
// open on it what changed, by id (the messages below are the ones business/DataTable sends); Sam's page, a view
// read from the server in windows of 500, reads only that: a cell's edit, the cells it names; a delete, nothing; a
// new row, that row; and a change that moves a row in Sam's sorted view, the windows between its two places.
// Sam's bar sums Amount (a number's sum, as every view's bar does at first): a change to what it sums, a row
// deleted, added or moved by its Amount, asks for the bar's sums again, one count of the view (never a window).

// Two fields, which a phone draws as the grid too (cellSaving.spec.ts).
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
]
const devices: { name: string; options: BrowserContextOptions; touch: boolean }[] = [
  { name: "at 1280, by mouse", options: { viewport: { width: 1280, height: 900 } }, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]

/** A live table of n rows, Line i of amount 10 × i, whose server answers views in windows (past the bundle's 500). */
function served(n: number) {
  const server = new TableServer(
    fields,
    Array.from({ length: n }, (_, i) => ({ item: `Line ${i}`, amount: i * 10 })),
  )
  server.answersQuery = true
  server.live = true
  return server
}

/** What a page read of the table, from when it was last cleared: each read by id's &fields= ("" for none), and each view query, a count or a window (its cursor). */
function readsOf(page: Page, tableId: string) {
  const reads = { ids: [] as string[], windows: [] as string[], counts: 0, bundles: 0 }
  page.on("request", (req) => {
    const url = new URL(req.url())
    if (req.method() === "GET" && url.pathname.endsWith(`/tables/${tableId}/rows`) && url.searchParams.has("ids")) reads.ids.push(url.searchParams.get("fields") ?? "")
    else if (req.method() === "GET" && url.pathname.endsWith(`/tables/${tableId}`)) reads.bundles++
    else if (req.method() === "POST" && url.pathname.endsWith(`/tables/${tableId}/query`)) {
      const q = req.postDataJSON() as { count?: boolean; cursor?: string; at?: number }
      if (q.count) reads.counts++
      else reads.windows.push(q.at ? `@${q.at}` : afterOf(q.cursor))
    }
  })
  const total = () => reads.ids.length + reads.windows.length + reads.counts + reads.bundles
  return {
    reads,
    clear() {
      reads.ids = []
      reads.windows = []
      reads.counts = 0
      reads.bundles = 0
    },
    /** Waits until the page has read nothing for a second. */
    async quiet() {
      let last = -1
      await expect
        .poll(
          () => {
            const n = total()
            const same = n === last
            last = n
            return same
          },
          { message: "the page stops reading", intervals: [1_000], timeout: 30_000 },
        )
        .toBe(true)
    },
  }
}

for (const device of devices) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())
  /** A cell to press: under a finger, its box (a cell's text box takes no tap until it has the focus; cellSaving.spec.ts). */
  const cellAt = (page: Page, cell: string) => page.locator(device.touch ? `[data-cell-box]:has(> [data-cell="${cell}"])` : `[data-cell="${cell}"]`)
  /** Types a value into a cell on Priya's page and leaves it for the next row's, then waits for the server to have it. */
  async function edit(page: Page, server: TableServer, row: number, col: number, value: string) {
    await press(cellAt(page, `${row}:${col}`))
    await rowAt(page, row + 2).getByRole("textbox", { name: fields[col].name }).fill(value)
    await press(cellAt(page, `${row + 1}:0`))
    await expect.poll(() => String(server.valuesOf(row)[fields[col].id]), { timeout: 15_000 }).toBe(value)
  }
  /** A row of the grid by its place in the view (aria-rowindex: the header is 1, the first row 2). */
  const rowAt = (page: Page, rowIndex: number) => page.locator(`tbody tr[aria-rowindex="${rowIndex}"]`)
  const itemOf = (page: Page, rowIndex: number) => rowAt(page, rowIndex).getByRole("textbox", { name: "Item" })

  /** Priya's page, then Sam's (in a view of his own when rules are given), both listening; Sam's reads counted from here. */
  async function open(server: TableServer, browser: Browser, testInfo: TestInfo, rules?: object) {
    testInfo.setTimeout(240_000)
    const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
    const priya = await server.open(browser, testInfo, PRIYA, device.options)
    const saved = rules ? { storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(rules) }] }] } } : {}
    const sam = await server.open(browser, testInfo, SAM, { ...device.options, ...saved })
    const reads = readsOf(sam.page, server.id)
    await expect(itemOf(sam.page, 2)).toHaveValue("Line 0", { timeout: 60_000 })
    await expect(itemOf(priya.page, 2)).toHaveValue("Line 0", { timeout: 60_000 })
    await expect.poll(() => server.listening(), { message: "both pages listen on the table's topic", timeout: 30_000 }).toBe(true)
    return { priya, sam, reads }
  }

  /** Scrolls Sam's grid so its row at index `row` is at the top of the rows in sight. */
  async function scrollTo(page: Page, row: number) {
    const h = (await page.locator("tbody tr[data-row]").first().boundingBox())!.height
    await page.locator("[data-table-grid]").evaluate((el, top) => el.scrollTo({ top }), Math.round(h * row))
  }

  /** Priya deletes Line 1 (the view's second row) from its page, and the server says so on the table's topic. */
  async function deleteLine1(page: Page, server: TableServer) {
    // At 1280 a row's open button takes the pointer once the row is hovered (rangesPasteFill.spec.ts).
    const openRow = page.getByRole("button", { name: "Open row 2", exact: true })
    if (!device.touch) await page.locator("tbody tr").filter({ has: openRow }).hover()
    await press(openRow)
    // On a phone the record is the sheet, its Delete in its More menu (TABLES-BOARDS-25).
    if (device.touch) await press(page.getByRole("button", { name: "More for this row" }))
    await press(page.getByRole(device.touch ? "menuitem" : "button", { name: "Delete this row" }))
    await press(page.getByRole("button", { name: "Delete row" }))
    await expect.poll(() => server.rows.length, { timeout: 15_000 }).toBe(699)
    const gone = "00000000-0000-4000-8000-000000000001"
    expect(server.rows.some((r) => r.id === gone), "Line 1 deleted").toBe(false)
    // A delete is a change set: the server's one message for it (business/DataTable liveChanged).
    const set = server.changeSets.at(-1)!.id
    expect(server.say({ action: "changed", change_set: set, created: [], updated: [], deleted: [gone], restored: [], fields: {}, by: PRIYA.user_uuid, at: new Date().toISOString() })).toBe(2)
  }

  test(`${device.name}, a cell another person edits outside the view's rules is read alone, by its row and field`, async ({ browser }, testInfo) => {
    const server = served(700)
    const { priya, sam, reads } = await open(server, browser, testInfo)
    await reads.quiet()
    reads.clear()

    await edit(priya.page, server, 0, 0, "Booth")
    expect(server.say({ action: "updated", row_id: server.rows[0].id, fields: ["item"] }), "both pages heard the edit").toBe(2)

    await expect(itemOf(sam.page, 2)).toHaveValue("Booth", { timeout: 15_000 })
    await reads.quiet()
    expect(reads.reads, "one read of the row's Item, no window of the view, and no count (the bar doesn't sum Item)").toEqual({ ids: ["item"], windows: [], counts: 0, bundles: 0 })
    await expect(itemOf(sam.page, 3)).toHaveValue("Line 1")
    await priya.close()
    await sam.close()
  })

  test(`${device.name}, a row another person deletes leaves the view with no read`, async ({ browser }, testInfo) => {
    const server = served(700)
    const { priya, sam, reads } = await open(server, browser, testInfo)
    await expect(sam.page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", "701")
    await reads.quiet()
    reads.clear()

    await deleteLine1(priya.page, server)

    await expect(itemOf(sam.page, 3)).toHaveValue("Line 2", { timeout: 15_000 })
    await expect(sam.page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", "700")
    await reads.quiet()
    expect(reads.reads, "no row read, no window, and the bar's sums asked again once").toEqual({ ids: [], windows: [], counts: 1, bundles: 0 })
    await priya.close()
    await sam.close()
  })

  test(`${device.name}, after a row another person deletes in the first window, reading on to the view's end leaves no row out`, async ({ browser }, testInfo) => {
    const server = served(700)
    const { priya, sam, reads } = await open(server, browser, testInfo)
    const grid = sam.page.locator("table[aria-rowcount]")
    await expect(grid).toHaveAttribute("aria-rowcount", "701")
    await reads.quiet()
    await deleteLine1(priya.page, server)
    await expect(grid).toHaveAttribute("aria-rowcount", "700", { timeout: 15_000 })
    await reads.quiet()
    reads.clear()

    // Sam reads on to the end: one window, on from the server's cursor after the last row he read (Line 499).
    await scrollTo(sam.page, 700)
    await expect(itemOf(sam.page, 700)).toHaveValue("Line 699", { timeout: 30_000 })
    await reads.quiet()
    expect(reads.reads.windows, "one window, on by the cursor after the first window's last row, never at a place").toEqual(["after 499"])
    // Every row drawn: 699, aria-rowcount's rows (it counts the header), the last at its last index.
    await expect(grid).toHaveAttribute("aria-rowcount", "700")
    await expect(rowAt(sam.page, 701)).toHaveCount(0)
    // And none left out where the two windows meet (Line 500, the first row past Sam's first window, above all).
    await scrollTo(sam.page, 490)
    for (let r = 496; r <= 506; r++) await expect(itemOf(sam.page, r), `row ${r}`).toHaveValue(`Line ${r - 1}`, { timeout: 15_000 })
    await priya.close()
    await sam.close()
  })

  test(`${device.name}, a cell another person edits while Sam is offline shows once he's back, read again by id, with no busy frame`, async ({ browser }, testInfo) => {
    const server = served(700)
    const { priya, sam, reads } = await open(server, browser, testInfo)
    await reads.quiet()
    reads.clear()

    // Offline, Sam's topic still hears the edit (its socket outlives a short drop). A burst's runner comes in its own
    // chunk, fetched as the first message is heard (V-693): this is his first, so the runner's fetch fails and the
    // burst is kept, with nothing read by id (with the runner loaded, its read by id fails instead: unit-tested).
    await server.setOffline(sam.page, true)
    const failed = sam.page.waitForEvent("requestfailed", (req) => new URL(req.url()).searchParams.has("ids") || req.resourceType() === "script")
    await edit(priya.page, server, 0, 0, "Booth")
    expect(server.say({ action: "updated", row_id: server.rows[0].id, fields: ["item"] }), "both pages heard the edit").toBe(2)
    await failed
    await expect(itemOf(sam.page, 2)).toHaveValue("Line 0")
    expect(reads.reads.ids, "nothing read by id while the runner can't load").toEqual([])
    // From here, any busy cell, row or grid (a skeleton's or a read's) in Sam's grid is counted.
    await sam.page.locator("[data-table-grid]").evaluate((el) => {
      const seen = window as unknown as { busyFrames: number }
      seen.busyFrames = 0
      new MutationObserver(() => {
        if (el.matches('[aria-busy="true"]') || el.querySelector('[aria-busy="true"]')) seen.busyFrames++
      }).observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] })
    })
    reads.clear()

    // Back within SWR's 2 s dedupe of the bundle's fetch, so the bundle isn't read again: past it, SWR's own
    // revalidation on reconnect reads the bundle, and the view again if its answer lands first (beta's, V-796).
    await server.setOffline(sam.page, false)
    await expect(itemOf(sam.page, 2)).toHaveValue("Booth", { timeout: 15_000 })
    await reads.quiet()
    expect(reads.reads, "the cell's Item read again by id, once; no window, no count and no bundle").toEqual({ ids: ["item"], windows: [], counts: 0, bundles: 0 })
    expect(await sam.page.evaluate(() => (window as unknown as { busyFrames: number }).busyFrames), "no busy frame").toBe(0)
    await expect(itemOf(sam.page, 3)).toHaveValue("Line 1")

    // The runner's fetch that failed is tried again: the next edit is read by id too.
    reads.clear()
    await edit(priya.page, server, 1, 0, "Stall")
    expect(server.say({ action: "updated", row_id: server.rows[1].id, fields: ["item"] }), "both pages heard the next edit").toBe(2)
    await expect(itemOf(sam.page, 3)).toHaveValue("Stall", { timeout: 15_000 })
    await reads.quiet()
    expect(reads.reads, "the next edit's Item read by id, once").toEqual({ ids: ["item"], windows: [], counts: 0, bundles: 0 })
    await priya.close()
    await sam.close()
  })

  test(`${device.name}, a row another person adds to a view in the table's order is read by id and shows in its place`, async ({ browser }, testInfo) => {
    const server = served(700)
    const { priya, sam, reads } = await open(server, browser, testInfo)
    // Sam at the view's end: his run of windows holds every row.
    await scrollTo(sam.page, 700)
    await expect(itemOf(sam.page, 701)).toHaveValue("Line 699", { timeout: 30_000 })
    await reads.quiet()
    expect(reads.reads.windows, "the view's second window, after its first's last row").toContain("after 499")
    reads.clear()

    // The toolbar's New row (the grid's own, at the foot of its rows, says it in its text).
    await press(priya.page.locator('button[aria-label="New row"]'))
    await expect.poll(() => server.rows.length, { timeout: 15_000 }).toBe(701)
    const made = server.rows[700]
    expect(server.say({ action: "created", row_id: made.id })).toBe(2)

    await expect(sam.page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", "702", { timeout: 15_000 })
    await scrollTo(sam.page, 701)
    await expect(itemOf(sam.page, 702)).toHaveValue("")
    await expect(itemOf(sam.page, 701)).toHaveValue("Line 699")
    await reads.quiet()
    expect(reads.reads, "one read of the new row, no window of the view, and the bar's sums asked again once").toEqual({ ids: [""], windows: [], counts: 1, bundles: 0 })
    await priya.close()
    await sam.close()
  })

  test(`${device.name}, in a view sorted by Amount, an Amount another person edits reads only the windows the row moves across, and the row lands in its place`, async ({ browser }, testInfo) => {
    const server = served(1600)
    const { priya, sam, reads } = await open(server, browser, testInfo, { sort: [{ field: "amount", dir: "asc" }], filters: [], match: "all" })
    // Sam's windows, the only ones sorted by Amount (Priya's view is the table's order).
    const samsWindows = () => server.queries.filter((q) => !q.count && JSON.stringify(q.spec ?? {}).includes("field:amount")).map((q) => (q.at ? `@${q.at}` : afterOf(q.cursor)))
    // Sam's open reads his first window, and his run again once his topic is live (TopicLive): both from the first.
    await reads.quiet()
    const opened = samsWindows().length
    const readOn = () => samsWindows().slice(opened)
    // Sam reads on, a window at a time, to a run of three (rows 0 to 1,499 of 1,600):
    // the grid asks for the next within 60 rows of the run's end (DataTableGrid NEAR_END_ROWS).
    await scrollTo(sam.page, 460)
    await expect.poll(readOn, { timeout: 30_000 }).toEqual(["after 499"])
    await scrollTo(sam.page, 960)
    await expect.poll(readOn, { timeout: 30_000 }).toEqual(["after 499", "after 999"])
    await scrollTo(sam.page, 890)
    await expect(itemOf(sam.page, 902)).toHaveValue("Line 900", { timeout: 30_000 })
    await reads.quiet()
    expect(readOn(), "a run of three windows").toEqual(["after 499", "after 999"])
    reads.clear()

    // Line 3's Amount, 30, as 9,055: in Sam's order, from the 4th row to after Line 905 (9,050), the 906th.
    await edit(priya.page, server, 3, 1, "9055")
    expect(server.say({ action: "updated", row_id: server.rows[3].id, fields: ["amount"] })).toBe(2)

    await expect(itemOf(sam.page, 907)).toHaveValue("Line 3", { timeout: 15_000 })
    await expect(itemOf(sam.page, 906)).toHaveValue("Line 905")
    await expect(itemOf(sam.page, 908)).toHaveValue("Line 906")
    await reads.quiet()
    expect(reads.reads.ids, "one read of the row's Amount").toEqual(["amount"])
    // The windows over its two places, the 4th row and the 906th: the run's first two (the second read at its place), never its third.
    expect(reads.reads.windows.length, `the windows between the row's two places, not the run's three (${reads.reads.windows.join(", ")})`).toBeLessThanOrEqual(2)
    expect(reads.reads.windows.filter((w) => w !== "" && w !== "@500"), "no window past the row's places").toEqual([])
    expect(reads.reads.counts, "the bar's sum of Amount asked again once").toBe(1)
    expect(reads.reads.bundles, "no bundle").toBe(0)
    await priya.close()
    await sam.close()
  })
}
