import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-475 (DESIGN-BUILD-109, the wM36 LIVE look, 4 Nov): V-415 gave the column menu, the "+" and the Sort and
// Filter menus insides of their own (columnMenu/, rules/RuleMenus), asked for as a menu opens or as the pointer
// reaches its trigger. A tap has no pointer coming first, and a click comes right after it, so on LIVE every
// first open read "Opening…" for 0.4-4 s (the "+" asked for about twelve scripts) where it had drawn within a
// second before. The table page warms them once the table is drawn and the page is idle, beside the record, the
// find bar, the pickers and the popover: a first open asks for no script, and its insides are there at once.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
]
const rows = [
  { item: "Booth", stage: "To do" },
  { item: "Banner", stage: "Done" },
]

const devices = [
  { name: "at 1280, by mouse", touch: false, options: { viewport: { width: 1280, height: 900 } } },
  { name: "at 390, by touch", touch: true, options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
]

/** Every script the page asks for from now on, by its address. */
function scriptsAsked(page: Page): string[] {
  const asked: string[] = []
  page.on("request", (r) => {
    if (r.resourceType() === "script") asked.push(new URL(r.url()).pathname)
  })
  return asked
}

/** Until no new script has been asked for in a second and a half: the page's idle warming is over. */
async function settled(asked: string[]) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        if (asked.length !== seen) {
          seen = asked.length
          since = Date.now()
        }
        return Date.now() - since >= 1500
      },
      { timeout: 45_000, intervals: [250] },
    )
    .toBe(true)
}

for (const device of devices) {
  test(`${device.name}, the "+", a column's menu and Filter open the first time asking for no script`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...device.options })
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    const asked = scriptsAsked(page)
    await server.attach(page, testInfo, SAM)
    await page.goto(`/app/tables/${server.id}?view=grid`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-table-frame]").getByText("Booth", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await settled(asked)

    const open = (trigger: Locator) => (device.touch ? trigger.tap() : trigger.click())
    const menus: { name: string; trigger: Locator; inside: Locator }[] = [
      // The "+" opens on its list of column types (AddColumnBody); the name box comes once a type is picked.
      { name: 'the "+"', trigger: page.getByRole("button", { name: "Add a column" }), inside: page.getByRole("listbox", { name: "New column type" }) },
      { name: "Item's menu", trigger: page.getByRole("button", { name: /^Item, .+ column\. Edit column$/ }), inside: page.getByRole("textbox", { name: "Column name" }) },
      { name: "Filter", trigger: page.getByRole("button", { name: "Filter", exact: true }), inside: page.getByText("Add a filter", { exact: true }) },
    ]
    for (const menu of menus) {
      const before = asked.length
      await open(menu.trigger)
      await expect(menu.inside, `${menu.name}'s insides`).toBeVisible({ timeout: 10_000 })
      expect(asked.slice(before), `the scripts ${menu.name}'s first open asked for`).toEqual([])
      await page.keyboard.press("Escape")
      await expect(menu.inside).toBeHidden()
    }
    await context.close()
  })
}
