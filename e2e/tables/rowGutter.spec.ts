import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A row's gutter holds its number, a checkbox for a person who may change the table, and an open button for
// anyone who may open its rows. Under the pointer the two take the number's place; a touch screen has no pointer,
// so there they always show, and the number drew under them: "1↗" at 390 (DB-26, 28 Oct). Now the number gives
// way there too. On a touch screen each control is a 24 px tap of its own (WCAG 2.5.8): the two share no pixel,
// and the open button keeps 8 px clear of the first cell, whose taps it once took (TAB-BUG-15; DB-27, 28 Oct).

// Four fields, so a phone shows the grid rather than the list.
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "stage", name: "Stage", type: "text" },
  { id: "due", name: "Due", type: "date" },
]
const rows = () => [{ item: "Booth", cost: 1200 }, { item: "Banner", cost: 300 }, { item: "Badges", cost: 90 }]
const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity))
type Box = { x: number; y: number; width: number; height: number }
const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox()
  if (!b) throw new Error("not drawn")
  return b
}
/** The control a tap at (x, y) reaches, by its label: "" when it reaches none. */
const reached = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("input, button")?.getAttribute("aria-label") ?? "", [x, y] as const)
/** 3 px inside each of a box's edges, as cellTargets.spec taps a cell. */
const insideEdges = (b: Box) => [
  { edge: "left", x: b.x + 3, y: b.y + b.height / 2 },
  { edge: "right", x: b.x + b.width - 3, y: b.y + b.height / 2 },
  { edge: "top", x: b.x + b.width / 2, y: b.y + 3 },
  { edge: "bottom", x: b.x + b.width / 2, y: b.y + b.height - 3 },
]

/** On a touch screen the open button is a 24 px tap, 8 px clear of the first cell, that opens the row from 3 px inside each edge. */
async function openTapsEveryEdge(page: Page, row: Locator, open: Locator) {
  const b = await box(open)
  const cell = await box(row.locator("td[data-field]").first())
  expect(Math.min(b.width, b.height), "the open button is a 24 px tap").toBeGreaterThanOrEqual(24)
  expect(Math.round(cell.x - (b.x + b.width)), "the open button keeps 8 px clear of the first cell").toBeGreaterThanOrEqual(8)
  const panel = page.locator("[data-record-panel]")
  for (const spot of insideEdges(b)) {
    const where = `the open button, 3 px inside its ${spot.edge} edge`
    expect(await reached(page, spot.x, spot.y), where).toMatch(/^Open row 1/)
    await page.touchscreen.tap(spot.x, spot.y)
    await expect(panel, where).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
  }
}

for (const device of [
  { name: "a desktop, by mouse", options: { viewport: { width: 1280, height: 900 } }, touch: false },
  { name: "a phone, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  test(`on ${device.name}, a row's number gives way to its checkbox and open button`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = new TableServer(fields, rows())
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const row = page.locator('tbody tr[data-index="0"]')
    const number = row.locator("td[data-gutter] .tabular-nums")
    const check = row.getByRole("checkbox", { name: "Select row 1" })
    const open = row.getByRole("button", { name: "Open row 1" })
    await expect(number).toHaveText("1", { timeout: 30_000 })
    if (device.touch) {
      // Always the checkbox and the open button, side by side; the number isn't drawn under them.
      await expect.poll(() => opacity(number)).toBe(0)
      await expect.poll(() => opacity(check)).toBe(1)
      await expect.poll(() => opacity(open)).toBe(1)
      const a = await box(check)
      const b = await box(open)
      expect(Math.round(a.x + a.width), "the checkbox ends before the open button starts").toBeLessThanOrEqual(Math.round(b.x))
      expect(Math.min(a.width, a.height), "the checkbox is a 24 px tap").toBeGreaterThanOrEqual(24)
      // Each takes a tap 3 px inside each of its edges: the checkbox ticks and unticks, the button opens the row.
      let ticked = false
      for (const spot of insideEdges(a)) {
        const where = `the checkbox, 3 px inside its ${spot.edge} edge`
        expect(await reached(page, spot.x, spot.y), where).toBe("Select row 1")
        await page.touchscreen.tap(spot.x, spot.y)
        ticked = !ticked
        await expect(check, where).toBeChecked({ checked: ticked })
      }
      await openTapsEveryEdge(page, row, open)
    } else {
      // At rest the number; under the pointer the checkbox and the open button in its place.
      await page.mouse.move(0, 0)
      await expect.poll(() => opacity(number)).toBe(1)
      await expect.poll(() => opacity(open)).toBe(0)
      await row.hover()
      await expect.poll(() => opacity(number)).toBe(0)
      await expect.poll(() => opacity(open)).toBe(1)
      await expect.poll(() => opacity(check)).toBe(1)
      const a = await box(check)
      const b = await box(open)
      expect(Math.round(a.x + a.width), "the checkbox ends before the open button starts").toBeLessThanOrEqual(Math.round(b.x))
    }
    for (const theme of SHOT_THEMES) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "rowGutter", theme)
    }
    await sam.close()
  })

  // A member who may open the table's rows but not change it: no checkbox, and the open button takes the number's
  // place as it does for a manager (DB-27, 28 Oct).
  test(`on ${device.name}, a reader's row number gives way to its open button alone`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = new TableServer(fields, rows())
    server.canManage = false
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const row = page.locator('tbody tr[data-index="0"]')
    const number = row.locator("td[data-gutter] .tabular-nums")
    const open = row.getByRole("button", { name: "Open row 1" })
    await expect(number).toHaveText("1", { timeout: 30_000 })
    await expect(row.getByRole("checkbox")).toHaveCount(0)
    if (device.touch) {
      await expect.poll(() => opacity(number)).toBe(0)
      await expect.poll(() => opacity(open)).toBe(1)
      await openTapsEveryEdge(page, row, open)
    } else {
      await page.mouse.move(0, 0)
      await expect.poll(() => opacity(number)).toBe(1)
      await expect.poll(() => opacity(open)).toBe(0)
      await row.hover()
      await expect.poll(() => opacity(number)).toBe(0)
      await expect.poll(() => opacity(open)).toBe(1)
      const b = await box(open)
      expect(await reached(page, b.x + b.width / 2, b.y + b.height / 2), "a click at the open button's middle").toMatch(/^Open row 1/)
    }
    for (const theme of SHOT_THEMES) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "rowGutter-reader", theme)
    }
    await sam.close()
  })
}
