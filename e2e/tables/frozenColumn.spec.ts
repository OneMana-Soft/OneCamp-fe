import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// DESIGN-BUILD-11's S3: the gutter and the frozen column stay over the cells
// scrolled under them, and at 390 a cell opened there sat half under the
// frozen column ("ding", "ge", "ners"). A cell taking the focus comes out
// beside the frozen column; a frozen cell or the gutter taking it leaves the
// grid where it is, so someone scrolled across a wide table keeps their place
// (V-59).

const fields = [
  { id: "name", name: "Name", type: "text" },
  { id: "where", name: "Where", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
]
const rows = () => [
  { name: "Booth", where: "Hall A", notes: "Power and banners", owner: "Priya" },
  { name: "Banner", where: "Hall B", notes: "Print by Friday", owner: "Sam" },
]

async function openGrid(page: Page, server: TableServer, widths: Record<string, number>) {
  await page.context().addInitScript(
    ({ id, widths }) => {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false, widths }))
    },
    { id: server.id, widths },
  )
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-cell="1:3"]')).toBeAttached({ timeout: 60_000 })
  const grid = page.locator("[data-table-grid]")
  const frozenRight = async () => {
    const b = (await page.locator("thead th[data-frozen]").boundingBox())!
    return b.x + b.width
  }
  const cellBox = async (cell: string) => (await page.locator("tbody td").filter({ has: page.locator(`[data-cell="${cell}"]`) }).boundingBox())!
  // Scrolls the grid so the cell's left half sits under the frozen column.
  const halfUnder = async (cell: string) => {
    const [box, edge] = [await cellBox(cell), await frozenRight()]
    await grid.evaluate((el, by) => el.scrollBy(by, 0), box.x + box.width / 2 - edge)
    await expect.poll(async () => (await frozenRight()) - (await cellBox(cell)).x).toBeGreaterThan(20)
  }
  const scrollLeft = () => grid.evaluate((el) => el.scrollLeft)
  return { frozenRight, cellBox, halfUnder, scrollLeft }
}

test("at 390 by touch, a cell opened under the frozen column comes out beside it", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  const g = await openGrid(page, server, { where: 200, notes: 200, owner: 200 })

  await g.halfUnder("0:2")
  const box = await g.cellBox("0:2")
  const edge = await g.frozenRight()
  // A finger on the half that shows.
  await page.touchscreen.tap(edge + (box.x + box.width - edge) / 2, box.y + box.height / 2)
  await expect(page.locator('[data-cell="0:2"]')).toBeFocused()
  await expect.poll(async () => Math.round((await g.cellBox("0:2")).x - (await g.frozenRight()))).toBeGreaterThanOrEqual(0)

  // A frozen cell opened while the grid is scrolled leaves it where it is.
  const before = await g.scrollLeft()
  expect(before).toBeGreaterThan(0)
  const name = await g.cellBox("1:0")
  await page.touchscreen.tap(name.x + name.width / 2, name.y + name.height / 2)
  await expect(page.locator('[data-cell="1:0"]')).toBeFocused()
  expect(await g.scrollLeft()).toBe(before)
  // So does a row's checkbox in the gutter.
  await page.getByRole("checkbox", { name: "Select row 1" }).tap()
  await expect(page.getByRole("checkbox", { name: "Select row 1" })).toBeChecked()
  expect(await g.scrollLeft()).toBe(before)
  await context.close()
})

test("at 1280, the keys bring a cell under the frozen column out beside it", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  const g = await openGrid(page, server, { name: 320, where: 480, notes: 480, owner: 480 })

  await page.locator('[data-cell="0:0"]').click()
  await expect(page.locator('[data-cell="0:0"]')).toBeFocused()
  await g.halfUnder("1:1")
  const before = await g.scrollLeft()
  // Down the frozen column, the grid stays where it is.
  await page.keyboard.press("ArrowDown")
  await expect(page.locator('[data-cell="1:0"]')).toBeFocused()
  expect(await g.scrollLeft()).toBe(before)
  // Across, the next cell comes out from under it. Tab goes there from a cell
  // at rest or open alike.
  await page.keyboard.press("Tab")
  await expect(page.locator('[data-cell="1:1"]')).toBeFocused()
  await expect.poll(async () => Math.round((await g.cellBox("1:1")).x - (await g.frozenRight()))).toBeGreaterThanOrEqual(0)
  // Scrolled across again, a click on a frozen cell, or on a row's checkbox,
  // leaves the grid where it is.
  await g.halfUnder("0:2")
  const across = await g.scrollLeft()
  expect(across).toBeGreaterThan(0)
  await page.locator('[data-cell="0:0"]').click()
  await expect(page.locator('[data-cell="0:0"]')).toBeFocused()
  expect(await g.scrollLeft()).toBe(across)
  await page.locator("tbody tr").first().hover()
  await page.getByRole("checkbox", { name: "Select row 1" }).click()
  await expect(page.getByRole("checkbox", { name: "Select row 1" })).toBeChecked()
  expect(await g.scrollLeft()).toBe(across)
  await context.close()
})
