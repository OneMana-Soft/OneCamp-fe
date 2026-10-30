import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables V3: a view colours its rows from the rows menu, by a choice field's
// option colours or by rules (the first a row passes), as a stripe at each
// row's edge on the grid and on the phone's list.

const SHOTS = process.env.SHOTS_DIR
const STAGES = ["Lead", "Won", "Lost"]
const table = (extra = 0) =>
  new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "stage", name: "Stage", type: "select", config: { options: STAGES.map((label, i) => ({ id: `o${i}`, label, color: ["sky", "moss", "berry"][i] })) } },
      { id: "amount", name: "Amount", type: "number" },
      ...Array.from({ length: extra }, (_, i) => ({ id: `note${i}`, name: `Note ${i + 1}`, type: "text" })),
    ],
    Array.from({ length: 12 }, (_, i) => ({ item: `Line ${i}`, stage: STAGES[i % 3], amount: i * 100 })),
  )

/** Until every overlay (a menu, a dialog or sheet, a list of options) has finished coming or going: a shot never catches one mid-fade (DB-22, 27 Oct). */
const settled = (page: Page) =>
  page.waitForFunction(
    () =>
      document.getAnimations().every((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target
        return a.playState !== "running" || !el?.closest('[role="menu"], [role="dialog"], [role="listbox"], [data-overlay]')
      }),
    undefined,
    { timeout: 10_000 },
  )

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await settled(page)
    await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

const hueOf = (row: ReturnType<Page["locator"]>) => row.locator("[data-row-hue]")

test("at 1280, a view colours its rows by a choice field, then by a rule, and keeps them", async ({ browser }, testInfo) => {
  const server = table()
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  const rows = page.locator("tbody tr[data-row]")
  await expect(rows.first()).toContainText("Line 0", { timeout: 30_000 })
  const rowsMenu = page.getByRole("button", { name: "Row height and colour" })
  await rowsMenu.click()
  await page.getByRole("menuitemradio", { name: "By Stage" }).click()
  // Each row takes its option's colour: Lead sky, Won moss, Lost berry.
  await expect(hueOf(rows.nth(0))).toHaveAttribute("data-row-hue", "sky")
  await expect(hueOf(rows.nth(1))).toHaveAttribute("data-row-hue", "moss")
  await expect(hueOf(rows.nth(2))).toHaveAttribute("data-row-hue", "berry")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await shoot(page, "colours-1280-by-field")

  await rowsMenu.click()
  await expect(page.getByRole("menuitemradio", { name: "By Stage" })).toHaveAttribute("aria-checked", "true")
  await shoot(page, "colours-1280-menu")
  await page.getByRole("menuitemradio", { name: "By rules…" }).click()
  const dialog = page.getByRole("dialog", { name: "Colour rows and cells" })
  await expect(dialog).toBeVisible()
  // The dialog keeps the focus the closing menu would take back to its trigger.
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
  // Opening the rules changes nothing; the first edit colours by them, and a rule colours nothing until its filter is filled in.
  await expect(page.locator("tbody [data-row-hue]")).toHaveCount(12)
  await dialog.getByRole("radio", { name: "Sun" }).click()
  await expect(page.locator("tbody [data-row-hue]")).toHaveCount(0)
  await dialog.getByRole("combobox", { name: "Field" }).click()
  await page.getByRole("option", { name: "Amount" }).click()
  await dialog.getByRole("combobox", { name: "Condition" }).click()
  await page.getByRole("option", { name: ">", exact: true }).click()
  await dialog.getByRole("spinbutton", { name: "Value" }).fill("500")
  await expect(page.locator("tbody [data-row-hue]")).toHaveCount(6)
  await expect(page.getByRole("listbox")).toHaveCount(0)
  await shoot(page, "colours-1280-rules")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()
  await expect(hueOf(rows.nth(6))).toHaveAttribute("data-row-hue", "sun")
  await expect(hueOf(rows.nth(5))).toHaveCount(0)

  // The reader's colours outlive a reload, as the rest of how the table draws does.
  await page.reload()
  await expect(hueOf(rows.nth(6))).toHaveAttribute("data-row-hue", "sun", { timeout: 60_000 })
  await expect(page.locator("tbody [data-row-hue]")).toHaveCount(6)
  await sam.close()
})

test("at 390 with touch, the phone's list carries the colours, and the rules open in a sheet", async ({ browser }, testInfo) => {
  // Five fields: a phone shows the table as a list.
  const server = table(2)
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const { page } = sam
  const list = page.locator("[data-table-list]")
  await expect(list).toBeVisible({ timeout: 30_000 })
  const items = list.locator("li:not([data-group-header]):not([data-placeholder])")
  const rowsMenu = page.getByRole("button", { name: "Row height and colour" })
  await rowsMenu.tap()
  await page.getByRole("menuitemradio", { name: "By Stage" }).tap()
  await expect(hueOf(items.nth(1))).toHaveAttribute("data-row-hue", "moss")
  await expect(page.getByRole("menu")).toHaveCount(0)
  // The stripe paints: its box lies inside the list, and the point at its middle is the stripe.
  const stripe = await hueOf(items.nth(1)).boundingBox()
  const frame = await list.boundingBox()
  expect(stripe && frame && stripe.x >= frame.x && stripe.x + stripe.width <= frame.x + frame.width).toBe(true)
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-row-hue") ?? null, [stripe!.x + stripe!.width / 2, stripe!.y + stripe!.height / 2])
  expect(hit).toBe("moss")
  await shoot(page, "colours-390-list")

  await rowsMenu.tap()
  await page.getByRole("menuitemradio", { name: "By rules…" }).tap()
  const dialog = page.getByRole("dialog", { name: "Colour rows and cells" })
  await expect(dialog).toBeVisible()
  // Under a finger, each swatch is 40 px or more.
  const sizes = await dialog.getByRole("radio").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(sizes).toHaveLength(6)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(40)
  await dialog.getByRole("radio", { name: "Berry" }).tap()
  await dialog.getByRole("textbox", { name: "Value" }).fill("Line 1")
  await expect(hueOf(items.nth(1))).toHaveAttribute("data-row-hue", "berry")
  await expect(hueOf(items.nth(2))).toHaveCount(0)
  await shoot(page, "colours-390-rules")
  // A colour scale's line fits the sheet: its field, its six swatches under a finger, and its way out.
  await dialog.getByRole("button", { name: "Add a colour scale" }).tap()
  const scale = dialog.getByRole("group", { name: "Scale on Amount, Moss" })
  await expect(scale).toBeVisible()
  const line = await scale.boundingBox()
  const sheet = await dialog.boundingBox()
  expect(line!.x + line!.width).toBeLessThanOrEqual(sheet!.x + sheet!.width + 1)
  const swatches = await scale.getByRole("radio").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(Math.min(...swatches)).toBeGreaterThanOrEqual(40)
  await scale.scrollIntoViewIfNeeded()
  await shoot(page, "colours-390-scales")
  await dialog.getByRole("button", { name: "Done" }).tap()
  await expect(dialog).toBeHidden()
  await sam.close()
})

// gsheets-formatting-01: a rule colours one field's cell, comparing two
// fields of its row (Amount over Budget), and a scale shades a number's
// cells from its lowest to its highest.
test("at 1280, a rule colours Amount's cell where it passes Budget, and a scale shades Budget, light to strong", async ({ browser }, testInfo) => {
  const server = new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "budget", name: "Budget", type: "number" },
    ],
    Array.from({ length: 12 }, (_, i) => ({ item: `Line ${i}`, amount: i * 100, budget: 1100 - i * 100 })),
  )
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  const rows = page.locator("tbody tr[data-row]")
  await expect(rows.first()).toContainText("Line 0", { timeout: 30_000 })
  const cell = (n: number, field: string) => rows.nth(n).locator(`td[data-field="${field}"]`)
  const pick = async (scope: ReturnType<Page["locator"]>, label: string, option: string) => {
    await scope.getByRole("combobox", { name: label }).click()
    await page.getByRole("option", { name: option, exact: true }).click()
    await expect(page.getByRole("listbox")).toHaveCount(0)
  }
  await page.getByRole("button", { name: "Row height and colour" }).click()
  await page.getByRole("menuitemradio", { name: "By rules…" }).click()
  const dialog = page.getByRole("dialog", { name: "Colour rows and cells" })
  await expect(dialog).toBeVisible()
  const rule = dialog.getByRole("group", { name: /^Rule 1, / })
  await rule.getByRole("radio", { name: "Berry" }).click()
  await pick(rule, "What rule 1 colours", "Amount's cell")
  await pick(rule, "Field", "Amount")
  await pick(rule, "Condition", ">")
  await pick(rule, "Compare with", "Budget")
  await expect(rule.getByRole("spinbutton", { name: "Value" })).toHaveCount(0)
  // Over budget from Line 6 (600 against 500): Amount's cell, never the row.
  await expect(cell(6, "amount")).toHaveAttribute("data-tint", "berry")
  await expect(cell(5, "amount")).not.toHaveAttribute("data-tint", /./)
  await expect(page.locator("tbody [data-row-hue]")).toHaveCount(0)

  await dialog.getByRole("button", { name: "Add a colour scale" }).click()
  const scale = dialog.getByRole("group", { name: /^Scale on Amount/ })
  await pick(scale, "Scale 1's field", "Budget")
  await dialog.getByRole("group", { name: /^Scale on Budget/ }).getByRole("radio", { name: "Sky" }).click()
  // Budget runs 1,100 down to 0: light to strong, lowest to highest.
  await expect(cell(0, "budget")).toHaveAttribute("data-tint", "sky-4")
  await expect(cell(4, "budget")).toHaveAttribute("data-tint", "sky-3")
  await expect(cell(11, "budget")).toHaveAttribute("data-tint", "sky-1")
  // The rule still wins Amount's cells; the scale is Budget's.
  await expect(cell(6, "amount")).toHaveAttribute("data-tint", "berry")
  await shoot(page, "colours-1280-cells-dialog")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()
  // The tint paints: the cell's background isn't the sheet's, and a step deeper is darker.
  const bg = (n: number, f: string) => cell(n, f).evaluate((td) => getComputedStyle(td).backgroundColor)
  const sheet = await rows.nth(5).locator('td[data-field="item"]').evaluate((td) => getComputedStyle(td).backgroundColor)
  expect(await bg(6, "amount")).not.toBe(sheet)
  expect(await bg(0, "budget")).not.toBe(await bg(11, "budget"))
  await page.mouse.move(0, 0)
  await shoot(page, "colours-1280-cells")

  // Kept with the reader's view, as the rest of how the table draws is.
  await page.reload()
  await expect(cell(6, "amount")).toHaveAttribute("data-tint", "berry", { timeout: 60_000 })
  await expect(cell(0, "budget")).toHaveAttribute("data-tint", "sky-4")
  await sam.close()
})
