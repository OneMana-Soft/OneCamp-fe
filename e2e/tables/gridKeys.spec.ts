import { expect, test, type Browser, type BrowserContextOptions, type TestInfo } from "@playwright/test"

import { finger } from "../finger"
import { holdChunk } from "../holdChunk"
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

// V-295 (main's 21:0x 1 Nov ruling): a click selects a cell, as a sheet's
// does, so a word typed replaces its text: the first click, in a cell the
// mouse brought to life, and a cell at rest clicked while another holds the
// focus. A double-click puts the caret where it was pressed. Enter opens a
// selected cell with the caret at its end, and Enter in it saves it, going down.
test("at 1280, a click selects a cell and a word typed replaces it; a double-click types where it was pressed, and Enter types at the end", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows())
  const sam = await server.open(browser, testInfo, SAM)
  const cell = (at: string) => sam.page.locator(`[data-cell="${at}"]`)
  await cell("0:0").click()
  await expect(cell("0:0")).toBeFocused()
  await sam.page.keyboard.type("Stand")
  await expect(cell("0:0")).toHaveValue("Stand")
  await cell("1:1").click()
  await expect(cell("1:1")).toBeFocused()
  await sam.page.keyboard.type("Hall C")
  await expect(cell("1:1")).toHaveValue("Hall C")
  // Pressed at the start of "Desk", in its box: the caret goes before the text.
  const box = await cell("2:1").boundingBox()
  if (!box) throw new Error("row 2's Where cell isn't drawn")
  await sam.page.mouse.dblclick(box.x + 3, box.y + box.height / 2)
  await expect(cell("2:1")).toBeFocused()
  await sam.page.keyboard.type("Front ")
  await expect(cell("2:1")).toHaveValue("Front Desk")
  await cell("1:2").click()
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.type("ed")
  await sam.page.keyboard.press("Enter")
  await expect(cell("2:2")).toBeFocused()
  const saved = () => [0, 1, 2].map((i) => server.valuesOf(i))
  await expect
    .poll(saved, { timeout: 15_000 })
    .toEqual([
      { name: "Stand", where: "Hall A", notes: "Power" },
      { name: "Banner", where: "Hall C", notes: "Printed" },
      { name: "Badges", where: "Front Desk", notes: "Lanyards" },
    ])
  await sam.close()
})

// V-148: the keys between cells and a column's drag come with the live cells'
// chunk, off the table's first load. Keys pressed before it lands wait, and
// all go once it does, in order; a column's edge dragged keeps the width it
// reached, for this reader across a reload.

/** The live cells' chunk: it alone registers the grid's moves (gridMoves, which gridCells re-exports). */
const MOVES_MARK = /["']gridKeyDown["'],|gridKeyDown:\(\)=>/

/** The table in its grid (a phone shows the list unless the reader chose the grid), seeded once: a reload keeps what the page saved. */
async function openGrid(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions, hold?: RegExp) {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 900 }, ...options })
  const page = await context.newPage()
  const chunk = hold ? await holdChunk(page, hold) : null
  await server.attach(page, testInfo, SAM)
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1")
      localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
    }
  }, server.id)
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const cell = (at: string) => page.locator(`[data-cell="${at}"]`)
  await expect(cell("2:2")).toBeAttached({ timeout: 60_000 })
  return { page, context, chunk, cell }
}

for (const device of [
  { name: "at 1280", options: {}, touch: false },
  { name: "at 390 by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  test(`${device.name}, keys pressed before the cells' code lands all go once it does, in order`, async ({ browser }, testInfo) => {
    const { page, context, chunk, cell } = await openGrid(browser, testInfo, device.options, MOVES_MARK)
    await expect.poll(() => chunk!.asked(), { timeout: 30_000 }).toBe(true)
    // A finger selects a cell at rest: its box holds the focus, shut (its text box ignores taps until then).
    const first = device.touch ? page.locator('[data-cell-box]:has([data-cell="0:0"])') : cell("0:0")
    await (device.touch ? first.tap() : first.click())
    await expect(first).toBeFocused()
    // Down, Enter (it opens the cell selected there, the caret at its text's end: V-295), then right, on from that
    // end: held while the code comes.
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await page.keyboard.press("ArrowRight")
    await expect(first).toBeFocused()
    chunk!.release()
    await expect(cell("1:1")).toBeFocused({ timeout: 30_000 })
    // And from there at once.
    await page.keyboard.press("ArrowUp")
    await expect(cell("0:1")).toBeFocused()
    await chunk!.done()
    await context.close()
  })

  test(`${device.name}, a column's edge dragged ${device.touch ? "by a finger" : "by the mouse"} keeps the width it reached, after a reload too`, async ({ browser }, testInfo) => {
    const { page, context } = await openGrid(browser, testInfo, device.options)
    const head = page.locator('thead th[data-col-index="1"]')
    const width = async () => (await head.boundingBox())!.width
    if (device.touch) {
      // At 390 the Where column runs past the glass: its scroller brings the edge 90 px in from the right first.
      await head.evaluate((th) => {
        let s = th.parentElement
        while (s && !(s.scrollWidth > s.clientWidth && /auto|scroll/.test(getComputedStyle(s).overflowX))) s = s.parentElement
        const over = th.getBoundingClientRect().right - (window.innerWidth - 90)
        if (s && over > 0) s.scrollLeft += over
      })
    }
    const before = await head.boundingBox()
    if (!before) throw new Error("the Where column's header isn't drawn")
    // Its 8 px edge, 2 px in from the header's right side, taken 60 px right.
    const x = before.x + before.width - 2
    const y = before.y + before.height / 2
    if (device.touch) {
      const f = await finger(page)
      await f.down(x, y)
      for (const dx of [15, 30, 45, 60]) await f.move(x + dx, y)
      await f.up()
    } else {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 60, y, { steps: 4 })
      await page.mouse.up()
    }
    await expect.poll(width).toBeGreaterThan(before.width + 57)
    const dragged = await width()
    expect(dragged).toBeLessThan(before.width + 63)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.locator('[data-cell="2:2"]')).toBeAttached({ timeout: 60_000 })
    await expect.poll(width, { timeout: 30_000 }).toBeCloseTo(dragged, 0)
    await context.close()
  })
}
