import { expect, test, type Browser, type BrowserContextOptions, type TestInfo } from "@playwright/test"

import { holdChunk } from "../holdChunk"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A view's rules applied in the browser are a chunk of their own (lib/tables/applyRules): the grid of an
// indexed table reads the server's windows, which come ruled, so the table's first screen no longer
// carries them. A view that needs them waits, its frame busy, until they land, and never draws a row its
// filter hides. Nothing moves when they land: the toolbar holds the count's place, and the grid waits as
// itself, the element its rows then fill.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
]
const rows = [
  { item: "Booth", stage: "To do" },
  { item: "Banner", stage: "Done" },
  { item: "Badges", stage: "Done" },
  { item: "Flyer", stage: "To do" },
]
const DONE = "5a7e0000-0000-4000-8000-0000000000cc"
const rules = { sort: [], filters: [{ field: "stage", op: "is", value: "Done" }], match: "all" }
// The rules' chunk alone carries this: the moment a date filter reads (applyRules MOMENT), kept by the minifier.
const RULES_MARK = String.raw`(?:[.,](\d+))?(Z|[+-]\d{2}:\d{2})$`

const devices = [
  { name: "at 1280, by mouse", options: { viewport: { width: 1280, height: 900 } } },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
]

/** The table opened on its view filtered to Done, in the given layout, with the rules' chunk held back until release(). */
async function openHeld(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions, layout: "board" | "grid") {
  const server = new TableServer(fields, rows)
  server.savedViews = [{ id: DONE, table_id: server.id, name: "Done", type: layout, config: JSON.stringify({ rules }), position: 0 }]
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...options })
  await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const page = await context.newPage()
  const rulesChunk = await holdChunk(page, RULES_MARK)
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}?v=${DONE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const frame = page.locator("[data-table-frame]")
  await expect(frame).toHaveAttribute("aria-busy", "true", { timeout: 60_000 })
  await expect.poll(rulesChunk.asked).toBe(true)
  const close = async () => {
    await rulesChunk.done()
    await context.close()
  }
  return { page, frame, release: rulesChunk.release, close }
}

for (const device of devices) {
  test(`${device.name}, a board with a filter shows no row its filter hides while the rules' chunk is on its way`, async ({ browser }, testInfo) => {
    const { frame, release, close } = await openHeld(browser, testInfo, device.options, "board")
    await expect(frame.getByText("Booth")).toHaveCount(0)
    await expect(frame.getByText("Banner")).toHaveCount(0)
    release()
    await expect(frame.getByText("Banner")).toBeVisible({ timeout: 30_000 })
    await expect(frame).not.toHaveAttribute("aria-busy", "true")
    await expect(frame.getByText("Booth")).toHaveCount(0)
    await close()
  })

  // DB-20 (26 Oct): at 390 the count came with the rules, wrapped the toolbar, and the board dropped 32px.
  test(`${device.name}, nothing moves as the rules land: the toolbar held the count's place`, async ({ browser }, testInfo) => {
    const { page, frame, release, close } = await openHeld(browser, testInfo, device.options, "board")
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const places = async () => ({
      toolbar: await frame.locator("[data-table-toolbar]").boundingBox(),
      search: await frame.getByRole("button", { name: "Search rows (/)" }).boundingBox(),
      boardTop: (await frame.locator(":scope > :nth-child(2)").boundingBox())?.y,
    })
    const held = await places()
    release()
    await expect(frame.getByText("Banner")).toBeVisible({ timeout: 30_000 })
    await expect(frame).not.toHaveAttribute("aria-busy", "true")
    await expect(frame.locator("[data-rows-shown]")).toHaveText("Showing 2 of 4 rows")
    expect(await places()).toEqual(held)
    await close()
  })
}

// DB-20 (26 Oct): the held grid drew the page's skeleton, bars under no header.
test("at 1280, a grid with a filter waits for its rules as itself, and its rows fill it in place", async ({ browser }, testInfo) => {
  const { frame, release, close } = await openHeld(browser, testInfo, devices[0].options, "grid")
  const grid = frame.locator("table[aria-rowcount]")
  await expect(grid.locator("thead").getByText("Item", { exact: true })).toBeVisible()
  await expect(grid.locator("thead").getByText("Stage", { exact: true })).toBeVisible()
  await expect(grid.locator("tr[data-placeholder]")).toHaveCount(4)
  await expect(frame.getByText("Booth")).toHaveCount(0)
  await grid.evaluate((table) => table.setAttribute("data-waited", ""))
  release()
  // A grid cell holds its text twice, in its field and in what it draws.
  await expect(frame.getByText("Banner", { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(frame).not.toHaveAttribute("aria-busy", "true")
  // The rows filled the grid that waited: it wasn't drawn again.
  await expect(frame.locator("table[data-waited]")).toHaveCount(1)
  await expect(grid.locator("tr[data-placeholder]")).toHaveCount(0)
  await expect(frame.getByText("Booth")).toHaveCount(0)
  await close()
})
