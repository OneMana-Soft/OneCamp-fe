import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A link cell's face at rest (relationFace) is a chunk of its own, asked for
// only by a table with link fields, so no table's first screen carries it.
// While it's on its way, each link cell holds its place, a linked one with a
// pill where its chips will be: nothing in the row moves when its chips come,
// and a rollup over the link is drawn at once.
// With SHOTS_DIR set, it saves the grid waiting and drawn, at 1280 and at 390
// with touch, light and dark, for the design review.

const SHOTS = process.env.SHOTS_DIR
const VENDORS = "7d1e6b2f-3c4d-4e5f-9a0b-1c2d3e4f5a6b"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "vendor", name: "Vendor", type: "relation", config: { relation_target: "table", table_id: VENDORS, table_name: "Vendors" } },
  { id: "spend", name: "Spend", type: "rollup", config: { relation: "vendor", field: "vamt", aggregate: "sum", result: "number", format: { currency: "INR" } } },
]
const acme = [{ id: "a0000000-0000-4000-8000-000000000001", type: "row", label: "Acme", table_id: VENDORS }]
const rows = [{ item: "Booth", vendor: acme, spend: 2500 }, { item: "Banners", vendor: acme, spend: 2500 }, { item: "Power" }]

/**
 * Holds every script that draws link chips (only relationFace's markup names
 * data-relation-hidden) until released; every other file goes at once. Routed,
 * the page's files skip the browser's cache, so a reload asks for them again.
 */
async function holdLinkFaces(page: Page) {
  let release = () => {}
  const released = new Promise<void>((r) => (release = r))
  let held = 0
  await page.route(/\/_next\/static\/chunks\/[^?]+\.js(\?.*)?$/, async (route) => {
    const res = await route.fetch()
    const body = await res.text()
    if (body.includes("data-relation-hidden")) {
      held++
      await released
    }
    await route.fulfill({ response: res, body })
  })
  return { release, held: () => held }
}

async function shootThemes(page: Page, name: string) {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

const boxOf = async (target: Locator) => {
  const b = await target.boundingBox()
  if (!b) throw new Error("no box")
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
}

for (const phone of [false, true]) {
  const at = phone ? "390" : "1280"
  test(`at ${phone ? "390 with touch" : "1280"}, a link cell holds its place while its face loads, and nothing moves when its chips come`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows)
    server.linked.set(VENDORS, [{ id: "vamt", name: "Amount", type: "number" }])
    const { page, close } = await server.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    const hold = await holdLinkFaces(page)
    await page.reload({ waitUntil: "domcontentloaded" })
    const first = page.locator("tbody tr[data-row]").first()
    const link = first.locator('td[data-field="vendor"]')
    const rollup = first.locator('td[data-field="spend"]')
    await expect(first).toContainText("Booth", { timeout: 60_000 })
    // The rollup over the link is drawn at once; the link cell waits, empty, in its place.
    await expect(rollup).toContainText("₹2,500")
    await expect.poll(hold.held, { timeout: 30_000 }).toBeGreaterThan(0)
    await expect(link.locator("[data-cell]")).toHaveCount(1)
    await expect(page.locator("[data-relation-chip]")).toHaveCount(0)
    // A linked cell shows a pill where its chips will be, so it never reads as unlinked; an unlinked one stays empty (DB-29).
    await expect(link.locator("[data-relation-wait]")).toHaveCount(1)
    await expect(page.locator("tbody tr[data-row]").nth(2).locator('td[data-field="vendor"] [data-relation-wait]')).toHaveCount(0)
    const waiting = { row: await boxOf(first), link: await boxOf(link), rollup: await boxOf(rollup) }
    await shootThemes(page, `link-faces-waiting-${at}`)

    hold.release()
    await expect(link.locator("[data-relation-chip]")).toContainText("Acme", { timeout: 30_000 })
    await expect(page.locator("[data-relation-wait]")).toHaveCount(0)
    expect({ row: await boxOf(first), link: await boxOf(link), rollup: await boxOf(rollup) }).toEqual(waiting)
    await shootThemes(page, `link-faces-drawn-${at}`)
    await close()
  })
}
