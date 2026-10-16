import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-2: a table past 500 rows. A new row's place was worked out from the
// rows the page held, so it went after the 500th, where the page never
// looked, and never appeared. The server now puts it last, and the page reads
// through to it and gives it the focus.
test("past 500 rows, a new row goes last and takes the focus", async ({ browser }, testInfo) => {
  const server = new TableServer([{ id: "item", name: "Item", type: "text" }], Array.from({ length: 1200 }, (_, i) => ({ item: `Line ${i}` })))
  const sam = await server.open(browser, testInfo, SAM)
  await expect(sam.page.locator("[data-rows-shown]")).toHaveText("Showing 500 of 1,200 rows · Load all", { timeout: 30_000 })

  await sam.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await sam.page.keyboard.press("r")

  await expect.poll(() => server.writes.filter((w) => w.kind === "create").length, { timeout: 15_000 }).toBe(1)
  expect(server.writes.find((w) => w.kind === "create")!.body).not.toHaveProperty("position")
  // The new row is the table's 1,201st, read through to, with the focus in its first cell.
  await expect(sam.page.locator('[data-cell="1200:0"]')).toBeFocused({ timeout: 30_000 })
  await expect(sam.page.locator("[data-rows-shown]")).toHaveCount(0)

  await sam.close()
})
