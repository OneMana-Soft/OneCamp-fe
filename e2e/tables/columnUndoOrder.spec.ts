import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-369: a column's change enters the table's undo order when it's made, as a
// row's writes do (V-360). A column's rename is held on its way while Ctrl+Z
// is pressed: no undo goes until the rename is answered, then the Undo goes
// and does exactly what an Undo pressed after the rename would: a rename
// stores no change set (a field's answer names none), so it asks for the
// latest change, which is not the rename. At 390 with touch and at 1280.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
]
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** Holds every POST to a path ending in `end` until released, counting them. */
async function holdPosts(page: Page, end: string) {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  let seen = 0
  await page.route((url) => url.pathname.endsWith(end), async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    seen++
    await released
    return route.fallback()
  })
  return { release: () => release(), seen: () => seen }
}

for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a Ctrl+Z pressed while a column's rename is on its way waits for it`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, [{ item: "Booth", cost: 1000 }])
    const { page, close } = await server.open(browser, testInfo, SAM, phone ? PHONE : { viewport: { width: 1280, height: 800 } })
    if (phone) {
      // The grid on a phone, for its columns' menus.
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
      await page.reload({ waitUntil: "domcontentloaded" })
    }
    await expect(page.locator("[data-table-frame]").getByText("Booth", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    const press = (target: Locator) => (phone ? target.tap() : target.click())

    // The edit before: Booth typed as Zeta; Enter saves it. An Undo must never take it while the rename is on its way.
    await press(page.locator('tbody td[data-field]:has([data-cell="0:0"])').first())
    await expect(page.locator('[data-cell="0:0"]').first()).toBeFocused()
    await page.keyboard.type("Zeta")
    await page.keyboard.press("Enter")
    await expect.poll(() => server.rows[0].values.item, { timeout: 15_000 }).toBe("Zeta")

    await press(page.getByRole("button", { name: /^Cost, .* column\. Edit column$/ }))
    const name = page.getByRole("textbox", { name: "Column name" })
    await name.fill("Price")
    const held = await holdPosts(page, "/update")
    await name.press("Enter")
    await expect.poll(held.seen, { timeout: 15_000 }).toBe(1)
    // The table's keys are the grid's: a cell has the focus, as a reader's Ctrl+Z after a rename would find it.
    await press(page.locator('tbody td[data-field]:has([data-cell="0:0"])').first())
    await expect(page.locator('[data-cell="0:0"]').first()).toBeFocused()

    const before = server.undos.length
    await page.keyboard.press("ControlOrMeta+Z")
    await page.waitForTimeout(500)
    expect(server.undos.length, "no undo goes while the rename is on its way").toBe(before)
    held.release()
    // As a press after the rename: an undo that names no change set (the server's latest change, not the rename).
    await expect.poll(() => server.undos.slice(before), { timeout: 15_000 }).toEqual([""])
    expect(server.fields.find((f) => f.id === "cost")?.name).toBe("Price")
    await close()
  })
}
