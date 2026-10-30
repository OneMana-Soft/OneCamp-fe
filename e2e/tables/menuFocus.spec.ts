import { expect, test } from "@playwright/test"

import { holdChunk } from "../holdChunk"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// REGRESSION-HUNT F7 (26 Oct): the rows menu (Row height and colour) and More are drawn alone until the table's menus chunk lands, then as
// Radix's triggers, which are other nodes. Each asks for the chunk as the focus reaches it, so a keyboard's focus
// started the very load that took it away: when the chunk landed, the focus fell to <body> and Enter opened
// nothing. Here the chunk is held until the trigger has the focus, so it lands after, every run.

const fields = [{ id: "item", name: "Item", type: "text" }]
// The script that defines the table's menus (TableMenus' RowHeightMenu): where it's defined, an export's name and
// its value, not where the page reads it (m.RowHeightMenu).
const MENUS_MARK = /["']RowHeightMenu["'],|RowHeightMenu:\(\)=>/

for (const name of ["Row height and colour", "More"]) {
  test(`at 1280, by keyboard, ${name} keeps the focus as the menus' chunk lands, and Enter opens its menu`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth" }])
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const menus = await holdChunk(page, MENUS_MARK)
    await server.attach(page, testInfo, SAM)
    await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-table-frame]").getByText("Booth", { exact: true }).first()).toBeVisible({ timeout: 60_000 })

    // The rows menu is in the toolbar and More in the page's header; each is the page's only button of its name.
    const trigger = page.getByRole("button", { name, exact: true })
    // The stand-in: Radix's trigger says whether its menu is open; the stand-in doesn't.
    await expect(trigger).not.toHaveAttribute("aria-expanded")
    await trigger.focus()
    await expect.poll(menus.asked, { message: "the focus asks for the menus' chunk" }).toBe(true)
    menus.release()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu")).toBeVisible()
    await menus.done()
    await context.close()
  })
}
