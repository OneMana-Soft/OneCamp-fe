import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-415: a table's menus draw through components/ui/popoverOnDemand, whose
// content and Radix's popover load with a trigger's first hover, focus or
// open. At 390 with touch and at 1280, each menu opens on its trigger and
// shows its own content: the add-column menu (whose body, a chunk of its own,
// draws the content), a column's menu and Filter. Escape closes each; at 1280
// the focus goes back to Filter, and a second click on Filter only closes it.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
]

/** The floating panel open now (the shared PopoverContent's). */
const openPanel = (page: Page) => page.locator('[data-overlay="float"][data-state="open"]')

for (const phone of [true, false]) {
  test(`at ${phone ? "390 with touch" : "1280"}, the add-column menu, a column's menu and Filter open on their triggers with their own content`, async ({ browser }, testInfo) => {
    const s = new TableServer(fields, [{ item: "Booth", cost: 1000 }])
    const size = phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } }
    const { page, close } = await s.open(browser, testInfo, SAM, size)
    if (phone) {
      // The grid on a phone, for its columns' menus.
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), s.id)
      await page.reload({ waitUntil: "domcontentloaded" })
    }
    await expect(page.locator("[data-table-frame]").getByText("Booth", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    const press = (target: Locator) => (phone ? target.tap() : target.click())

    const menus: [string, Locator, Locator][] = [
      ["the add-column menu", page.getByRole("button", { name: "Add a column", exact: true }), page.locator("[data-add-column]").getByText("New column", { exact: true })],
      ["Cost's menu", page.getByRole("button", { name: /^Cost, .* column\. Edit column$/ }), openPanel(page).getByText("Sort ascending")],
      ["Filter", page.getByRole("button", { name: "Filter", exact: true }), openPanel(page)],
    ]
    for (const [name, trigger, shows] of menus) {
      await press(trigger)
      await expect(shows, `${name} shows its own content`).toBeVisible()
      await expect(openPanel(page), `${name} is the one panel open`).toHaveCount(1)
      await page.keyboard.press("Escape")
      await expect(openPanel(page), `Escape closes ${name}`).toHaveCount(0)
    }

    if (!phone) {
      const filter = menus[2][1]
      await expect(filter, "the focus is back on Filter after Escape").toBeFocused()
      await filter.click()
      await expect(openPanel(page)).toHaveCount(1)
      await filter.click()
      await expect(openPanel(page), "a second click on Filter only closes it").toHaveCount(0)
    }
    await close()
  })
}
