import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TABLES-LEAD-27 (main, 25 Oct; CR-32's SF1): the person who started a fill
// may stop it though they don't manage the table, as the server allows; one
// who neither started it nor manages the table isn't offered Stop.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "summary", name: "Summary", type: "text", config: { ai: { prompt: "Sum up {Notes}" } } },
]

for (const who of ["started it", "didn't start it"] as const) {
  test(`at 1280, a member who doesn't manage the table and ${who} ${who === "started it" ? "stops the fill" : "isn't offered Stop"}`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth", notes: "Corner stand" }])
    server.features = { ai: true }
    server.canManage = false
    const by = who === "started it" ? SAM.user_uuid : "someone-else"
    server.aiFill = { id: "f1", table_id: server.id, field_id: "summary", started_by: by, change_set: "cs1", total: 3200, asked: 1200, filled: 1190, state: "running" }
    const sam = await server.open(browser, testInfo, SAM)
    const header = sam.page.locator('th[data-col-index="2"]')
    await expect(header.getByRole("status")).toHaveText("Filling 1,200 of 3,200 in Summary", { timeout: 60_000 })
    const stop = header.getByRole("button", { name: /^Stop filling Summary/ })
    if (who === "started it") {
      await stop.click()
      await expect.poll(() => server.aiFill?.state).toBe("stopped")
      await expect(header.getByRole("status")).toHaveCount(0)
    } else {
      await expect(stop).toHaveCount(0)
    }
    await sam.close()
  })
}
