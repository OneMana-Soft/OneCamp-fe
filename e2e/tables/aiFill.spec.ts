import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TABLES-LEAD-26: an AI column's fill took at most 200 cells, and no one
// could undo it. Now it takes the whole column in the background, asking
// first past 500 cells; the column's header shows how far it has got, with
// Stop; and when it ends, its person is offered Undo for all of it.

// Four fields, so a phone shows the grid rather than the list.
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "due", name: "Due", type: "date" },
  { id: "summary", name: "Summary", type: "text", config: { ai: { prompt: "Sum up {Notes}" } } },
]

const devices = [
  { name: "at 1280, by mouse", options: { viewport: { width: 1280, height: 900 } }, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]

for (const device of devices) {
  test(`${device.name}, a column's AI fill asks first, shows how far it has got, stops, and is undone whole`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth", notes: "Corner stand" }, { item: "Banner", notes: "Two metres" }])
    server.features = { ai: true }
    const started = { id: "f1", table_id: server.id, field_id: "summary", change_set: "cs1", total: 3200, asked: 40, filled: 40, state: "running" }
    server.fillAnswers.push(
      { filled: 0, skipped: 0, left: 0, total: 3200, more: 0, needs_confirm: true },
      { filled: 40, skipped: 0, left: 3160, total: 3200, more: 0, change_set: "cs1", fill: started },
    )
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const press = (l: Locator) => (device.touch ? l.tap() : l.click())

    await press(page.getByRole("button", { name: /^Summary, .* column\. Edit column$/ }))
    await press(page.getByRole("button", { name: "Fill with AI…" }))
    await press(page.getByRole("button", { name: "Fill column" }))
    const ask = page.getByRole("group", { name: "Confirm the fill" })
    await expect(ask).toContainText("Fill 3,200 cells with your workspace's model? That's 3,200 AI calls")
    server.aiFill = { ...started }
    await press(ask.getByRole("button", { name: "Fill 3,200 cells" }))
    await expect(page.getByText("Filling in the background").first()).toBeVisible()
    expect(server.fillAsks).toEqual([{ confirm: false }, { confirm: true }])

    // The header says how far the fill has got, and keeps up as it goes on.
    await page.keyboard.press("Escape")
    const header = page.locator('th[data-col-index="3"]')
    await expect(header.getByRole("status")).toHaveText("Filling 40 of 3,200 in Summary")
    // The name keeps the header's width; the count is in Stop's name and tip.
    await expect(header.getByText("Summary", { exact: true })).toBeVisible()
    await expect(header.getByRole("button", { name: "Stop filling Summary: 40 of 3,200 done" })).toBeVisible()
    server.aiFill = { ...started, asked: 1200, filled: 1190 }
    await expect(header.getByRole("status")).toHaveText("Filling 1,200 of 3,200 in Summary", { timeout: 20_000 })

    // Stop: the header lets go of it at once, and its person is offered Undo.
    await press(header.getByRole("button", { name: /^Stop filling Summary/ }))
    await expect(header.getByRole("status")).toHaveCount(0)
    await expect(page.getByText("AI fill stopped").first()).toBeVisible()
    await expect(page.getByText("Filled 1,190 cells, skipped 10; 2,000 left unfilled.").first()).toBeVisible()
    await press(page.getByRole("button", { name: "Undo fill" }).first())
    await expect.poll(() => server.undos).toEqual(["cs1"])
    await sam.close()
  })
}
