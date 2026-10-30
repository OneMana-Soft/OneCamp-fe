import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// The keys from a cell they reached, which is at rest: its box read-only, with
// all of it selected. The arrows stayed in such a cell. And with the mouse
// resting on another cell, the first key typed there (or F2) took the focus
// out of the grid, so every key after it was lost: the cell under the mouse,
// drawn anew as the typed-in one came to life, was brought back to life.

const fields = [
  { id: "name", name: "Name", type: "text" },
  { id: "where", name: "Where", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
]
const rows = () => [
  { name: "Booth", where: "Hall A", notes: "Power" },
  { name: "Banner", where: "Hall B", notes: "Print" },
  { name: "Badges", where: "Desk", notes: "Lanyards" },
]

test("at 1280, the arrows go across from a cell the keys reached", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const sam = await server.open(browser, testInfo, SAM)
  const cell = (at: string) => sam.page.locator(`[data-cell="${at}"]`)
  await cell("0:0").click()
  await sam.page.keyboard.press("ArrowDown")
  await expect(cell("1:0")).toBeFocused()
  await sam.page.keyboard.press("ArrowRight")
  await expect(cell("1:1")).toBeFocused()
  await sam.page.keyboard.press("ArrowRight")
  await expect(cell("1:2")).toBeFocused()
  await sam.page.keyboard.press("ArrowLeft")
  await expect(cell("1:1")).toBeFocused()
  await sam.close()
})

for (const way of [
  { name: "a word typed", keys: [] as string[], text: "Zebra", saved: "Zebra" },
  { name: "F2, then a word", keys: ["F2"], text: " and stand", saved: "Banner and stand" },
]) {
  test(`at 1280, ${way.name} in a cell the keys reached lands whole while the mouse rests on another`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows())
    const sam = await server.open(browser, testInfo, SAM)
    const cell = (at: string) => sam.page.locator(`[data-cell="${at}"]`)
    // A click, the mouse left where it was, and the keys down a row.
    await cell("0:0").click()
    await sam.page.keyboard.press("ArrowDown")
    await expect(cell("1:0")).toBeFocused()
    for (const key of way.keys) await sam.page.keyboard.press(key)
    await sam.page.keyboard.type(way.text)
    await expect(cell("1:0")).toBeFocused()
    await expect(cell("1:0")).toHaveValue(way.saved)
    await sam.page.keyboard.press("Tab")
    await expect.poll(() => server.valuesOf(1).name, { timeout: 15_000 }).toBe(way.saved)
    await sam.close()
  })
}

// A cell the mouse finds at rest, while another holds the focus, opens by its
// click, with the caret where the click landed, as in a cell the mouse came
// onto. Its whole text was selected, so the word typed next replaced it.
test("at 1280, a click into a cell at rest while another holds the focus types where it landed", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const sam = await server.open(browser, testInfo, SAM)
  const cell = (at: string) => sam.page.locator(`[data-cell="${at}"]`)
  await cell("0:0").click()
  await expect(cell("0:0")).toBeFocused()
  // Past the end of "Hall B", in its box: the caret goes after the text.
  const box = await cell("1:1").boundingBox()
  if (!box) throw new Error("row 1's Where cell isn't drawn")
  await sam.page.mouse.click(box.x + box.width - 8, box.y + box.height / 2)
  await expect(cell("1:1")).toBeFocused()
  await sam.page.keyboard.type(" east")
  await expect(cell("1:1")).toHaveValue("Hall B east")
  await sam.close()
})
