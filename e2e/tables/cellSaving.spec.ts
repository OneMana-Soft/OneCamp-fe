import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// REGRESSION-HUNT-1 (26 Oct): a cell is drawn at rest again once another comes to life, from the row as the page
// last read it, so an edit showed the old value until its save answered: Cost 1200 typed as 1207 read 1200 for
// the whole 2.6 s save. The cell shows the edit at once, as saving (aria-busy), and a failed save puts the saved
// value back and says so.

// Two fields, which a phone draws as the grid too; past four it draws a list (the phone's list, below).
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
]
const devices: { name: string; options: BrowserContextOptions; touch: boolean }[] = [
  { name: "at 1280, by mouse", options: { viewport: { width: 1280, height: 900 } }, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]

/**
 * Holds every cell's save until answer(): 200 lets the table's server answer it, anything else fails it. By its
 * path: a save's address ends in the browser's zone (?tz=), which a glob, matched against the whole address, misses.
 */
async function holdSaves(page: Page) {
  let answer: (status: number) => void = () => {}
  const answered = new Promise<number>((resolve) => (answer = resolve))
  await page.route((url) => /\/rows\/[^/]+\/patch$/.test(url.pathname), async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    const status = await answered
    if (status === 200) return route.fallback()
    const origin = route.request().headers()["origin"] || "*"
    return route.fulfill({ status, headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" }, json: { msg: "The save failed" } })
  })
  return answer
}

for (const device of devices) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())

  /**
   * Cost typed as 1207 in the first row, and the second row's Item pressed, while the save is held. Under a finger a
   * cell's text box takes no tap until it has the focus, so a finger presses the cell's box (table.css).
   */
  async function typeAndLeave(page: Page) {
    const cost = page.getByRole("textbox", { name: "Cost" }).first()
    const at = (cell: string) => page.locator(device.touch ? `[data-cell-box]:has(> [data-cell="${cell}"])` : `[data-cell="${cell}"]`)
    await expect(cost).toHaveValue("1200", { timeout: 30_000 })
    await press(at("0:1"))
    await cost.fill("1207")
    await press(at("1:0"))
    return { cost, cell: page.locator('tr[data-row] td[data-field="cost"]').first() }
  }

  test(`${device.name}, a cell left while its save waits shows what was typed, as saving, and keeps it`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [
      { item: "Booth", cost: 1200 },
      { item: "Banner", cost: 300 },
    ])
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    const answer = await holdSaves(page)
    const { cost, cell } = await typeAndLeave(page)
    await expect(cell.locator("[data-rest]")).toHaveCount(1)
    await expect(cost).toHaveValue("1207")
    await expect(cell).toHaveAttribute("aria-busy", "true")
    expect(server.writes.filter((w) => w.kind === "patch")).toHaveLength(0)
    answer(200)
    await expect(cell).not.toHaveAttribute("aria-busy", "true")
    await expect(cost).toHaveValue("1207")
    await expect.poll(() => server.valuesOf(0).cost).toBe(1207)
    await close()
  })

  test(`${device.name}, a cell whose save fails goes back to what was saved, and says so`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [
      { item: "Booth", cost: 1200 },
      { item: "Banner", cost: 300 },
    ])
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    const answer = await holdSaves(page)
    const { cost, cell } = await typeAndLeave(page)
    await expect(cost).toHaveValue("1207")
    answer(500)
    await expect(cost).toHaveValue("1200")
    await expect(cell).not.toHaveAttribute("aria-busy", "true")
    await expect(page.getByText("The save failed", { exact: true })).toBeVisible()
    expect(server.valuesOf(0).cost).toBe(1200)
    await close()
  })
}

// REGRESSION-HUNT-2 (26 Oct): past four fields a phone draws the view as a list (listByDefault), and an edit is
// made in the row's record: the row, and its record opened again, showed the old value until the save answered.
const listFields = [
  ...fields,
  { id: "units", name: "Units", type: "number" },
  { id: "vendor", name: "Vendor", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
]
const listRows = [
  { item: "Booth", cost: 1200, units: 2, vendor: "Acme" },
  { item: "Banner", cost: 300, units: 1, vendor: "Print Co" },
]
const phone: BrowserContextOptions = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** Booth's Cost made 1207 in its record, which is closed while the save is held: Booth's row in the list. */
async function editInRecord(page: Page) {
  const open = page.getByRole("button", { name: /^Booth / })
  const row = page.locator("ul.v3-grid-list > li", { has: open })
  await expect(row).toContainText("Cost 1,200", { timeout: 30_000 })
  await open.tap()
  const record = page.locator("[data-record-panel]")
  const cost = record.getByRole("textbox", { name: "Cost" })
  await expect(cost).toHaveValue("1200")
  await cost.tap()
  await cost.fill("1207")
  await record.getByRole("textbox", { name: "Vendor" }).tap()
  await record.getByRole("button", { name: "Close" }).tap()
  await expect(record).toHaveCount(0)
  return { open, row, record }
}

test("at 390, by touch, in the phone's list, a row whose record closed while its save waits shows the edit, as saving, and keeps it", async ({ browser }, testInfo) => {
  const server = new TableServer(listFields, listRows)
  const { page, close } = await server.open(browser, testInfo, SAM, phone)
  const answer = await holdSaves(page)
  const { open, row, record } = await editInRecord(page)
  await expect(row).toHaveAttribute("aria-busy", "true")
  await expect(row).toContainText("Cost 1,207")
  expect(server.writes.filter((w) => w.kind === "patch")).toHaveLength(0)
  await open.tap()
  await expect(record.getByRole("textbox", { name: "Cost" })).toHaveValue("1207")
  await record.getByRole("button", { name: "Close" }).tap()
  answer(200)
  await expect(row).not.toHaveAttribute("aria-busy", "true")
  await expect(row).toContainText("Cost 1,207")
  await expect.poll(() => server.valuesOf(0).cost).toBe(1207)
  await close()
})

test("at 390, by touch, in the phone's list, a row whose save fails goes back to what was saved, and says so", async ({ browser }, testInfo) => {
  const server = new TableServer(listFields, listRows)
  const { page, close } = await server.open(browser, testInfo, SAM, phone)
  const answer = await holdSaves(page)
  const { row } = await editInRecord(page)
  await expect(row).toContainText("Cost 1,207")
  answer(500)
  await expect(row).toContainText("Cost 1,200")
  await expect(row).not.toHaveAttribute("aria-busy", "true")
  await expect(page.getByText("The save failed", { exact: true })).toBeVisible()
  expect(server.valuesOf(0).cost).toBe(1200)
  await close()
})
