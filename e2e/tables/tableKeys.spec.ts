import { expect, test, type Locator, type Page } from "@playwright/test"
import { holdChunk } from "../holdChunk"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// airtable-04 (AV-6, AV-7): a table's keys, from one table the page and the
// grid bind and the app's keys list shows as its Tables group. ⌘J (Ctrl+J off
// a Mac) switches table and ⌘⇧K view, on the palette's page of choices; ⌘⇧F
// and ⌘⇧S open the filter and the sort; ⌘⇧⏎ adds a row; Space on a selected
// cell expands its row's record and Escape closes it, the focus back on the
// cell; ⌘; sets a date cell to today. V-236: on a phone, a long table's
// summary row stays on the screen, as the page opens and through a find's
// steps. The keys run as Linux's Ctrl here (a Mac's ⌘ is lib/tables/tableKeys'
// unit test).

const fields = [
  { id: "name", name: "Name", type: "text" },
  { id: "city", name: "City", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
  { id: "due", name: "Due", type: "date" },
]
const rows = () => [
  { name: "Acme", city: "Leeds", amount: 100, due: "2026-01-05" },
  { name: "Globex", city: "York", amount: 200, due: "2026-02-10" },
  { name: "Initech", city: "Leeds", amount: 300 },
]
const rowId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
const BUDGET = "7ab0c0de-0000-4000-8000-000000000002"
const HIRING = "7ab0c0de-0000-4000-8000-000000000003"

const DEVICES = [
  { name: "at 1280", phone: false, options: { viewport: { width: 1280, height: 800 } } },
  { name: "at 390 with touch", phone: true, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
]

const cell = (page: Page, row: number, field: string) => page.locator(`tbody tr[data-row="${rowId(row)}"] > td[data-field="${field}"]`)
// The focus is in the cell: its box, or the box's field.
const focusIn = (l: Locator) => l.evaluate((el) => el.contains(document.activeElement))
// The sidebar's AI button, pressed while the AI panel is open (at 1280); by its label, as the palette (a modal) hides the rest from roles.
const aiButton = (page: Page) => page.locator('button[aria-label="Ask OneCamp AI"]')

// The keys list is a computer's: a phone's layout has none (LayoutContent
// mounts ShortcutsDialog in the desktop bar; beta's own build showed none at
// 390 either), and a phone reaches the switchers from search, by name.
for (const device of DEVICES.filter((d) => !d.phone)) {
  test(`${device.name}, the keys list shows the table's keys first, as its Tables group, and finds them by what they do`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows())
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    await expect(cell(page, 0, "name")).toBeVisible({ timeout: 60_000 })
    await page.keyboard.press("?")
    const sheet = page.locator("[data-shortcuts-dialog]")
    await expect(sheet).toBeVisible()
    await expect(sheet.locator("[data-shortcut-group]").first()).toHaveAttribute("data-shortcut-group", "Tables")
    const tables = sheet.locator('[data-shortcut-group="Tables"]')
    for (const does of ["Switch to another table", "Switch to another view", "Find in this view", "Expand the row's record", "Set a date to today", "Filter the view", "Select the row"]) {
      await expect(tables.locator(`[data-shortcut-row="Tables:${does}"]`)).toBeVisible()
    }
    await expect(tables.locator('[data-shortcut-row="Tables:Switch to another table"] kbd')).toHaveText(["Ctrl", "J"])
    await expect(tables.locator(`[data-shortcut-row="Tables:Expand the row's record"] kbd`)).toHaveText(["Space"])
    // No row's words go under its keys (DB-77: four Shift chords squeezed
    // "Select cells" under them): in every group, a row's words fit their box,
    // longest word included, and end before its keys, which stay in the row.
    const crowded = await sheet.locator("[data-shortcut-row]").evaluateAll((rows) =>
      rows
        .filter((row) => {
          const words = row.firstElementChild as HTMLElement
          const keys = (row.lastElementChild as HTMLElement).getBoundingClientRect()
          const text = document.createRange()
          text.selectNodeContents(words)
          return words.scrollWidth > words.clientWidth + 1 || text.getBoundingClientRect().right > keys.left + 1 || keys.right > row.getBoundingClientRect().right + 1
        })
        .map((row) => row.getAttribute("data-shortcut-row")),
    )
    expect(crowded).toEqual([])
    // Shift and the four arrows read as one, as the list writes Ctrl + Alt + 1 / 2 / 3.
    await expect(tables.locator('[data-shortcut-row="Tables:Select cells"] kbd')).toHaveText(["Shift", "↓", "↑", "←", "→"])
    await sheet.getByRole("textbox", { name: "Filter shortcuts" }).fill("switch")
    await expect(tables.locator("[data-shortcut-row]")).toHaveCount(2)
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    if (!device.phone) {
      // Ctrl+/ opens it too, as Airtable's ⌘/ does; a table left, the group goes with it.
      await page.keyboard.press("Control+/")
      await expect(sheet.locator('[data-shortcut-group="Tables"]')).toBeVisible()
      await page.keyboard.press("Escape")
    }
    await close()
  })
}

test("at 1280, Ctrl+J switches to another table from the palette's page of tables, even with the AI panel's Ctrl+J on", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  server.others = [
    { id: BUDGET, name: "Launch budget" },
    { id: HIRING, name: "Hiring plan" },
  ]
  server.features = { ai: true }
  const { page, close } = await server.open(browser, testInfo, SAM)
  await cell(page, 1, "name").click()
  await page.keyboard.press("Control+j")
  const choice = (name: RegExp) => page.getByRole("option", { name })
  await expect(choice(/Launch budget/)).toBeVisible()
  await expect(choice(/^Deals/)).toContainText("Current")
  // The switcher alone. The AI panel's Ctrl+J, on the document before the
  // table's, opened its panel too on every press, behind the palette, and under
  // load the panel's field took the letters typed next (the keys gate's FAIL,
  // 1 Nov). The AI button's pressed state is the panel's at once; the panel
  // itself mounts later.
  await expect(aiButton(page)).toHaveAttribute("aria-pressed", "false")
  await page.keyboard.type("hir")
  await expect(choice(/Launch budget/)).toHaveCount(0)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(new RegExp(`/app/tables/${HIRING}`))
  await close()
})

test("at 1280, Ctrl+J as the table opens, before anything is clicked, opens the table switcher alone and the letters typed next go to it", async ({ browser }, testInfo) => {
  // From the page itself, no cell selected: the switcher alone, as from a
  // cell's box above.
  const server = new TableServer(fields, rows())
  server.others = [
    { id: BUDGET, name: "Launch budget" },
    { id: HIRING, name: "Hiring plan" },
  ]
  server.features = { ai: true }
  const { page, close } = await server.open(browser, testInfo, SAM)
  await expect(cell(page, 1, "name")).toBeVisible()
  await page.keyboard.press("Control+j")
  const choice = (name: RegExp) => page.getByRole("option", { name })
  await expect(choice(/Launch budget/)).toBeVisible()
  await expect(aiButton(page)).toHaveAttribute("aria-pressed", "false")
  await page.keyboard.type("hir")
  await expect(choice(/Launch budget/)).toHaveCount(0)
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(new RegExp(`/app/tables/${HIRING}`))
  await expect(aiButton(page)).toHaveAttribute("aria-pressed", "false")
  await close()
})

test("at 1280, Ctrl+Shift+K switches the saved view, as picking it from the views menu does", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  server.savedViews = [
    { id: "5a7e0000-0000-4000-8000-000000000001", table_id: server.id, name: "Everything", type: "grid", config: "{}", position: 0 },
    { id: "5a7e0000-0000-4000-8000-000000000002", table_id: server.id, name: "Leeds only", type: "grid", config: JSON.stringify({ filters: [{ field: "city", op: "is", value: "Leeds" }] }), position: 1 },
  ]
  const { page, close } = await server.open(browser, testInfo, SAM)
  await expect(page.getByRole("button", { name: /^View: Everything/ })).toBeVisible({ timeout: 60_000 })
  await cell(page, 0, "name").click()
  await page.keyboard.press("Control+Shift+K")
  const choice = (name: RegExp) => page.getByRole("option", { name })
  await expect(choice(/^Everything/)).toContainText("Current")
  await choice(/^Leeds only/).click()
  await expect(page.getByRole("button", { name: /^View: Leeds only/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]v=5a7e0000-0000-4000-8000-000000000002/)
  await close()
})

test("at 1280, Space expands a selected cell's record and Escape puts the focus back on the cell; Shift+Space selects the row", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const { page, close } = await server.open(browser, testInfo, SAM)
  // A click selects the cell, as a sheet's does (V-295); Escape keeps it
  // selected, shut, as the keys reach it.
  await cell(page, 1, "city").click()
  await page.keyboard.press("Escape")
  await expect.poll(() => focusIn(cell(page, 1, "city"))).toBe(true)
  await page.keyboard.press("Space")
  const record = page.locator("[data-record-panel]")
  await expect(record).toBeVisible()
  await expect(record).toContainText("Globex")
  // The space went to the record, not into the cell.
  expect(server.writes.filter((w) => w.kind === "patch")).toHaveLength(0)
  await page.keyboard.press("Escape")
  await expect(record).toBeHidden()
  await expect.poll(() => focusIn(cell(page, 1, "city")), { message: "the focus is back in Globex's City" }).toBe(true)
  await page.keyboard.press("Shift+Space")
  await expect(page.locator(`tbody tr[data-row="${rowId(1)}"]`)).toHaveAttribute("aria-selected", "true")
  await expect(record).toBeHidden()
  await close()
})

test("at 1280, Ctrl+; sets a date cell to today; Ctrl+Shift+F and Ctrl+Shift+S open the filter and the sort; Ctrl+Shift+Enter adds a row", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const { page, close } = await server.open(browser, testInfo, SAM)
  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
  await cell(page, 2, "due").click()
  await page.keyboard.press("Escape")
  await expect.poll(() => focusIn(cell(page, 2, "due"))).toBe(true)
  await page.keyboard.press("Control+;")
  await expect.poll(() => server.writes.filter((w) => w.kind === "patch").map((w) => JSON.stringify(w.body.values))).toEqual([JSON.stringify({ due: today })])
  await expect.poll(() => server.valuesOf(2).due).toBe(today)
  await page.keyboard.press("Control+Shift+F")
  await expect(page.getByRole("button", { name: /^Filter/ })).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Escape")
  // The filter's menu gone (its closing hands the focus back to Filter, which
  // would close a menu opened under it meanwhile), then the sort's key.
  await expect(page.locator("[data-radix-popper-content-wrapper]")).toHaveCount(0)
  await page.keyboard.press("Control+Shift+S")
  await expect(page.getByRole("button", { name: "Sort and group" })).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Escape")
  await cell(page, 0, "name").click()
  await page.keyboard.press("Control+Shift+Enter")
  await expect.poll(() => server.writes.filter((w) => w.kind === "create").length).toBe(1)
  await expect(page.locator("tbody tr[data-row]")).toHaveCount(4)
  await close()
})

// V-236 (DESIGN-BUILD-71/73): a phone's grid was capped at the screen less 16rem, a guess at what stands above it,
// so a long table's summary row sat at or below the screen's foot until the page was scrolled to its end, and a
// find's steps, which scroll only the grid, left it there. The phone's frame takes the room under it.
const longRows = () =>
  Array.from({ length: 60 }, (_, i) => ({ name: i === 1 || i === 30 || i === 59 ? `Acme ${i + 1}` : `Order ${i + 1}`, city: i % 2 ? "Leeds" : "York", amount: 100 + i }))
// The summary row's place on the screen once the grid has stood still for five frames: whether its middle is seen
// (nothing drawn over it) and how far its foot is above the screen's (negative: below it).
const sumsPlace = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ seen: boolean; clear: number }>((done) => {
        const box = document.querySelector("[data-table-grid]")
        let last = -1
        let still = 0
        const look = () => {
          const top = (box?.scrollTop ?? 0) + window.scrollY
          still = top === last ? still + 1 : 0
          last = top
          if (still < 5) return void requestAnimationFrame(look)
          const foot = box?.querySelector("tfoot")
          const r = foot?.getBoundingClientRect()
          if (!foot || !r) return done({ seen: false, clear: -1e6 })
          const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 120), r.top + r.height / 2)
          done({ seen: !!hit && foot.contains(hit), clear: Math.round(window.innerHeight - r.bottom) })
        }
        look()
      }),
  )

test("at 390 with touch, a long table's summary row stays on the screen as the page opens and through a find's steps", async ({ browser }, testInfo) => {
  const server = new TableServer(fields.slice(0, 3), longRows())
  const { page, close } = await server.open(browser, testInfo, SAM, DEVICES[1].options)
  await expect(cell(page, 0, "name")).toBeVisible({ timeout: 60_000 })
  await expect(page.locator("[data-table-grid] tfoot")).toBeAttached()
  const onScreen = async (when: string) => {
    const at = await sumsPlace(page)
    expect.soft(at.seen, `${when}: the summary row is seen`).toBe(true)
    expect.soft(at.clear, `${when}: the summary row ends on the screen`).toBeGreaterThanOrEqual(0)
  }
  await onScreen("as the table opens")
  await page.getByRole("button", { name: "More", exact: true }).tap()
  await page.getByRole("menuitem", { name: /^Find and replace$/ }).tap()
  const bar = page.getByRole("search", { name: "Find in this view" })
  await bar.getByRole("textbox", { name: "Find" }).fill("acme")
  await expect(bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
  await onScreen("at the first match")
  for (const status of ["2 of 3", "3 of 3"]) {
    await bar.getByRole("button", { name: "Next match" }).tap()
    await expect(bar.getByRole("status")).toHaveText(status)
    await onScreen(`at the match ${status}`)
  }
  await close()
})

// INTEGRATOR-76's wR34 FAIL (:46, at load 12-14): "?" came before the table's keys had arrived (their own
// lazy chunk), and the list, open, never took the Tables group. Here the chunk is held until the list is
// open: when it lands, the open list takes the group, first, without being closed and opened again.
for (const device of DEVICES.filter((d) => !d.phone)) {
  test(`${device.name}, a keys list opened before the table's keys arrive takes their Tables group first when they come`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows())
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), ...device.options })
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    // The keys' chunk: lib/tables/tableKeys is the only code with this row's words.
    const keysChunk = await holdChunk(page, "Set a date to today")
    await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(cell(page, 0, "name")).toBeVisible({ timeout: 60_000 })
    await expect.poll(keysChunk.asked).toBe(true)
    await page.keyboard.press("?")
    const sheet = page.locator("[data-shortcuts-dialog]")
    await expect(sheet).toBeVisible()
    await expect(sheet.locator("[data-shortcut-group]").first()).toHaveAttribute("data-shortcut-group", "Everywhere")
    await expect(sheet.locator('[data-shortcut-group="Tables"]')).toHaveCount(0)
    keysChunk.release()
    await expect(sheet.locator("[data-shortcut-group]").first()).toHaveAttribute("data-shortcut-group", "Tables")
    await expect(sheet.locator('[data-shortcut-row="Tables:Switch to another table"]')).toBeVisible()
    await keysChunk.done()
    await context.close()
  })
}
