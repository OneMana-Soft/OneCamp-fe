import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-15: a cell took a click or a tap only on its text line. A cell had
// no height of its own, so a text box was 17 px tall in a 40 px row (44 on a
// touch screen), and a click or a tap a few pixels above or below it did
// nothing. Now each cell's control fills the cell.

// Four fields, so a phone shows the grid rather than the list.
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }] } },
  { id: "due", name: "Due", type: "date" },
]
// Column, and whether the cell opens a picker (rather than taking the focus to type).
const cells = [
  { col: 0, name: "text", opens: false },
  { col: 1, name: "number", opens: false },
  { col: 2, name: "select", opens: true },
  { col: 3, name: "date", opens: true },
]

const devices = [
  { name: "a desktop, by mouse", options: { viewport: { width: 1440, height: 900 } }, touch: false },
  { name: "a phone, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]

for (const device of devices) {
  test(`on ${device.name}, a cell takes it 3 px inside each edge`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth", cost: 1200, stage: "To do", due: "2026-10-07" }, { item: "Banner" }])
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const picker = page.locator("[data-radix-popper-content-wrapper]")
    for (const cell of cells) {
      const td = page.locator('tbody tr[data-index="0"] > td[data-kind]').nth(cell.col)
      // Its right edge to the grid's: scrolled only into view, a cell can sit
      // partly under the frozen first column.
      await td.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "end" }))
      const box = await td.boundingBox()
      if (!box) throw new Error(`no ${cell.name} cell`)
      const spots = [
        { edge: "top", x: box.width / 2, y: 3 },
        { edge: "bottom", x: box.width / 2, y: box.height - 3 },
        { edge: "left", x: 3, y: box.height / 2 },
        { edge: "right", x: box.width - 3, y: box.height / 2 },
      ]
      for (const spot of spots) {
        const x = box.x + spot.x
        const y = box.y + spot.y
        if (device.touch) await page.touchscreen.tap(x, y)
        else await page.mouse.click(x, y)
        const where = `the ${cell.name} cell, 3 px inside its ${spot.edge} edge`
        if (cell.opens) {
          await expect(picker, where).toBeVisible()
          await page.keyboard.press("Escape")
          await expect(picker).toHaveCount(0)
        } else {
          await expect(td.locator("[data-cell]"), where).toBeFocused()
        }
        // Nothing focused, so the next spot starts afresh.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      }
    }
    // Nothing was typed, so nothing was saved.
    expect(server.writes).toHaveLength(0)
    if (device.touch) {
      // The gutter beside the first cell still opens the row, and still selects it.
      await page.getByRole("checkbox", { name: "Select row 1" }).tap()
      await expect(page.getByRole("checkbox", { name: "Select row 1" })).toBeChecked()
      await page.getByRole("button", { name: "Open row 1" }).tap()
      await expect(page.locator("[data-record-panel]")).toBeVisible()
    }
    await sam.close()
  })
}

// A checkbox cell took a click or a tap only on its 16 px box: the whole cell
// takes it now, as every other cell does.
for (const device of devices) {
  test(`on ${device.name}, a checkbox cell ticks 3 px inside each edge`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }, { id: "done", name: "Done", type: "checkbox" }], [{ item: "Booth", done: false }])
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const td = page.locator('tbody tr[data-index="0"] > td[data-kind="checkbox"]')
    const box = page.getByRole("checkbox", { name: "Done" })
    await td.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "end" }))
    const at = await td.boundingBox()
    if (!at) throw new Error("no checkbox cell")
    const spots = [
      { edge: "top", x: at.width / 2, y: 3 },
      { edge: "bottom", x: at.width / 2, y: at.height - 3 },
      { edge: "left", x: 3, y: at.height / 2 },
      { edge: "right", x: at.width - 3, y: at.height / 2 },
    ]
    let ticked = false
    for (const spot of spots) {
      if (device.touch) await page.touchscreen.tap(at.x + spot.x, at.y + spot.y)
      else await page.mouse.click(at.x + spot.x, at.y + spot.y)
      ticked = !ticked
      await expect(box, `the checkbox cell, 3 px inside its ${spot.edge} edge`).toBeChecked({ checked: ticked })
    }
    await expect.poll(() => server.writes.map((w) => (w.body.values as Record<string, unknown>)?.done)).toEqual([true, false, true, false])
    await sam.close()
  })
}
