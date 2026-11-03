import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-444: a click or a tap selects a cell, as a sheet's does (V-295): its box is live, its whole text selected. A
// Ctrl+Z pressed there undoes the table's latest change, as Sheets and Airtable do; it went to the browser, which
// had no typing there to undo, so nothing happened. Once the box is typed in, the browser's undo of the typing
// stays its own. At 390 with touch and at 1280.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
]
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a Ctrl+Z on a cell a ${phone ? "tap" : "click"} selected undoes the table's latest change`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth", cost: 1000 }])
    const { page, close } = await server.open(browser, testInfo, SAM, phone ? PHONE : { viewport: { width: 1280, height: 800 } })
    const td = (cell: string) => page.locator(`tbody td[data-field]:has([data-cell="${cell}"])`).first()
    const box = (cell: string) => page.locator(`[data-cell="${cell}"]`).first()
    const press = (target: Locator) => (phone ? target.tap() : target.click())
    await expect(td("0:0")).toContainText("Booth", { timeout: 60_000 })

    // The change: Booth typed as Zeta; Enter saves it.
    await press(td("0:0"))
    await expect(box("0:0")).toBeFocused()
    await page.keyboard.type("Zeta")
    await page.keyboard.press("Enter")
    await expect.poll(() => server.rows[0].values.item, { timeout: 15_000 }).toBe("Zeta")

    // Another cell selected by a click or a tap: its box live (not read-only), as the press leaves it.
    await press(td("0:1"))
    await expect(box("0:1")).toBeFocused()
    expect(await box("0:1").evaluate((el) => (el as HTMLInputElement).readOnly), "a selected cell's box is live").toBe(false)

    const before = server.undos.length
    await page.keyboard.press("ControlOrMeta+Z")
    // The latest change, Zeta, is undone: an undo goes, and Booth is back.
    await expect.poll(() => server.undos.slice(before), { timeout: 15_000 }).toEqual([""])
    await expect.poll(() => server.rows[0].values.item, { timeout: 15_000 }).toBe("Booth")
    await expect(td("0:0")).toContainText("Booth", { timeout: 15_000 })

    // Typed in, the box keeps the browser's undo of the typing: no undo goes to the table. The cell selected anew
    // (a click on the box holding the focus places its caret, as a browser's does), so a key typed replaces its text.
    await press(td("0:0"))
    await expect(box("0:0")).toBeFocused()
    await press(td("0:1"))
    await expect(box("0:1")).toBeFocused()
    await page.keyboard.type("5")
    await expect(box("0:1")).toHaveValue("5")
    const typed = server.undos.length
    await page.keyboard.press("ControlOrMeta+Z")
    await expect(box("0:1"), "the browser took the typing back").not.toHaveValue("5")
    await page.waitForTimeout(500)
    expect(server.undos.length, "no undo goes from a box typed in").toBe(typed)
    expect(server.rows[0].values.item).toBe("Booth")
    await close()
  })
}
