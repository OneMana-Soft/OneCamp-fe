import { expect, test, type Browser, type TestInfo } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// G2b (airtable-04, gsheets-grid-01): up to three leading columns stay put
// sideways, frozen from a column's menu, each past the widths before it, kept
// for the reader across a reload; "Unfreeze columns" goes back to the first
// alone. A phone keeps one, whatever the reader kept.

const fields = [
  { id: "name", name: "Name", type: "text" },
  { id: "where", name: "Where", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "budget", name: "Budget", type: "text" },
]
const rows = () => [
  { name: "Booth", where: "Hall A", notes: "Power and banners", owner: "Priya", budget: "1200" },
  { name: "Banner", where: "Hall B", notes: "Print by Friday", owner: "Sam", budget: "300" },
]
const widths = { name: 200, where: 180, notes: 260, owner: 260, budget: 260 }

async function open(browser: Browser, testInfo: TestInfo, device: { viewport: { width: number; height: number }; isMobile?: boolean; hasTouch?: boolean }, frozen?: number) {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...device })
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await context.addInitScript(
    ({ id, widths, frozen }) => {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // Only the first visit's: a reload keeps what the page saved since.
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1")
        localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false, widths, ...(frozen ? { frozen } : {}) }))
      }
    },
    { id: server.id, widths, frozen },
  )
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-cell="1:4"]')).toBeAttached({ timeout: 60_000 })
  const frozenHeads = page.locator("thead th[data-frozen]")
  const headX = async (i: number) => (await page.locator("thead th").nth(i + 1).boundingBox())!.x
  const menu = async (name: string) => {
    await page.getByRole("button", { name: new RegExp(`^${name}, .* column\\. Edit column$`) }).click()
    return page.locator("[data-column-menu]")
  }
  return { server, context, page, frozenHeads, headX, menu, grid: page.locator("[data-table-grid]") }
}

test("at 1280, three columns freeze from a column's menu, stay put sideways, are kept across a reload, and unfreeze", async ({ browser }, testInfo) => {
  const t = await open(browser, testInfo, { viewport: { width: 1280, height: 800 } })
  await expect(t.frozenHeads).toHaveCount(1)
  const m = await t.menu("Notes")
  await m.getByRole("button", { name: "Freeze up to here" }).click()
  await expect(t.frozenHeads).toHaveCount(3)
  await expect(t.page.locator("thead th[data-frozen-edge]")).toContainText("Notes")

  // Sideways: the three stay where they stood, each past the ones before it; the fourth goes under them.
  const before = await Promise.all([0, 1, 2, 3].map(t.headX))
  expect(before[1] - before[0]).toBeCloseTo(200, 0)
  expect(before[2] - before[1]).toBeCloseTo(180, 0)
  await t.grid.evaluate((el) => el.scrollBy(300, 0))
  await expect.poll(() => t.grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200)
  const after = await Promise.all([0, 1, 2, 3].map(t.headX))
  expect(after.slice(0, 3)).toEqual(before.slice(0, 3))
  expect(after[3]).toBeLessThan(before[3] - 200)

  // Kept for this reader: a reload draws three frozen.
  await t.page.reload({ waitUntil: "domcontentloaded" })
  await expect(t.page.locator('[data-cell="1:4"]')).toBeAttached({ timeout: 60_000 })
  await expect(t.frozenHeads).toHaveCount(3)

  // Back to the first alone, from a frozen column's menu.
  const m2 = await t.menu("Where")
  await expect(m2.getByRole("button", { name: "Freeze up to here" })).toBeVisible()
  await m2.getByRole("button", { name: "Unfreeze columns" }).click()
  await expect(t.frozenHeads).toHaveCount(1)
  await t.context.close()
})

test("at 390 by touch, a phone keeps one frozen column, whatever the reader kept, and its menus offer no freeze", async ({ browser }, testInfo) => {
  const t = await open(browser, testInfo, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 3)
  await expect(t.frozenHeads).toHaveCount(1)
  const m = await t.menu("Where")
  await expect(m.getByRole("button", { name: "Field settings" })).toBeVisible()
  await expect(m.getByRole("button", { name: "Freeze up to here" })).toHaveCount(0)
  await expect(m.getByRole("button", { name: "Unfreeze columns" })).toHaveCount(0)
  await t.context.close()
})
