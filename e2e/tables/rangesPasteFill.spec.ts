import { expect, test, type Locator, type Page } from "@playwright/test"

import { finger } from "../finger"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables G1 (gsheets-grid-01, airtable-04): a block of the grid's cells.
// Shift+arrows, a mouse's drag and a finger's long press make one; Ctrl+C
// copies it as Sheets and Excel read it; Ctrl+V pastes a block over it as ONE
// batch that one Ctrl+Z takes back, and says which cells the server refused
// and why, with "Paste the rest"; the square at its corner fills a series.

const SHOTS = process.env.SHOTS_DIR
const FIELDS = [
  { id: "item", name: "Item", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
  { id: "due", name: "Due", type: "date" },
  { id: "note", name: "Note", type: "text" },
]
const day = (d: number) => `2026-11-0${d}`
/** Six rows: Line 1 to Line 6, amounts 1 to 6, due 1 to 6 November. */
const sixRows = () => Array.from({ length: 6 }, (_, i) => ({ item: `Line ${i + 1}`, amount: i + 1, due: day(i + 1), note: `n${i + 1}` }))

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const CLIPBOARD = { permissions: ["clipboard-read", "clipboard-write"] }

const cell = (page: Page, at: string) => page.locator(`[data-cell="${at}"]`).first()
const td = (page: Page, at: string) => page.locator(`tbody td[data-field]:has([data-cell="${at}"])`).first()
const toast = (page: Page, text: string | RegExp) => page.locator(".toast-root", { hasText: text })

/**
 * The keys reach a cell at rest: a press on a first column's cell, then the
 * arrows. The pressed cell comes to life (its text box takes the arrows as a
 * caret's), so the press is on the row beside the target's and the arrows
 * never come back through it. The press lands where a pointer does: on the
 * cell, which on a touch screen opens the box a tap can't reach at rest.
 */
async function reach(page: Page, row: number, col: number, phone = false) {
  const from = row === 0 ? 1 : 0
  const start = td(page, `${from}:0`)
  await (phone ? start.tap() : start.click())
  await expect(cell(page, `${from}:0`)).toBeFocused()
  for (let r = from; r > row; r--) await page.keyboard.press("ArrowUp")
  for (let r = from; r < row; r++) await page.keyboard.press("ArrowDown")
  for (let c = 0; c < col; c++) await page.keyboard.press("ArrowRight")
  await expect(cell(page, `${row}:${col}`)).toBeFocused()
}

/** The range's box covers exactly these cells (corner to corner), within a pixel. */
async function covers(page: Page, from: string, to: string) {
  const overlay = page.locator("[data-cell-range]")
  await expect(overlay).toHaveAttribute("data-on", "true")
  const box = (await overlay.locator("[data-range-box]").boundingBox())!
  const a = (await td(page, from).boundingBox())!
  const b = (await td(page, to).boundingBox())!
  expect(Math.abs(box.x - a.x), "left edge").toBeLessThanOrEqual(1.5)
  expect(Math.abs(box.y - a.y), "top edge").toBeLessThanOrEqual(1.5)
  expect(Math.abs(box.x + box.width - (b.x + b.width)), "right edge").toBeLessThanOrEqual(1.5)
  expect(Math.abs(box.y + box.height - (b.y + b.height)), "bottom edge").toBeLessThanOrEqual(1.5)
}

const center = async (l: Locator) => {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const phone of [false, true]) {
  const at = phone ? "390 with touch" : "1280"

  test(`at ${at}, Shift+arrows select a block, Ctrl+C copies it as Sheets reads it, Ctrl+V pastes it at the last row as one batch that adds rows, and one Ctrl+Z takes it all back`, async ({ browser }, testInfo) => {
    const server = new TableServer(FIELDS, sixRows())
    const sam = await server.open(browser, testInfo, SAM, { ...(phone ? PHONE : {}), ...CLIPBOARD })
    const page = sam.page
    await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })

    // B2:C4: Amount and Due of rows 2 to 4.
    await reach(page, 1, 1, phone)
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowRight")
    await covers(page, "1:1", "3:2")
    // The focus stays on the range's first cell.
    await expect(cell(page, "1:1")).toBeFocused()
    await expect(page.locator("[role=status]", { hasText: "6 cells selected" })).toHaveCount(1)
    // A cell at rest paints no selection, alone or in a range: its text is selected only so Ctrl+C copies it (DB-57).
    // Soft, so one run also reaches the ring's check below.
    expect.soft(await cell(page, "1:1").evaluate((el) => getComputedStyle(el, "::selection").backgroundColor), "a cell at rest paints no selection").toBe("rgba(0, 0, 0, 0)")
    // The focus's ring, on a cell scrolled under the frozen column, goes under it as the range does (DB-57). The ring
    // takes no pointer, so the probe lifts that for one look: what's on top where the ring crosses its row's frozen cell.
    const ringOverFrozen = await page.evaluate(() => {
      const ring = document.querySelector<HTMLElement>("[data-cell-ring]")
      const frozen = document.querySelector('[data-cell="1:1"]')?.closest("tr")?.querySelector<HTMLElement>("[data-frozen]")
      if (!ring || !frozen) return "missing"
      const a = ring.getBoundingClientRect()
      const b = frozen.getBoundingClientRect()
      const [left, right, top, bottom] = [Math.max(a.left, b.left), Math.min(a.right, b.right), Math.max(a.top, b.top), Math.min(a.bottom, b.bottom)]
      if (right - left < 4 || bottom - top < 4) return "apart"
      ring.style.pointerEvents = "auto"
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      ring.style.pointerEvents = ""
      return hit === ring ? "ring on top" : "frozen on top"
    })
    // At 390, Shift+Right brings the third column into view and takes the anchor under the frozen column.
    if (phone) expect(ringOverFrozen, "the anchor's ring goes under the frozen column").toBe("frozen on top")
    else expect(ringOverFrozen, "the anchor's ring never covers the frozen column").not.toBe("ring on top")
    await shoot(page, `range-${at}`)

    await page.keyboard.press("ControlOrMeta+C")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`2\t${day(2)}\n3\t${day(3)}\n4\t${day(4)}`)

    // Escape: the range is its first cell again; then down to the last row.
    await page.keyboard.press("Escape")
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown")
    await expect(cell(page, "5:1")).toBeFocused()
    await page.keyboard.press("ControlOrMeta+V")

    // One batch: the last row's two cells, and two new rows.
    await expect.poll(() => server.batches.length, { timeout: 15_000 }).toBe(1)
    const sent = server.batches[0] as { kind: string; patch?: { row: string; values: Record<string, unknown> }[]; create?: { values: Record<string, unknown> }[] }
    expect(sent.kind).toBe("paste")
    expect(sent.patch).toEqual([{ row: server.rows[5].id, values: { amount: "2", due: day(2) } }])
    expect(sent.create).toEqual([{ values: { amount: "3", due: day(3) } }, { values: { amount: "4", due: day(4) } }])
    expect(server.rows).toHaveLength(8)
    await expect(toast(page, "Pasted 6 cells")).toBeVisible()
    await expect(cell(page, "7:1")).toBeVisible({ timeout: 15_000 })
    await covers(page, "5:1", "7:2")

    // One Ctrl+Z takes the whole paste back: the last row as it was, the new rows gone.
    await cell(page, "5:1").focus()
    await page.keyboard.press("ControlOrMeta+Z")
    await expect.poll(() => server.rows.length, { timeout: 15_000 }).toBe(6)
    expect(server.rows[5].values).toMatchObject({ amount: 6, due: day(6) })
    await expect(cell(page, "6:0")).toHaveCount(0, { timeout: 15_000 })
    await sam.close()
  })
}

test("at 1280, a text cell keeps its ring on top, at rest and while its lines grow, and shows its fill handle whole", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, sixRows())
  const sam = await server.open(browser, testInfo, SAM)
  const page = sam.page
  await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })
  // What's on top: at the ring's middle (its pointer lifted for one look), or at the fill handle's corner inside the cell.
  const onTop = (what: "ring" | "handle") =>
    page.evaluate((what) => {
      const ring = document.querySelector<HTMLElement>("[data-cell-ring]")
      const el = what === "ring" ? ring : document.querySelector<HTMLElement>("[data-fill-handle]")
      if (!el || ring?.dataset.on !== "true") return "missing"
      const r = el.getBoundingClientRect()
      const [x, y] = what === "ring" ? [r.left + r.width / 2, r.top + r.height / 2] : [r.left + 2, r.top + 2]
      if (what === "ring") el.style.pointerEvents = "auto"
      const hit = document.elementFromPoint(x, y)
      if (what === "ring") el.style.pointerEvents = ""
      return hit && el.contains(hit) ? `${what} on top` : "the cell on top"
    }, what)

  // Note is a text cell, focused at rest: the ring and the whole fill handle stay on top of it, as on any cell.
  await reach(page, 0, 3)
  await expect(page.locator("[data-fill-handle]")).toBeVisible()
  await expect.poll(() => onTop("ring"), { message: "a text cell at rest keeps its ring on top" }).toBe("ring on top")
  await expect.poll(() => onTop("handle"), { message: "a text cell at rest shows its fill handle whole" }).toBe("handle on top")

  // Typed into, with two more lines, its text area grows over the rows below, and the ring stays on top of it.
  await page.keyboard.type("a")
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.type("b")
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.type("c")
  await expect(page.locator("tbody textarea[data-grown]")).toHaveCount(1)
  await expect.poll(() => onTop("ring"), { message: "a grown text area keeps its ring on top" }).toBe("ring on top")
  await page.keyboard.press("Escape")
  await sam.close()
})

test("at 1280, a pasted block with a cell the server refuses says which and why, and Paste the rest sends the others", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, sixRows())
  const sam = await server.open(browser, testInfo, SAM, CLIPBOARD)
  const page = sam.page
  await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })
  await reach(page, 0, 1)
  await page.evaluate(() => navigator.clipboard.writeText("7\nabc\n9"))
  await page.keyboard.press("ControlOrMeta+V")

  const refused = toast(page, "1 cell can't be pasted")
  await expect(refused).toBeVisible({ timeout: 15_000 })
  await expect(refused).toContainText(`Row 2, Amount: "abc" isn't a number`)
  expect(server.rows.map((r) => r.values.amount)).toEqual([1, 2, 3, 4, 5, 6])
  await shoot(page, "paste-refused-1280")

  await refused.getByRole("button", { name: "Paste the rest" }).click()
  await expect.poll(() => server.batches.length, { timeout: 15_000 }).toBe(2)
  expect((server.batches[1] as { patch: { row: string }[] }).patch.map((p) => p.row)).toEqual([server.rows[0].id, server.rows[2].id])
  expect(server.rows.map((r) => r.values.amount)).toEqual([7, 2, 9, 4, 5, 6])
  await expect(toast(page, "Pasted 2 cells")).toBeVisible()
  await sam.close()
})

test("at 1280, the fill handle continues 10, 20 down to 30, 40, 50, and a date a day at a time", async ({ browser }, testInfo) => {
  const rows = sixRows().map((r, i) => ({ ...r, amount: i < 2 ? (i + 1) * 10 : null, due: i === 0 ? day(1) : null }))
  const server = new TableServer(FIELDS, rows)
  const sam = await server.open(browser, testInfo, SAM)
  const page = sam.page
  await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })

  await reach(page, 0, 1)
  await page.keyboard.press("Shift+ArrowDown")
  await covers(page, "0:1", "1:1")
  const handle = page.locator("[data-fill-handle]")
  await expect(handle).toBeVisible()
  const from = await center(handle)
  const to = await center(td(page, "4:1"))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await expect(page.locator("[data-cell-range]")).toHaveAttribute("data-filling", "true")
  await page.mouse.up()

  await expect.poll(() => server.batches.length, { timeout: 15_000 }).toBe(1)
  expect((server.batches[0] as { kind: string }).kind).toBe("fill")
  expect(server.rows.map((r) => r.values.amount)).toEqual([10, 20, 30, 40, 50, null])
  await expect(toast(page, "Filled 3 cells")).toBeVisible()
  await covers(page, "0:1", "4:1")

  // Due: one date steps a day.
  await reach(page, 0, 2)
  const dayFrom = await center(handle)
  const dayTo = await center(td(page, "1:2"))
  await page.mouse.move(dayFrom.x, dayFrom.y)
  await page.mouse.down()
  await page.mouse.move(dayTo.x, dayTo.y, { steps: 6 })
  await page.mouse.up()
  await expect.poll(() => server.batches.length, { timeout: 15_000 }).toBe(2)
  expect(server.rows[1].values.due).toBe(day(2))
  await sam.close()
})

test("at 1280, someone who can only view the table hears why their paste wasn't written", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, sixRows())
  server.batchForbidden = true
  const sam = await server.open(browser, testInfo, SAM, CLIPBOARD)
  const page = sam.page
  await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })
  await reach(page, 1, 1)
  await page.keyboard.press("Shift+ArrowDown")
  await page.evaluate(() => navigator.clipboard.writeText("8\n9"))
  await page.keyboard.press("ControlOrMeta+V")
  await expect(toast(page, "You can view this table, not change it")).toBeVisible({ timeout: 15_000 })
  expect(server.rows.map((r) => r.values.amount)).toEqual([1, 2, 3, 4, 5, 6])
  await sam.close()
})

test("at 390 with touch, a long press on a cell starts a range, and the finger's drag grows it", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, sixRows())
  const sam = await server.open(browser, testInfo, SAM, PHONE)
  const page = sam.page
  await expect(cell(page, "5:0")).toBeVisible({ timeout: 30_000 })
  const hand = await finger(page)
  const a = await center(td(page, "1:1"))
  const b = await center(td(page, "3:1"))
  await hand.down(a.x, a.y)
  await page.waitForTimeout(700)
  await expect(page.locator("[data-cell-range]")).toHaveAttribute("data-on", "true")
  await covers(page, "1:1", "1:1")
  for (let i = 1; i <= 6; i++) await hand.move(a.x, a.y + ((b.y - a.y) * i) / 6)
  await hand.up()
  await covers(page, "1:1", "3:1")
  // Its handle is a finger's size, and nothing scrolled under the drag.
  const handle = (await page.locator("[data-fill-handle]").boundingBox())!
  expect(handle.width).toBeGreaterThanOrEqual(16)
  await shoot(page, "range-long-press-390")
  await sam.close()
})
