import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-170 (tables, 1 Nov; plan logs/tables-118/v170-plan.md "## Web"): a
// workspace table's owner chooses who edits its rows. A member they haven't
// chosen sees the table View only and can't type into a cell, a write refused
// meanwhile is said once, and when the owner chooses them their open page
// turns editable without a reload. The owner chooses in the Share dialog's
// "Who can edit", from the shared access card. At 1280, and at 390 by touch.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
]
const rows = [
  { item: "Booth", cost: 1200 },
  { item: "Banner", cost: 300 },
]
const sizes = [
  { name: "at 1280", viewport: { width: 1280, height: 800 }, touch: false },
  { name: "at 390, by touch", viewport: { width: 390, height: 844 }, touch: true },
]
const WHY = "You can view and comment on this table. Its owner chooses who edits it."

async function open(browser: Browser, testInfo: TestInfo, server: TableServer, size: (typeof sizes)[number]): Promise<Page> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch })
  // The grid at 390 too, as a reader who chose it (a phone's default is the list).
  await context.addInitScript((id) => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
  }, server.id)
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return page
}

const press = (page: Page, size: (typeof sizes)[number], target: ReturnType<Page["locator"]>) => (size.touch ? target.tap() : target.click())
// A press on the first row's Item cell, as each hand makes it. The mouse clicks
// the cell's text box. A finger lands on the cell: at rest its box takes the
// press, the grid brings the cell to life as the finger goes down, and the tap's
// click reaches the text box (DataTableGrid's onPointerDown).
const pressItem = (page: Page, size: (typeof sizes)[number]) => {
  const cell = page.locator('tr[data-row] td[data-field="item"]').first()
  return press(page, size, size.touch ? cell : cell.getByRole("textbox", { name: "Item" }))
}

for (const size of sizes) {
  test(`${size.name}, a member who may only view sees View only, types nothing, and turns editable once chosen`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows)
    server.canManage = false
    server.canEdit = false
    server.live = true
    const page = await open(browser, testInfo, server, size)
    const chip = page.getByText("View only", { exact: true })
    await expect(chip).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(WHY)).toBeAttached()
    await expect(page.getByText("You can edit its rows. Its owner changes its columns.")).toHaveCount(0)

    // A cell takes no typing, and nothing is written.
    const item = () => page.getByRole("textbox", { name: "Item" }).first()
    await pressItem(page, size)
    await page.keyboard.type("Stand")
    await page.keyboard.press("Enter")
    await expect(item()).toHaveValue("Booth")
    await expect(item()).toHaveJSProperty("readOnly", true)
    await expect(page.getByRole("button", { name: /New row/ })).toHaveCount(0)
    expect(server.writes.filter((w) => w.kind === "patch" || w.kind === "create" || w.kind === "batch")).toEqual([])

    // The owner chooses them: the server says so on the table's topic, and the
    // open page reads its level again, with no reload.
    await expect.poll(() => server.listening(), { timeout: 30_000 }).toBe(true)
    server.canEdit = true
    expect(server.say({ action: "editing" })).toBeGreaterThan(0)
    await expect(chip).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText("You can edit its rows. Its owner changes its columns.")).toBeVisible()
    await pressItem(page, size)
    await page.keyboard.type("Stand")
    await page.keyboard.press("Enter")
    // The typing is written. A click selects the cell, so the typing replaces
    // "Booth" (V-295); a tap is left to the touch screen, whose caret may
    // land after it.
    const typed = () => server.writes.filter((w) => w.kind === "patch").map((w) => (w.body.values as { item?: unknown }).item)
    await expect.poll(typed, { timeout: 15_000 }).toContainEqual(size.touch ? expect.stringMatching(/^(Booth)?Stand$/) : "Stand")
  })

  test(`${size.name}, a write refused by a change made meanwhile is said once and turns the page View only`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows)
    server.canManage = false
    const page = await open(browser, testInfo, server, size)
    const item = () => page.getByRole("textbox", { name: "Item" }).first()
    await expect(item()).toHaveValue("Booth", { timeout: 60_000 })
    // The owner made them a viewer, and no live message reached this page.
    server.canEdit = false
    await pressItem(page, size)
    await page.keyboard.type("Stand")
    await page.keyboard.press("Enter")
    await expect(page.getByText("You can view this table").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("View only", { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(item()).toHaveValue("Booth")
    expect(server.writes.filter((w) => w.kind === "patch")).toEqual([])
  })

  test(`${size.name}, the owner chooses who edits in the Share dialog's Who can edit`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows)
    const page = await open(browser, testInfo, server, size)
    await press(page, size, page.getByRole("button", { name: "Share" }))
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Who can edit", { exact: true })).toBeVisible({ timeout: 30_000 })
    const choose = async (from: string, to: RegExp) => {
      await press(page, size, dialog.getByRole("button", { name: from }))
      await press(page, size, page.getByRole("menuitem", { name: to }))
    }
    await choose("Everyone who can open it", /^Only managers/)
    await expect.poll(() => server.editingAsks, { timeout: 15_000 }).toEqual([{ general: "comment" }])
    await expect(dialog.getByRole("button", { name: "Only managers" })).toBeVisible()
    await choose("Only managers", /^Everyone who can open it/)
    await expect.poll(() => server.editingAsks.length, { timeout: 15_000 }).toBe(2)
    expect(server.editingAsks[1]).toEqual({ general: "edit" })
    await choose("Everyone who can open it", /^Only people I choose/)
    await expect.poll(() => server.editingAsks.length, { timeout: 15_000 }).toBe(3)
    expect(server.editingAsks[2]).toEqual({ general: "comment" })
    // Chosen people are added from the shared invite box, under the card.
    await expect(dialog.getByRole("button", { name: "Only people I choose" })).toBeVisible()
    await expect(dialog.locator("[data-editing-people]")).toBeVisible()
  })
}
