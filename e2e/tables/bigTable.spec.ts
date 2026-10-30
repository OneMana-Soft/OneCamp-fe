import { expect, test, type Locator, type Page } from "@playwright/test"

import { finger, flingEnded } from "../finger"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

const SHOTS = process.env.SHOTS_DIR

/** A summary cell's visible words and value: each whole (not cut by an ellipsis) and inside the cell. */
async function wordAndSum(cell: Locator, words: string, sum: string) {
  const box = (await cell.boundingBox())!
  for (const text of [words, sum]) {
    const part = cell.getByText(text, { exact: true })
    await expect(part).toBeVisible()
    expect(await part.evaluate((el) => el.scrollWidth <= el.clientWidth), `"${text}" whole`).toBe(true)
    const b = (await part.boundingBox())!
    expect(b.x, `"${text}" inside the cell`).toBeGreaterThanOrEqual(box.x)
    expect(b.x + b.width, `"${text}" inside the cell`).toBeLessThanOrEqual(box.x + box.width)
  }
}

/** A summary cell too narrow for its partial's words: the dashed circle and the whole value inside the cell, and no words. */
async function markAndSum(cell: Locator, sum: string) {
  const box = (await cell.boundingBox())!
  const mark = cell.locator("[data-partial-mark]")
  const value = cell.getByText(sum, { exact: true })
  await expect(mark).toBeVisible()
  expect(await value.evaluate((el) => el.scrollWidth <= el.clientWidth), `"${sum}" whole`).toBe(true)
  for (const part of [mark, value]) {
    const b = (await part.boundingBox())!
    expect(b.x, "inside the cell").toBeGreaterThanOrEqual(box.x)
    expect(b.x + b.width, "inside the cell").toBeLessThanOrEqual(box.x + box.width)
  }
  await expect(cell.getByText(/Loaded|Sum/)).toHaveCount(0)
}

/** The page in each theme, for the design review. */
async function shootThemes(page: Page, name: string) {
  if (!SHOTS) return
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

// TAB-BUG-2: a table past 500 rows. A new row's place was worked out from the
// rows the page held, so it went after the 500th, where the page never
// looked, and never appeared. The server now puts it last, and the page reads
// through to it and gives it the focus.
test("past 500 rows, a new row goes last and takes the focus", async ({ browser }, testInfo) => {
  const server = new TableServer([{ id: "item", name: "Item", type: "text" }], Array.from({ length: 1200 }, (_, i) => ({ item: `Line ${i}` })))
  const sam = await server.open(browser, testInfo, SAM)
  await expect(sam.page.locator("[data-rows-shown]")).toHaveText("Showing 500 of 1,200 rows · Load all", { timeout: 30_000 })

  await sam.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await sam.page.keyboard.press("r")

  await expect.poll(() => server.writes.filter((w) => w.kind === "create").length, { timeout: 15_000 }).toBe(1)
  expect(server.writes.find((w) => w.kind === "create")!.body).not.toHaveProperty("position")
  // The new row is the table's 1,201st, read through to, with the focus in its first cell.
  await expect(sam.page.locator('[data-cell="1200:0"]')).toBeFocused({ timeout: 30_000 })
  await expect(sam.page.locator("[data-rows-shown]")).toHaveCount(0)

  await sam.close()
})

// Tables T5c: a table whose index answers its views is read in windows of
// the view, in its order, as the grid or the phone's list reaches them: no
// "Load all", placeholders holding the places not read yet, and a new row held
// at the view's end. 100,000 rows, as FLUIDITY-LEAD's runs time it.
test.describe("a view the server answers in windows", () => {
  const ROWS = 100_000
  const STAGES = ["Lead", "Won", "Lost"]
  const served = (fields: { id: string; name: string; type: string; config?: Record<string, unknown> }[]) => {
    const server = new TableServer(
      fields,
      // double: what a read works out for a formula, twice the amount, in the row's values.
      Array.from({ length: ROWS }, (_, i) => ({ item: `Line ${i}`, amount: (i * 7) % 1000, double: ((i * 7) % 1000) * 2, stage: STAGES[i % 3], notes: `Note ${i}`, due: "2026-10-22" })),
    )
    server.answersQuery = true
    return server
  }
  /** The reader's saved rules for the table, as the page keeps them in the browser. */
  const savedRules = (server: TableServer, baseURL: string, rules: object) => ({
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(rules) }] }] },
  })
  const windowsRead = (server: TableServer) => server.queries.filter((q) => !q.count).map((q) => q.cursor ?? "")
  /**
   * The page reading the view's windows again by itself, past its `since`th
   * read. While the server fills a formula the page waits longer before each
   * read (useTableRows' WORKING_AGAIN_MS, doubling up to WORKING_MOST_MS), so a
   * test waits for that read, as long as the test may run, before it looks for
   * what the read answered.
   */
  const readAgain = (server: TableServer, since: number) =>
    expect.poll(() => windowsRead(server).length, { message: "the page reads the view again by itself", timeout: 0 }).toBeGreaterThan(since)

  test("at 1280, the grid reads the view's windows in its order as it scrolls, and never offers Load all", async ({ browser }, testInfo) => {
    const server = served([
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
    ])
    const sam = await server.open(browser, testInfo, SAM)
    const page = sam.page
    const rows = page.locator("tbody tr[data-row]")
    // The bundle's page at once, the view's first window behind it.
    await expect(rows.first()).toContainText("Line 0")
    await expect.poll(() => windowsRead(server)).toEqual([""])
    await expect(page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", String(ROWS + 1))
    await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0)
    await expect(page.locator("[data-rows-shown]")).toHaveCount(0)
    // Far down, as a scrollbar dragged: the places not read yet hold
    // placeholders, then the windows in order bring the rows there.
    const h = (await rows.first().boundingBox())!.height
    await page.locator("[data-table-grid]").evaluate((el, top) => el.scrollTo({ top }), Math.round(h * 3000))
    // By the row's name: its text runs its cells together ("Line 3000" then its amount, 0).
    await expect(page.getByRole("row", { name: / Line 300\d / }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("tbody tr[data-placeholder]")).toHaveCount(0)
    const read = windowsRead(server)
    expect(read.slice(0, 7)).toEqual(["", "500", "1000", "1500", "2000", "2500", "3000"])
    // Each row in its place: the 3,001st of the view.
    await expect(page.getByRole("row", { name: / Line 3000 / })).toHaveAttribute("aria-rowindex", "3002")
    await sam.close()
  })

  test("at 1280, the summary bar says the whole view's sum, as the server works it out", async ({ browser }, testInfo) => {
    const server = served([
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
    ])
    const sam = await server.open(browser, testInfo, SAM)
    // (i * 7) % 1000 over 100,000 rows: every amount 0 to 999, a hundred times.
    await expect(sam.page.locator("[data-summary-bar]").getByRole("button", { name: "Amount summary: Sum 49,950,000" })).toBeVisible()
    expect(server.queries.filter((q) => q.count).map((q) => q.spec.summaries)).toEqual([[{ field: "field:amount", fns: ["sum"] }]])
    await sam.close()
  })

  // V-48: right after a big import, a first window's sums ran past their
  // budget and the server left them out, and the bar said "Sum …" with no
  // end. It says the rows loaded are what it summed, asks again a little
  // later, and says the whole view's once they come.
  for (const phone of [false, true]) {
    const at = phone ? "390" : "1280"
    test(`at ${phone ? "390 with touch" : "1280"}, a bar whose sums the server left out says the loaded rows', then the whole view's`, async ({ browser }, testInfo) => {
      const server = served([
        { id: "item", name: "Item", type: "text" },
        { id: "amount", name: "Amount", type: "number" },
      ])
      server.countsLeavingOut = 1
      const sam = await server.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
      const bar = sam.page.locator("[data-summary-bar]")
      // The first 500 rows' amounts, (i * 7) % 1000 for i below 500.
      const partial = bar.getByRole("button", { name: "Amount summary: Sum of 500 loaded 231,250" })
      await expect(partial).toBeVisible({ timeout: 30_000 })
      await expect(bar).not.toContainText("…")
      // In a number's 128 px column the partial's words don't fit beside the sum: they say "Loaded", whole (DB-29).
      await wordAndSum(partial, "Loaded", "231,250")
      await bar.scrollIntoViewIfNeeded()
      await shootThemes(sam.page, `sums-left-out-${at}`)
      await expect(bar.getByRole("button", { name: "Amount summary: Sum 49,950,000" })).toBeVisible({ timeout: 15_000 })
      await shootThemes(sam.page, `sums-asked-again-${at}`)
      expect(server.queries.filter((q) => q.count)).toHaveLength(2)
      await sam.close()
    })

    // DB-29 (29 Oct): "Sum o… 231,250" read as the whole, the words that said
    // it was partial cut away. Beside an 8-digit partial in the 128 px column
    // even "Loaded" can't sit whole (31 px of room for its 40): a dashed
    // circle stands for the words, which its tip shows, or by touch the
    // summary menu's first line. Given room, the full words come back.
    test(`at ${phone ? "390 with touch" : "1280"}, a partial too narrow for its words marks its 8-digit sum, says them in its tip or menu, and shows them where they fit`, async ({ browser }, testInfo) => {
      // The first 500 rows hold every amount: the loaded rows' sum is the view's, 12,475,000.
      const server = new TableServer(
        [
          { id: "item", name: "Item", type: "text" },
          { id: "amount", name: "Amount", type: "number" },
        ],
        Array.from({ length: ROWS }, (_, i) => ({ item: `Line ${i}`, amount: i < 500 ? i * 100 : 0 })),
      )
      server.answersQuery = true
      // Left out on each page's first count and its re-asks, for the whole test.
      server.countsLeavingOut = 8
      const sam = await server.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
      const { page } = sam
      const bar = page.locator("[data-summary-bar]")
      const partial = bar.getByRole("button", { name: "Amount summary: Sum of 500 loaded 12,475,000" })
      await expect(partial).toBeVisible({ timeout: 30_000 })
      await markAndSum(partial, "12,475,000")
      await bar.scrollIntoViewIfNeeded()
      await shootThemes(page, `sums-left-out-8-digits-${at}`)
      if (phone) {
        await partial.tap()
        await expect(page.getByRole("menu").getByText("Sum of 500 loaded", { exact: true })).toBeVisible()
        await shootThemes(page, `sums-left-out-menu-${at}`)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("menu")).toHaveCount(0)
      } else {
        await partial.hover()
        await expect(page.locator("[data-tip-layer]")).toHaveText("Sum of 500 loaded")
        await shootThemes(page, `sums-left-out-tip-${at}`)
      }
      // A wider column: the full words, whole, beside the same sum.
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ widths: { amount: 360 } })), server.id)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(partial).toBeVisible({ timeout: 30_000 })
      await wordAndSum(partial, "Sum of 500 loaded", "12,475,000")
      await expect(partial.locator("[data-partial-mark]")).toHaveCount(0)
      await bar.scrollIntoViewIfNeeded()
      await shootThemes(page, `sums-left-out-wide-${at}`)
      await sam.close()
    })
  }

  test("at 1280, a sorted view reads its windows sorted, and a new row stays at its end, focused", async ({ browser }, testInfo) => {
    const server = served([
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
    ])
    const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
    const sam = await server.open(browser, testInfo, SAM, savedRules(server, baseURL, { sort: [{ field: "item", dir: "desc" }], filters: [], match: "all" }))
    const page = sam.page
    const rows = page.locator("tbody tr[data-row]")
    await expect(rows.first()).toContainText("Line 99999", { timeout: 30_000 })
    expect(server.queries.find((q) => !q.count)?.spec).toEqual({ sorts: [{ field: "field:item", desc: true }] })
    // R: the server puts the row last; the view holds it at its end, after
    // every place not read yet, and its first cell takes the focus.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press("r")
    await expect.poll(() => server.writes.filter((w) => w.kind === "create").length, { timeout: 15_000 }).toBe(1)
    const made = server.rows.at(-1)!.id
    const focusedRow = page.locator(`tbody tr[data-row="${made}"]`)
    await expect(focusedRow).toHaveAttribute("aria-rowindex", String(ROWS + 2), { timeout: 30_000 })
    await expect(focusedRow.locator("[data-cell]").first()).toBeFocused({ timeout: 30_000 })
    await expect(page.locator("table[aria-rowcount]")).toHaveAttribute("aria-rowcount", String(ROWS + 2))
    await sam.close()
  })

  test("at 390 with touch, the phone's list reads its windows under a finger, and opens a row's record in its place", async ({ browser }, testInfo) => {
    const server = served([
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "stage", name: "Stage", type: "select", config: { options: STAGES.map((label, i) => ({ id: `o_stage${i}00000`, label })) } },
      { id: "due", name: "Due", type: "date" },
      { id: "notes", name: "Notes", type: "text" },
    ])
    const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = sam.page
    const box = page.locator("[data-list-scroll]")
    const items = page.locator("ul.v3-grid-list > li[aria-posinset]")
    await expect(items.first()).toContainText("Line 0")
    await expect(items.first()).toHaveAttribute("aria-setsize", String(ROWS))
    // A finger's swipes up the list: the rows follow, never a blank screen.
    // A finger as the fluidity runs move one (lib.mjs touchDrag): inside the
    // screen, a step each frame.
    const b = (await box.boundingBox())!
    const touch = await finger(page)
    const x = Math.round(b.x + b.width / 2)
    const top = Math.max(b.y, 0) + 60
    const bottom = Math.min(b.y + b.height, 844) - 60
    for (let swipe = 0; swipe < 3; swipe++) {
      await touch.down(x, Math.round(bottom))
      for (let i = 1; i <= 12; i++) {
        await touch.move(x, Math.round(bottom + ((top - bottom) * i) / 12))
        // One move a frame, as a finger moves: the browser reads a swipe's speed from them.
        await page.waitForTimeout(16)
      }
      await touch.up()
    }
    await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(600)
    await expect(items.first()).toBeVisible()
    // The last swipe's fling runs out first: a jump made while it still runs
    // is carried on past where it was sent (to Lines 2023-2032), and the row
    // tapped below moves on and unmounts (release e2e, 30 Oct: 1 in 3).
    await flingEnded(box)
    // Far down at once: placeholders, then the rows there, read in windows.
    await box.evaluate((el) => el.scrollTo({ top: 60 * 2000 }))
    // By each row's name: its text runs its title and values together.
    await expect(page.getByRole("button", { name: /^Line 200\d / }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("ul.v3-grid-list > li[data-placeholder]")).toHaveCount(0)
    // A tap opens the row's record as a sheet, which says its place in the whole view.
    await page.getByRole("button", { name: /^Line 2005 / }).tap()
    const record = page.locator("[data-record-panel]")
    await expect(record).toBeVisible()
    await expect(record).toContainText("2,006 of 100,000")
    await sam.close()
  })

  // airtable-03: a formula's column is the server's to sort by and to add up,
  // over every row of the view, never the window loaded; a view the server
  // won't work out says the server's own words, with a way back.
  const withDouble = () =>
    served([
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "double", name: "Double", type: "formula", config: { formula: "{Amount} * 2", result: "number" } },
    ])
  const byDouble = { sort: [{ field: "double", dir: "desc" }], filters: [], match: "all" }
  const tooMany = "This table has too many rows to work out a formula or a rollup over all of them yet."
  for (const phone of [false, true]) {
    const at = phone ? "390 with touch" : "1280"
    const device = phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {}
    // The view's first row, in the grid or the phone's list (at 390, a table
    // of four fields or fewer opens in the grid: T22's listByDefault).
    const firstRow = (page: Page) => page.locator("tbody tr[data-row], ul.v3-grid-list > li[aria-posinset]").first()

    test(`at ${at}, a view sorted by a formula reads the server's windows in its order, offers no Load all, and totals the formula over every row`, async ({ browser }, testInfo) => {
      const server = withDouble()
      const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
      const sam = await server.open(browser, testInfo, SAM, { ...device, ...savedRules(server, baseURL, byDouble) })
      const page = sam.page
      // Most first: (i * 7) % 1000 is first 999 at row 857, so Double's 1,998 leads.
      await expect(firstRow(page)).toContainText("Line 857", { timeout: 30_000 })
      expect(server.queries.find((q) => !q.count)?.spec).toEqual({ sorts: [{ field: "field:double", desc: true }] })
      await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0)
      // Every amount 0 to 999 a hundred times, twice over: the server's sum of all 100,000 rows.
      const bar = page.locator("[data-summary-bar]")
      const total = bar.getByRole("button", { name: "Double summary: Sum 99,900,000" })
      await expect(total).toBeVisible({ timeout: 15_000 })
      expect(server.queries.filter((q) => q.count).flatMap((q) => q.spec.summaries ?? [])).toContainEqual({ field: "field:double", fns: ["sum"] })
      // The formula's total whole in the shot, at 390 too: the grid scrolled to Double (DB-40).
      await total.scrollIntoViewIfNeeded()
      await expect(total).toBeInViewport({ ratio: 1 })
      await shootThemes(page, `formula-total-${at}`)
      await sam.close()
    })

    test(`at ${at}, a view the server won't work out says the server's words, and clearing its formula and rollup rules reads the view again`, async ({ browser }, testInfo) => {
      const server = withDouble()
      server.refuses = (q) => (JSON.stringify(q.spec ?? {}).includes("field:double") ? tooMany : null)
      const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
      const sam = await server.open(browser, testInfo, SAM, { ...device, ...savedRules(server, baseURL, byDouble) })
      const page = sam.page
      await expect(page.getByText(tooMany).first()).toBeVisible({ timeout: 30_000 })
      // Said once (DB-40): with no row drawn, the body says it with its button,
      // and the toolbar doesn't say it again.
      await expect(page.getByText(tooMany)).toHaveCount(1)
      await expect(page.getByText("Couldn't load the rows")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0)
      await shootThemes(page, `formula-refused-${at}`)
      const clear = page.getByRole("button", { name: "Clear formula and rollup rules" }).first()
      await (phone ? clear.tap() : clear.click())
      // The view's other rules stand (none here): the table's own order, as the server reads it.
      await expect(firstRow(page)).toContainText("Line 0", { timeout: 30_000 })
      await expect(page.getByText(tooMany)).toHaveCount(0)
      expect(JSON.stringify(server.queries.filter((q) => !q.count).at(-1)?.spec ?? {})).not.toContain("field:double")
      await shootThemes(page, `formula-refused-cleared-${at}`)
      await sam.close()
    })

    // airtable-03b: while the server is still filling a formula the view
    // sorts by, the view says how far it has got, calmly, with no button to
    // clear, asks again by itself, and shows its rows once answered, with no
    // reload.
    test(`at ${at}, a view whose formula the server is still filling says how far, and shows its rows by itself once done`, async ({ browser }, testInfo) => {
      const server = withDouble()
      let done: number | null = 30_000
      const working = (d: number) => `Double is being worked out over 100,000 rows: ${d / 1000}% done`
      server.refuses = (q) =>
        done !== null && !q.count && JSON.stringify(q.spec ?? {}).includes("field:double")
          ? { msg: working(done), progress: { done, total: 100_000 } }
          : null
      const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
      const sam = await server.open(browser, testInfo, SAM, { ...device, ...savedRules(server, baseURL, byDouble) })
      const page = sam.page
      const bar = page.getByRole("progressbar", { name: "Worked out so far" })
      await expect(page.getByText(working(30_000))).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText("Your view shows here the moment it's done.")).toBeVisible()
      await expect(bar).toHaveAttribute("aria-valuenow", "30")
      await expect(bar).toBeInViewport({ ratio: 1 })
      // The size is why it waits (DB-42): the view's rows, never "Showing 0 of".
      await expect(page.getByText("100,000 rows", { exact: true })).toBeVisible()
      await expect(page.getByText(/Showing 0 of/)).toHaveCount(0)
      // Calm, not a refusal: no way to clear, no error, no Load all.
      await expect(page.getByRole("button", { name: "Clear formula and rollup rules" })).toHaveCount(0)
      await expect(page.getByText("Couldn't load the rows")).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Load all" })).toHaveCount(0)
      await page.evaluate(() => ((window as unknown as { __samePage: number }).__samePage = 1))
      await shootThemes(page, `formula-working-${at}`)
      // It asks again by itself, and says the fill's new place.
      const asked = windowsRead(server).length
      done = 80_000
      await readAgain(server, asked)
      await expect(page.getByText(working(80_000))).toBeVisible({ timeout: 15_000 })
      await expect(bar).toHaveAttribute("aria-valuenow", "80")
      // Done: the rows, in the formula's order, with no reload.
      const askedAt80 = windowsRead(server).length
      done = null
      await readAgain(server, askedAt80)
      await expect(firstRow(page)).toContainText("Line 857", { timeout: 15_000 })
      await expect(page.getByText(/is being worked out over/)).toHaveCount(0)
      await expect(bar).toHaveCount(0)
      expect(await page.evaluate(() => (window as unknown as { __samePage?: number }).__samePage)).toBe(1)
      await shootThemes(page, `formula-working-done-${at}`)
      await sam.close()
    })

    // DB-42: a read again that fails during the fill (here a 500) says it
    // couldn't load, with Try again, once, in the body: never the progress for
    // good, never the refusal's Clear. Try again reads the view from the first.
    test(`at ${at}, a read that fails while the server fills a formula says so with Try again, and Try again shows the rows`, async ({ browser }, testInfo) => {
      const server = withDouble()
      let filling = true
      const words = "Double is being worked out over 100,000 rows: 30% done"
      server.refuses = (q) =>
        filling && !q.count && JSON.stringify(q.spec ?? {}).includes("field:double") ? { msg: words, progress: { done: 30_000, total: 100_000 } } : null
      const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
      const sam = await server.open(browser, testInfo, SAM, { ...device, ...savedRules(server, baseURL, byDouble) })
      const page = sam.page
      await expect(page.getByText(words)).toBeVisible({ timeout: 30_000 })
      const asked = windowsRead(server).length
      filling = false
      server.windowsFailing = 1
      await readAgain(server, asked)
      await expect(page.getByText("Couldn't load the rows")).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(words)).toHaveCount(0)
      await expect(page.getByRole("progressbar", { name: "Worked out so far" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Clear formula and rollup rules" })).toHaveCount(0)
      await expect(page.getByText(/No rows match/)).toHaveCount(0)
      const retry = page.getByRole("button", { name: /Try again/ })
      await expect(retry).toHaveCount(1)
      await expect(retry).toBeInViewport({ ratio: 1 })
      await shootThemes(page, `formula-working-failed-${at}`)
      await (phone ? retry.tap() : retry.click())
      await expect(firstRow(page)).toContainText("Line 857", { timeout: 15_000 })
      await expect(page.getByText("Couldn't load the rows")).toHaveCount(0)
      await sam.close()
    })

    // DB-40: a formula's sum the server won't work out shows "–", with the
    // server's words in its tip (by touch, its menu's first line), beside a
    // stored column's sum that the server still answers.
    test(`at ${at}, a formula's sum the server won't work out shows "–" and the server's words, beside a stored column's sum`, async ({ browser }, testInfo) => {
      const server = withDouble()
      // Only a count that sums Double is refused: the view's windows read as ever.
      server.refuses = (q) => (q.count && JSON.stringify(q.spec?.summaries ?? []).includes("field:double") ? tooMany : null)
      const sam = await server.open(browser, testInfo, SAM, device)
      const page = sam.page
      await expect(firstRow(page)).toContainText("Line 0", { timeout: 30_000 })
      const bar = page.locator("[data-summary-bar]")
      await expect(bar.getByRole("button", { name: "Amount summary: Sum 49,950,000" })).toBeVisible({ timeout: 15_000 })
      const refused = bar.getByRole("button", { name: `Double summary: Sum –. ${tooMany}` })
      await expect(refused).toContainText("–")
      await refused.scrollIntoViewIfNeeded()
      await expect(refused).toBeInViewport({ ratio: 1 })
      if (phone) {
        await refused.tap()
        await expect(page.getByRole("menu").getByText(tooMany, { exact: true })).toBeVisible()
        await shootThemes(page, `formula-sum-refused-menu-${at}`)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("menu")).toHaveCount(0)
      } else {
        await refused.hover()
        await expect(page.locator("[data-tip-layer]")).toHaveText(tooMany)
        await shootThemes(page, `formula-sum-refused-tip-${at}`)
      }
      await sam.close()
    })

    // V-118 (the live walk at 100k, 30 Oct): the server left a view's sums out
    // of every count, the three re-asks' too, and a formula's sum said "Sum …"
    // for good, with no reason and nothing to try again. Past the last re-ask
    // it says "–" and why, a stored column's is the loaded rows', and the
    // notice says so with a Try again (as for a grouping, CR-76 MF1).
    test(`at ${at}, a formula's sum the server left out of every count says why, with a Try again, and Try again totals it`, async ({ browser }, testInfo) => {
      const server = withDouble()
      server.countsLeavingOut = 10
      const sam = await server.open(browser, testInfo, SAM, device)
      const page = sam.page
      await expect(firstRow(page)).toContainText("Line 0", { timeout: 30_000 })
      // The re-asks wait 5, 15 and 45 s: the page's clock runs on to each.
      await page.clock.install()
      const counted = () => server.queries.filter((q) => q.count).length
      for (const n of [2, 3, 4]) {
        await expect
          .poll(
            async () => {
              await page.clock.fastForward(50_000)
              return counted()
            },
            { timeout: 30_000 },
          )
          .toBeGreaterThanOrEqual(n)
      }
      const why = "The rows take too long to add up right now: filter the view to fewer rows."
      const notice = page.getByRole("status").filter({ hasText: why })
      await expect(notice).toBeVisible({ timeout: 15_000 })
      const bar = page.locator("[data-summary-bar]")
      const out = bar.getByRole("button", { name: `Double summary: Sum –. ${why}` })
      await expect(out).toContainText("–")
      await expect(bar.getByRole("button", { name: /^Amount summary: Sum of 500 loaded/ })).toBeVisible()
      // Nothing asks again by itself.
      await page.clock.fastForward(120_000)
      expect(counted()).toBe(4)
      await out.scrollIntoViewIfNeeded()
      await expect(out).toBeInViewport({ ratio: 1 })
      await shootThemes(page, `formula-sum-left-out-${at}`)
      // The server adds them up now: Try again totals Double, and the notice goes.
      server.countsLeavingOut = 0
      const again = notice.getByRole("button", { name: "Try again" })
      await (phone ? again.tap() : again.click())
      await expect(bar.getByRole("button", { name: "Double summary: Sum 99,900,000" })).toBeVisible({ timeout: 15_000 })
      await expect(notice).toHaveCount(0)
      expect(counted()).toBe(5)
      await shootThemes(page, `formula-sum-left-out-again-${at}`)
      await sam.close()
    })

    // CR-92 M2 (DB-41): only a summary asked of the server waits for it. While
    // the server works the sums out, a column with no summary stays blank (never
    // "…"); and a sum kept on a formula edited to give text is never asked of
    // the server: it is the loaded rows', "Sum of 500 loaded –", at once.
    test(`at ${at}, while the sums load a column with no summary stays blank, and a sum kept on a formula that now gives text is the loaded rows'`, async ({ browser }, testInfo) => {
      const server = served([
        { id: "item", name: "Item", type: "text" },
        { id: "amount", name: "Amount", type: "number" },
        { id: "label", name: "Label", type: "formula", config: { formula: '{Item} & " USD"', result: "text" } },
      ])
      const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3001")
      const display = { name: `onecamp:tableDisplay:${server.id}`, value: JSON.stringify({ summary: { label: "sum" } }) }
      const sam = await server.open(browser, testInfo, SAM, { ...device, storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [display] }] } })
      const page = sam.page
      const bar = page.locator("[data-summary-bar]")
      await expect(bar.getByRole("button", { name: "Amount summary: Sum 49,950,000" })).toBeVisible({ timeout: 30_000 })
      // The server's counts held: the page asks again on a reload and waits.
      let release = () => {}
      const held = new Promise<void>((r) => (release = r))
      await page.route(
        (url) => url.pathname.endsWith("/query"),
        async (route) => {
          if (route.request().method() === "POST" && route.request().postDataJSON()?.count) await held
          await route.fallback()
        },
      )
      await page.reload({ waitUntil: "domcontentloaded" })
      const waiting = bar.getByRole("button", { name: "Amount summary: Sum …" })
      await expect(waiting).toBeVisible({ timeout: 30_000 })
      const none = bar.getByRole("button", { name: "Item summary: none" })
      await expect(none).toBeVisible()
      await expect(none).not.toContainText("…")
      const stale = bar.getByRole("button", { name: "Label summary: Sum of 500 loaded –" })
      await expect(stale).toBeVisible()
      await waiting.scrollIntoViewIfNeeded()
      await shootThemes(page, `sums-loading-blank-${at}`)
      release()
      await expect(bar.getByRole("button", { name: "Amount summary: Sum 49,950,000" })).toBeVisible({ timeout: 15_000 })
      // Never asked of the server, so it never waits for the server's.
      expect(server.queries.filter((q) => q.count).flatMap((q) => q.spec?.summaries ?? []).map((s) => s.field)).not.toContain("field:label")
      await expect(stale).toBeVisible()
      await stale.scrollIntoViewIfNeeded()
      // Its words and its "–" whole on screen (at 390 the wide text column runs past the grid's edge; what it says doesn't).
      for (const part of [stale.getByText("Sum of 500 loaded", { exact: true }), stale.locator("[data-sum-value]")]) await expect(part).toBeInViewport({ ratio: 1 })
      await expect(stale.locator("[data-sum-value]")).toHaveText("–")
      if (phone) {
        await stale.tap()
        await expect(page.getByRole("menu")).toBeVisible()
        await shootThemes(page, `stale-sum-menu-${at}`)
        await page.keyboard.press("Escape")
      } else {
        await stale.hover()
        await shootThemes(page, `stale-sum-tip-${at}`)
      }
      await sam.close()
    })
  }
})
