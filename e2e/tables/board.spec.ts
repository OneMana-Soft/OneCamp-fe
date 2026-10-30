import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-10: a board card couldn't be opened, and moved only by the
// browser's own drag and drop: on a touch screen only where a long press
// drags, and never from the keyboard.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "notes", name: "Notes", type: "text" },
]
const deals = () => new TableServer(fields, [{ item: "Booth", stage: "To do", notes: "Hall 2" }, { item: "Banner", stage: "To do" }])

test("on a phone, a card held and dragged by touch moves to another lane, setting its lane alone", async ({ browser }, testInfo) => {
  const server = deals()
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = sam.page
  await page.getByRole("button", { name: "Board" }).tap()
  const card = page.locator("[data-card-id]").filter({ hasText: "Booth" })
  const from = await card.boundingBox()
  const done = await page.locator('[data-lane="o_done000000"]').boundingBox()
  if (!from || !done) throw new Error("no card or lane")
  // A hold past the touch delay, then a drag into the next lane's edge on screen.
  const x0 = from.x + from.width / 2
  const y0 = from.y + from.height / 2
  const x1 = done.x + 16
  const y1 = done.y + 60
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] })
  // Held until the card lifts: its copy under the finger shows its name too.
  await expect(page.getByText("Booth", { exact: true })).toHaveCount(2)
  for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 }] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await expect.poll(() => server.valuesOf(0).stage, { timeout: 15_000 }).toBe("Done")
  const patches = server.writes.filter((w) => w.kind === "patch")
  expect(patches.map((p) => p.body.values)).toEqual([{ stage: "Done" }])
  await sam.close()
})

test("from the keyboard, Space picks a card up, the arrows move it and Space drops it, each step said; Enter opens one", async ({ browser }, testInfo) => {
  const server = deals()
  const sam = await server.open(browser, testInfo, SAM)
  const page = sam.page
  await page.getByRole("button", { name: "Board" }).click()
  const said = page.locator("[data-board-said]")
  const booth = page.locator("[data-card-id]").filter({ hasText: "Booth" })
  await booth.focus()
  await page.keyboard.press("Space")
  await expect(said).toHaveText("Picked up Booth, in To do. Left and right arrow keys move it, Space drops it, Escape puts it back.")
  await page.keyboard.press("ArrowRight")
  await expect(said).toHaveText("Done")
  await page.keyboard.press("Space")
  await expect(said).toHaveText("Moved to Done.")
  await expect.poll(() => server.valuesOf(0).stage, { timeout: 15_000 }).toBe("Done")
  // Space never opened it; the focus followed it into Done, where Enter opens it.
  await expect(page.locator("[data-record-panel]")).toHaveCount(0)
  await expect(page.locator('[data-lane="o_done000000"] [data-card-id]').filter({ hasText: "Booth" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("[data-record-panel]")).toBeVisible()
  await sam.close()
})
