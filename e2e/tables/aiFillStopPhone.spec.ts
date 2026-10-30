import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TABLES-LEAD-27 (main, 25 Oct; DESIGN-BUILD-15's SF): on a phone, a column
// wider than the screen put its running fill's Stop at the column's right
// edge, off screen, while the toast said "Its column shows how far, with
// Stop". A person must always be able to stop a fill on a phone: the
// column's sheet offers Stop, in view, where they open it from its name.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "due", name: "Due", type: "date" },
  { id: "summary", name: "Summary", type: "text", config: { ai: { prompt: "Sum up {Notes}" } } },
]

test("at 390, by touch, a running fill in a column wider than the phone is stopped from its column's sheet", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, [{ item: "Booth", notes: "Corner stand" }, { item: "Banner", notes: "Two metres" }])
  server.features = { ai: true }
  server.aiFill = { id: "f1", table_id: server.id, field_id: "summary", change_set: "cs1", total: 3200, asked: 1200, filled: 1190, state: "running" }
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  // The reader made Summary as wide as a column goes, wider than the phone.
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false, widths: { summary: 640 } }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const header = page.locator('th[data-col-index="3"]')
  await expect(header.getByRole("status")).toHaveText("Filling 1,200 of 3,200 in Summary", { timeout: 60_000 })

  // They scroll the grid until the column's name sits clear of the frozen
  // column, and tap the name, as a person does (its middle is off screen).
  await header.evaluate((th) => {
    let p = th.parentElement
    while (p && !(p.scrollWidth > p.clientWidth && getComputedStyle(p).overflowX !== "visible")) p = p.parentElement
    if (!p) return
    const edge = Math.max(p.getBoundingClientRect().left, ...[...(th.parentElement?.querySelectorAll("th[data-frozen]") ?? [])].map((f) => f.getBoundingClientRect().right))
    p.scrollLeft += th.getBoundingClientRect().left - edge - 4
  })
  const name = page.getByRole("button", { name: /^Summary, .* column\. Edit column$/ })
  // The header's own Stop is off screen at the column's far edge.
  await expect(header.getByRole("button", { name: /^Stop filling Summary/ })).not.toBeInViewport()
  await name.tap({ position: { x: 40, y: 18 } })
  const stop = page.getByRole("dialog").getByRole("button", { name: /^Stop filling Summary/ })
  await expect(stop).toBeInViewport()
  await expect(stop).toContainText("1,200 of 3,200 done")
  await stop.tap()
  await expect.poll(() => server.aiFill?.state).toBe("stopped")
  await expect(header.getByRole("status")).toHaveCount(0)
  await context.close()
})
