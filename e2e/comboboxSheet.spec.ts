import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page, type TestInfo } from "@playwright/test"

import { settled } from "./sheetLayout"
import { SAM } from "./stubbedApp"
import { PRIYA, TableServer } from "./tables/tableServer"

// The combobox's menu (components/ui/combobox) on a phone is a sheet, never a
// popover floating over the page (the owner, 18 Oct: on phones every overlay is
// a sheet; design/drawers-v3: "a sheet: the filter in the header, the list as
// the body"). Read through a table's status and people cells, beta's pickers on
// it: by touch at 390 a titled sheet whose rows take a finger's 44px, the
// filter pinned over the one scroller, no row lit while nothing is chosen, and
// a tap that picks and closes; at 1280 the popover by its cell, as before.

const person = (p: { user_uuid: string }) => ({ id: p.user_uuid, type: "user" })
const fields = [
  { id: "name", name: "Deal", type: "text" },
  {
    id: "stage",
    name: "Stage",
    type: "status",
    config: { options: [{ id: "o_ns00000000", label: "Not started", group: "todo" }, { id: "o_bd00000000", label: "Building", group: "doing" }, { id: "o_sh00000000", label: "Shipped", group: "done" }] },
  },
  { id: "owners", name: "Owners", type: "people" },
]
const rows = () => [
  { name: "Booth for the launch", stage: "Building", owners: [person(SAM)] },
  { name: "Power for two screens", stage: "Not started", owners: [] },
]

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 860 } }

async function openTable(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions, { record = false } = {}): Promise<{ page: Page; server: TableServer }> {
  const server = new TableServer(fields, rows())
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...options })
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}${record ? `?row=${server.rows[0].id}` : ""}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-status-group="doing"]').first()).toBeVisible({ timeout: 60_000 })
  return { page, server }
}

const rowHeights = (page: Page, picker: string) => page.locator(`[${picker}] [cmdk-item]`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))

/** Whether a finger at the risen sheet's centre reaches the sheet: it is on top, not under what it was asked from. Mid-rise, that centre can be below the screen. */
const onTop = async (sheet: Locator) => {
  await settled(sheet)
  return sheet.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && el.contains(hit)
  })
}

test("by touch at 390, a cell's picker is a titled sheet: 44px rows, nothing lit until chosen, a tap picks", async ({ browser }, testInfo) => {
  const { page, server } = await openTable(browser, testInfo, PHONE)

  await page.getByRole("button", { name: "Stage: Building" }).first().tap()
  const stage = page.getByRole("dialog", { name: "Stage" })
  await expect(stage).toBeVisible()
  await expect(stage).toHaveAttribute("data-overlay", "sheet")
  await expect(page.locator('[data-overlay="float"]')).toHaveCount(0)
  await expect(stage.locator("[data-status-picker]")).toBeVisible()
  // 44px is drawn; layout can measure it a hair under (43.99994 in wK's gate), so the floor is 43.5 as in calendarAnswers.
  for (const h of await rowHeights(page, "data-status-picker")) expect(h, "a status row under a finger").toBeGreaterThanOrEqual(43.5)
  await expect(stage.locator('[cmdk-item][data-selected="true"]')).toHaveText("Building")
  // One scroller, the sheet's: the list doesn't scroll beside it.
  expect(await stage.locator("[cmdk-list]").evaluate((el) => getComputedStyle(el).overflowY)).toBe("visible")
  await stage.getByRole("option", { name: "Shipped" }).tap()
  await expect.poll(() => server.valuesOf(0).stage).toBe("Shipped")
  await expect(stage).toHaveCount(0)

  await page.getByRole("button", { name: "Owners: no one" }).first().tap()
  const owners = page.getByRole("dialog", { name: "Owners" })
  await expect(owners.getByRole("option", { name: /priya@example\.com/ })).toBeVisible({ timeout: 15_000 })
  await expect(owners.locator('[cmdk-item][data-selected="true"]'), "nothing chosen: no row lit").toHaveCount(0)
  // The filter waits for a tap: no keyboard rises over the list as it opens.
  await expect(owners.getByRole("combobox")).not.toBeFocused()
  for (const h of await rowHeights(page, "data-people-picker")) expect(h, "a person's row under a finger").toBeGreaterThanOrEqual(43.5)
  await owners.getByRole("option", { name: /priya@example\.com/ }).tap()
  await expect.poll(() => server.valuesOf(1).owners).toEqual([person(PRIYA)])
  await page.context().close()
})

// A row's record is a float on a phone (the --z-popover level, over the page's
// sheets), so a picker in it asks for its sheet over that level.
test("by touch at 390, a picker in a row's record opens its sheet over the record, and a tap picks", async ({ browser }, testInfo) => {
  const { page, server } = await openTable(browser, testInfo, PHONE, { record: true })
  const record = page.locator("[data-record-panel]")
  await expect(record).toBeVisible({ timeout: 60_000 })

  await record.getByRole("button", { name: /^Stage: / }).tap()
  const stage = page.getByRole("dialog", { name: "Stage" })
  await expect(stage).toHaveAttribute("data-overlay", "sheet")
  expect(await onTop(stage), "the status sheet over the record").toBe(true)
  await stage.getByRole("option", { name: "Shipped" }).tap()
  await expect.poll(() => server.valuesOf(0).stage).toBe("Shipped")
  await expect(stage).toHaveCount(0)

  await record.getByRole("button", { name: /^Owners: / }).tap()
  const owners = page.getByRole("dialog", { name: "Owners" })
  await expect(owners.getByRole("option", { name: /priya@example\.com/ })).toBeVisible({ timeout: 15_000 })
  expect(await onTop(owners), "the people sheet over the record").toBe(true)
  await owners.getByRole("option", { name: /priya@example\.com/ }).tap()
  await expect.poll(() => server.valuesOf(0).owners).toContainEqual(person(PRIYA))
  await page.context().close()
})

test("at 1280, a cell's picker is the popover by its cell, as before", async ({ browser }, testInfo) => {
  const { page } = await openTable(browser, testInfo, COMPUTER)
  await page.getByRole("button", { name: "Stage: Building" }).first().click()
  const picker = page.locator("[data-status-picker]")
  await expect(picker).toBeVisible()
  // The caller's marks ride on the popover itself, so ask the picker for its overlay.
  expect(await picker.evaluate((el) => el.closest("[data-overlay]")?.getAttribute("data-overlay"))).toBe("float")
  await expect(page.locator("[data-v3-sheet]")).toHaveCount(0)
  await page.context().close()
})
