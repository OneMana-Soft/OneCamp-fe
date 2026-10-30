import { expect, test, type Locator, type Page } from "@playwright/test"

import { edgesOf } from "../boxes"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// No floating panel touches the window's edge (DB-29, from airtable-02's
// rollup settings): the shared PopoverContent keeps 16 px from every edge it
// would collide with, as cellPickers already did, unless its caller says
// otherwise. At 1280 the column menu of the last column in view, and the
// rollup settings it opens, sit inside the window by 16 px; the Filter
// popover, far from an edge, stays where it was. At 390 with touch both open
// as sheets, as before. With SHOTS_DIR set, each is shot for the before and
// after review (a date picker's are recordingDates.spec.ts's).

const VENDORS = "7d1e6b2f-3c4d-4e5f-9a0b-1c2d3e4f5a6b"
const EDGE = 16

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "tax", name: "With tax", type: "formula", config: { formula: "{Cost} * 1.18", result: "number", format: { currency: "INR", decimals: 2 } } },
  { id: "took", name: "Took", type: "formula", config: { formula: "{Hours} * 3600", result: "number", format: { duration: "h:mm" } } },
  { id: "vendor", name: "Vendor", type: "relation", config: { relation_target: "table", table_id: VENDORS, table_name: "Vendors" } },
  { id: "spend", name: "Spend", type: "rollup", config: { relation: "vendor", field: "vamt", aggregate: "sum", result: "number", format: { currency: "INR" } } },
]
const acme = [{ id: "a0000000-0000-4000-8000-000000000001", type: "row", label: "Acme", table_id: VENDORS }]

function server() {
  const s = new TableServer(fields, [
    { item: "Booth", cost: 1000, tax: 1180, took: 5400, vendor: acme, spend: 2500 },
    { item: "Banners", cost: 250, tax: 295, took: 2700, vendor: acme, spend: 2500 },
  ])
  s.linked.set(VENDORS, [
    { id: "vname", name: "Name", type: "text" },
    { id: "vamt", name: "Amount", type: "number" },
    { id: "vdate", name: "Ordered", type: "date" },
  ])
  return s
}

/** The floating panel open now (the shared PopoverContent's). */
const openPanel = (page: Page) => page.locator('[data-overlay="float"][data-state="open"]').last()

async function shoot(page: Page, name: string) {
  if (!process.env.SHOTS_DIR) return
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}-${colorScheme}.png`, animations: "disabled" })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** The panel within the window by at least inset px each side, and its foot inside it (e2e/boxes edgesOf). */
async function inside(panel: Locator, inset: number) {
  const edges = await edgesOf(panel)
  expect(edges.left, "its left edge").toBeGreaterThanOrEqual(inset)
  expect(edges.right, "its right edge").toBeGreaterThanOrEqual(inset)
  expect(edges.bottom, "its foot").toBeGreaterThanOrEqual(0)
  return JSON.stringify(edges)
}

test("at 1280, the last column's menu and the rollup settings it opens keep 16 px from the window's edge", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 720 } })
  await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole("button", { name: /^Spend, .* column\. Edit column$/ }).click()
  await expect(page.getByRole("button", { name: "Rollup", exact: true })).toBeVisible()
  await shoot(page, "popover-column-menu-1280")
  testInfo.annotations.push({ type: "column menu", description: await inside(openPanel(page), EDGE) })
  await page.getByRole("button", { name: "Rollup", exact: true }).click()
  await expect(page.getByRole("button", { name: "Save rollup" })).toBeInViewport({ ratio: 1 })
  await shoot(page, "popover-rollup-settings-1280")
  testInfo.annotations.push({ type: "rollup settings", description: await inside(openPanel(page), EDGE) })
  await close()
})

test("at 1280, the Filter popover, far from an edge, opens under its button as before", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 720 } })
  await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
  const button = page.getByRole("button", { name: "Filter", exact: true })
  await button.click()
  const panel = openPanel(page)
  await expect(panel).toBeVisible()
  await shoot(page, "popover-filter-1280")
  const [b, p] = [(await button.boundingBox())!, (await panel.boundingBox())!]
  // Below its button and over it: nothing about it collides, so nothing moves (the before and after shots).
  expect(p.y, "the panel opens below its button").toBeGreaterThanOrEqual(b.y + b.height)
  expect(p.x <= b.x + b.width && p.x + p.width >= b.x, "the panel sits over its button").toBe(true)
  testInfo.annotations.push({ type: "filter", description: await inside(panel, EDGE) })
  await close()
})

test("at 390 with touch, the column menu and the Filter popover open as sheets within the screen", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  // The grid on a phone, for its columns' menus.
  await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), s.id)
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole("button", { name: /^Cost, .* column\. Edit column$/ }).tap()
  // A number column's menu: no Rollup in it (the rollup column's own menu has that, at 1280).
  await expect(openPanel(page).getByText("Sort ascending")).toBeVisible()
  await shoot(page, "popover-column-menu-390")
  testInfo.annotations.push({ type: "column menu", description: await inside(openPanel(page), 0) })
  await page.keyboard.press("Escape")
  await expect(openPanel(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Filter", exact: true }).tap()
  await expect(openPanel(page)).toBeVisible()
  await shoot(page, "popover-filter-390")
  testInfo.annotations.push({ type: "filter", description: await inside(openPanel(page), 0) })
  await close()
})
