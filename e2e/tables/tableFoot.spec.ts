import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// DB-23's must (27 Oct, live at 1280x900): on a tall table the line under the
// grid, "+ New row", was cut in half at the card's foot or fell below it, and
// the summary bar with it. The grid's body took a height guessed from what
// stands above it (the screen less 16rem), and a notice over the page or a
// toolbar on two lines made the guess too tall. Now the body takes the height
// left under the toolbar, so what is under it ends inside the card whatever
// stands above, and on every view that shares the frame.

const SHOTS = process.env.SHOTS_DIR
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "due", name: "Due", type: "date" },
]
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ item: `Line ${i}`, stage: i % 2 ? "Done" : "To do", cost: i * 10, due: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` }))
// A grouped, sorted view with nested filters: its chips, its count and the toolbar's actions run to two lines at 1280.
const RULES = {
  sort: [{ field: "cost", dir: "desc" }],
  filters: [
    { field: "item", op: "contains", value: "Line" },
    { field: "cost", op: "gte", value: "0" },
    { match: "any", filters: [{ field: "stage", op: "is", value: "To do" }, { field: "item", op: "contains", value: "1" }] },
  ],
  match: "all",
  groups: [{ field: "stage", dir: "asc" }],
}

/** A notice over the page, one line as the demo's note is: in the sheet's column, above its scroller. */
const addNotice = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.querySelector("[data-main-sheet]")
    const scroller = sheet?.querySelector(":scope > [data-split-view]")
    if (!sheet || !scroller) throw new Error("no sheet to put a notice in")
    const note = document.createElement("div")
    note.setAttribute("data-test-notice", "")
    note.style.cssText = "flex: none; height: 44px; padding: 12px 24px"
    note.textContent = "A notice over the page, as tall as the demo's"
    sheet.insertBefore(note, scroller)
  })

/** How a box sits in the card: where it ends against the card's foot, and whether the point at its middle is it (not clipped or covered). */
async function inCard(page: Page, target: Locator) {
  const card = await page.locator("[data-main-sheet]").boundingBox()
  const box = await target.boundingBox()
  if (!card || !box) throw new Error("no box")
  const hit = await target.evaluate((el, [x, y]) => {
    const at = document.elementFromPoint(x, y)
    return !!at && (el === at || el.contains(at))
  }, [box.x + box.width / 2, box.y + box.height / 2] as const)
  return { over: Math.round(box.y + box.height - (card.y + card.height)), hit, bottom: Math.round(box.y + box.height), foot: Math.round(card.y + card.height) }
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

for (const [width, height] of [
  [1280, 900],
  [1280, 720],
] as const) {
  for (const notice of [false, true]) {
    const name = `${width}x${height}${notice ? ", under a notice" : ""}`
    test(`at ${name}, a tall grouped table's summary bar and "+ New row" end inside the card`, async ({ browser }, testInfo) => {
      const server = new TableServer(fields, rowsOf(300))
      const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width, height } })
      await page.evaluate(([id, rules]) => localStorage.setItem(`onecamp:tableView:${id}`, JSON.stringify(rules)), [server.id, RULES] as const)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(page.locator("tbody tr[data-group-header]").first()).toBeVisible({ timeout: 60_000 })
      const bar = page.locator("tr[data-summary-bar]")
      await expect(bar).toBeVisible({ timeout: 30_000 })
      if (notice) await addNotice(page)
      const toolbar = await page.locator("[data-table-toolbar]").first().boundingBox()
      const newRow = page.locator("[data-new-row]")
      const row = await inCard(page, newRow)
      const sums = await inCard(page, bar)
      console.log(`TABLE-FOOT ${name}: toolbar ${Math.round(toolbar?.height ?? 0)} px; New row ends ${row.bottom} against the foot ${row.foot} (${row.over} over, hit ${row.hit}); summary bar ${sums.over} over, hit ${sums.hit}`)
      expect(toolbar!.height, "the toolbar runs to two lines").toBeGreaterThan(60)
      expect(row.over, "New row ends inside the card").toBeLessThanOrEqual(0)
      expect(row.hit, "the point at New row's middle is New row").toBe(true)
      expect(sums.over, "the summary bar ends inside the card").toBeLessThanOrEqual(0)
      expect(sums.hit, "the point at the summary bar's middle is the bar").toBe(true)
      // The grid's rows scroll above the line, never under it.
      const body = await page.locator("[data-table-grid]").boundingBox()
      const line = await newRow.boundingBox()
      expect(Math.round(body!.y + body!.height)).toBeLessThanOrEqual(Math.round(line!.y))
      await shoot(page, `tableFoot-${width}x${height}${notice ? "-notice" : ""}`)
      if (notice) {
        // A row selected: its bar floats on the New row line, under the summary bar (DB-23), and takes none of the rows' height.
        const bodyBefore = await page.locator("[data-table-grid]").boundingBox()
        const first = page.locator("tbody tr[data-row]").first()
        await first.hover()
        await first.getByRole("checkbox", { name: /^Select row / }).click()
        const selected = page.getByRole("toolbar", { name: "Selected rows" })
        await expect(selected).toBeVisible({ timeout: 30_000 })
        const floats = await inCard(page, selected)
        const barBox = await selected.boundingBox()
        expect(floats.over, "the selection bar ends inside the card").toBeLessThanOrEqual(0)
        expect(floats.hit, "the point at the selection bar's middle is the bar").toBe(true)
        const mid = barBox!.y + barBox!.height / 2
        expect(mid, "the selection bar sits on the New row line").toBeGreaterThanOrEqual(line!.y)
        expect(mid, "the selection bar sits on the New row line").toBeLessThanOrEqual(line!.y + line!.height)
        const sumsBox = (await bar.boundingBox())!
        expect(Math.round(barBox!.y), "the selection bar hides no sum").toBeGreaterThanOrEqual(Math.round(sumsBox.y + sumsBox.height) - 1)
        // "+ New row" is still in reach at the line's start.
        const plus = (await newRow.locator("svg").first().boundingBox())!
        const plusHit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-new-row]"), [plus.x + plus.width / 2, plus.y + plus.height / 2] as const)
        expect(plusHit, "the point at New row's plus is New row").toBe(true)
        expect((await page.locator("[data-table-grid]").boundingBox())!.height).toBe(bodyBefore!.height)
        await shoot(page, `tableFoot-${width}x${height}-notice-selected`)
      }
      await close()
    })
  }
}

test("at 1280x900, a short table's \"+ New row\" sits right under its last row", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(4))
  const { page, close } = await server.open(browser, testInfo, SAM)
  const rows = page.locator("tbody tr[data-row]")
  await expect(rows).toHaveCount(4, { timeout: 60_000 })
  const last = await rows.last().boundingBox()
  const line = await page.locator("[data-new-row]").boundingBox()
  // The body grows with its rows: no gap opens between the last row and the line (a summary bar of 32 px may sit between).
  expect(Math.round(line!.y - (last!.y + last!.height))).toBeLessThanOrEqual(34)
  await shoot(page, "tableFoot-1280x900-short")
  await close()
})

for (const [view, box] of [
  ["Board", "[data-table-board]"],
  ["Calendar", "[data-table-calendar]"],
] as const) {
  test(`at 1280x720 under a notice, a tall ${view.toLowerCase()} scrolls inside the card`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 720 } })
    await page.getByRole("group", { name: "View", exact: true }).getByRole("button", { name: view, exact: true }).click()
    const body = page.locator(box)
    await expect(body).toBeVisible({ timeout: 60_000 })
    await addNotice(page)
    const at = await inCard(page, body)
    console.log(`TABLE-FOOT ${view} 1280x720, under a notice: ends ${at.bottom} against the foot ${at.foot} (${at.over} over)`)
    expect(at.over, `the ${view.toLowerCase()}'s scroll box ends inside the card`).toBeLessThanOrEqual(0)
    if (view === "Board") expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight), "the board scrolls inside its box").toBe(true)
    await shoot(page, `tableFoot-${view.toLowerCase()}-1280x720-notice`)
    await close()
  })
}

// A4 (29 Oct, the live walk): on a phone the New row line sat under the
// screen's foot, so a row's selection bar stuck to the foot instead, 7 px over
// the summary bar's sums. On a phone it keeps 8 px over the summary bar,
// wherever the page is scrolled, in either theme.
for (const theme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${theme}, a row selected: its bar keeps 8 px over the summary bar`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: theme })
    // Six fields: a phone would show the list; this reader keeps the grid.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    const first = page.locator("tbody tr[data-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    const sums = page.locator("tr[data-summary-bar]")
    await expect(sums).toBeVisible({ timeout: 30_000 })
    await first.getByRole("checkbox", { name: /^Select row / }).tap()
    const selected = page.getByRole("toolbar", { name: "Selected rows" })
    await expect(selected).toBeVisible({ timeout: 30_000 })
    const gap = async () => {
      const s = (await selected.boundingBox())!
      const b = (await sums.boundingBox())!
      return Math.round(b.y - (s.y + s.height))
    }
    await expect.poll(gap, { message: "at the page's top, 8 px or more between the selection bar and the summary bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-${theme}`)
    // The page at its end: the New row line in sight.
    await page.locator("[data-new-row]").scrollIntoViewIfNeeded()
    await expect.poll(gap, { message: "at the page's end, 8 px or more between the selection bar and the summary bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-end-${theme}`)
    await close()
  })
}

// A4's should-fix (DB-29, 29 Oct): with a row selected, the grid scrolled to
// its end left its last row under the selection bar, its number and Stage
// hidden, and no way to scroll it clear. While the bar shows, the rows end
// with room for it, so the last row stops above the bar.
for (const theme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${theme}, a row selected: the last row scrolls clear of its bar`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: theme })
    // Six fields: a phone would show the list; this reader keeps the grid.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    const first = page.locator("tbody tr[data-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("tr[data-summary-bar]")).toBeVisible({ timeout: 30_000 })
    await first.getByRole("checkbox", { name: /^Select row / }).tap()
    const selected = page.getByRole("toolbar", { name: "Selected rows" })
    await expect(selected).toBeVisible({ timeout: 30_000 })
    // The page and the grid each at their end: the last row in sight.
    await page.locator("[data-new-row]").scrollIntoViewIfNeeded()
    const grid = page.locator("[data-table-grid]")
    const last = page.locator("tbody tr[data-row]").filter({ hasText: "Line 299" })
    await expect
      .poll(async () => {
        await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
        return last.count()
      }, { message: "the last row drawn at the grid's end" })
      .toBe(1)
    const clearance = async () => {
      await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      const r = (await last.boundingBox())!
      const s = (await selected.boundingBox())!
      return Math.round(s.y - (r.y + r.height))
    }
    await expect.poll(clearance, { message: "8 px or more between the last row and the selection bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-last-${theme}`)
    // Cleared, the rows end where they did.
    await selected.getByRole("button", { name: /^Clear/ }).tap()
    await expect(selected).toHaveCount(0)
    await expect(page.locator("tbody tr[data-float-room]")).toHaveCount(0)
    await close()
  })
}
