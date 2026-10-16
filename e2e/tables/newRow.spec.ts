import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-14: a new row was added out of sight, below the last row on screen,
// and nothing took you to it, so R seemed to do nothing and people pressed it
// again. Now it comes into sight wherever it's added.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
  { id: "notes", name: "Notes", type: "text" },
]
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ item: `Line ${i}`, stage: "To do" }))

// 1,200 rows: past the 500 the page first holds, so the page reads through to the new row.
for (const n of [300, 1200]) {
  test(`R on a ${n.toLocaleString("en-GB")}-row table focuses the new row's first cell, ready to type`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(n))
    const sam = await server.open(browser, testInfo, SAM)
    await expect(sam.page.locator('[data-cell="0:0"]')).toBeAttached({ timeout: 30_000 })
    await sam.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await sam.page.keyboard.press("r")
    const first = sam.page.locator(`[data-cell="${n}:0"]`)
    await expect(first).toBeFocused({ timeout: 30_000 })
    await expect(first).toBeInViewport()
    await sam.page.keyboard.type("Fresh lead")
    await sam.page.keyboard.press("Tab")
    await expect.poll(() => server.valuesOf(n).item, { timeout: 15_000 }).toBe("Fresh lead")
    expect(server.writes.filter((w) => w.kind === "create")).toHaveLength(1)
    await sam.close()
  })
}

test("a new row the view's filter would hide stays in sight, marked, until you move on", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(40))
  const sam = await server.open(browser, testInfo, SAM)
  // This reader's filter: rows whose Item has "Line" (a new row's is empty).
  await sam.page.evaluate((id) => localStorage.setItem(`onecamp:tableView:${id}`, JSON.stringify({ sort: [], filters: [{ field: "item", op: "contains", value: "Line" }], match: "all" })), server.id)
  await sam.page.reload({ waitUntil: "domcontentloaded" })
  await expect(sam.page.locator('[data-cell="0:0"]')).toBeAttached({ timeout: 30_000 })
  await sam.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await sam.page.keyboard.press("r")
  const added = sam.page.locator("tr[data-marked]")
  await expect(added).toHaveCount(1, { timeout: 30_000 })
  await expect(sam.page.locator('[data-cell="40:0"]')).toBeFocused()
  // The toast (and the toaster's announcement of it) says why.
  await expect(sam.page.getByRole("status").filter({ hasText: "Hidden by the view's filter" }).first()).toBeVisible()
  await expect(added.locator("[data-gutter]")).toHaveAttribute("title", "Hidden by the view's filter")
  // Moving on to another row lets the filter have it.
  await sam.page.keyboard.press("ArrowUp")
  await expect(sam.page.locator('[data-cell="39:0"]')).toBeFocused()
  await expect(added).toHaveCount(0)
  await expect(sam.page.locator('[data-cell="40:0"]')).toHaveCount(0)
  await sam.close()
})

test("on a phone, a new row opens in its record, over the list scrolled to it", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(120))
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await expect(sam.page.locator("[data-table-list]")).toBeVisible({ timeout: 30_000 })
  await sam.page.getByRole("button", { name: "New row" }).tap()
  await expect(sam.page.locator("[data-record-panel]")).toBeVisible({ timeout: 30_000 })
  await expect(sam.page.locator('[data-table-list] li[aria-posinset="121"]')).toBeAttached()
  await sam.close()
})

test("a card added on the board opens in its record", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(12))
  const sam = await server.open(browser, testInfo, SAM)
  await sam.page.getByRole("button", { name: "Board" }).click()
  await sam.page.locator("[data-table-board]").getByRole("button", { name: "Add card" }).first().click()
  await expect(sam.page.locator("[data-record-panel]")).toBeVisible({ timeout: 30_000 })
  expect(server.valuesOf(12).stage).toBe("To do")
  await sam.close()
})
