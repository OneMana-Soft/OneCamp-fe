import { expect, test, type Locator, type Page } from "@playwright/test"

import { footIsGutter } from "../sheetLayout"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables B2 (T4b): a formula's or a rollup's result in its format (currency,
// a duration, how long ago), the format chosen from the column's menu, a
// rollup that adds up by a formula over values and only the linked rows that
// meet its conditions, and the editor's list of 94 functions. With
// TABLE_SHOTS set to a folder, it also saves each of those at 1280 and 390,
// light and dark, for the design review.

const VENDORS = "7d1e6b2f-3c4d-4e5f-9a0b-1c2d3e4f5a6b"
// The server's words for a formula naming a field the table hasn't got (business/Formula/program.go).
const GONE = `There's no field called "Gone"`
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "tax", name: "With tax", type: "formula", config: { formula: "{Cost} * 1.18", result: "number", format: { currency: "INR", decimals: 2 } } },
  { id: "took", name: "Took", type: "formula", config: { formula: "{Hours} * 3600", result: "number", format: { duration: "h:mm" } } },
  { id: "vendor", name: "Vendor", type: "relation", config: { relation_target: "table", table_id: VENDORS, table_name: "Vendors" } },
  { id: "spend", name: "Spend", type: "rollup", config: { relation: "vendor", field: "vamt", aggregate: "sum", result: "number", format: { currency: "INR" } } },
  { id: "last", name: "Last order", type: "rollup", config: { relation: "vendor", field: "vdate", aggregate: "latest", result: "date", format: { date: "relative" } } },
]
const vendorFields = [
  { id: "vname", name: "Name", type: "text" },
  { id: "vamt", name: "Amount", type: "number" },
  { id: "vdate", name: "Ordered", type: "date" },
  { id: "vstatus", name: "Status", type: "text" },
]
const acme = [{ id: "a0000000-0000-4000-8000-000000000001", type: "row", label: "Acme", table_id: VENDORS }]
// The values the server works out on each read.
const rows = () => [
  { item: "Booth", cost: 1000, tax: 1180, took: 5400, vendor: acme, spend: 2500, last: daysAgo(3) },
  { item: "Banners", cost: 250, tax: 295, took: 2700, vendor: acme, spend: 2500, last: daysAgo(3) },
  { item: "Power", cost: 90, tax: 106.2, took: 39600 },
]

function server() {
  const s = new TableServer(fields, rows())
  s.linked.set(VENDORS, vendorFields)
  return s
}

async function menuOf(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name}, .* column\\. Edit column$`) }).click()
}

test("a formula's and a rollup's result shows in its format, chosen from the column's menu", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM)
  await expect(page.getByText("₹1,180.00")).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("1h 30m").first()).toBeVisible()
  await expect(page.getByText("₹2,500").first()).toBeVisible()
  await expect(page.getByText("3 days ago").first()).toBeVisible()
  // The footers in the results' formats too.
  await expect(page.locator("[data-summary-bar]")).toContainText("₹1,581.20")
  await expect(page.locator("[data-summary-bar]")).toContainText("13h 15m")

  // A number a formula gives, shown as a duration instead: no currency to choose then.
  await menuOf(page, "With tax")
  await page.getByText("Format", { exact: true }).click()
  await page.getByRole("button", { name: "Duration", exact: true }).click()
  await expect(page.getByRole("button", { name: "₹", exact: true })).toHaveCount(0)
  await expect.poll(() => s.writes.filter((w) => w.kind === "field").at(-1)?.body.config).toMatchObject({ formula: "{Cost} * 1.18", format: { duration: "h:mm" } })
  await close()
})

test("a rollup adds up by a formula over values, only the linked rows that meet its conditions, and keeps its format", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM)
  await expect(page.getByText("₹1,180.00")).toBeVisible({ timeout: 60_000 })
  await menuOf(page, "Spend")
  await page.getByRole("button", { name: "Rollup", exact: true }).click()
  await page.getByRole("combobox", { name: "Calculate" }).click()
  await page.getByRole("option", { name: "With a formula" }).click()
  await page.getByRole("textbox", { name: "Formula" }).fill("SUM(values) * 1.18")
  await page.getByRole("button", { name: "Add a condition" }).click()
  await page.getByRole("combobox", { name: "Condition's field" }).click()
  await page.getByRole("option", { name: "Status" }).click()
  await page.getByRole("combobox", { name: "Condition", exact: true }).click()
  await page.getByRole("option", { name: "is", exact: true }).click()
  await page.getByRole("textbox", { name: "Condition's value" }).fill("Open")
  await page.getByRole("button", { name: "Save rollup" }).click()
  await expect.poll(() => s.writes.filter((w) => w.kind === "field").at(-1)?.body.config).toEqual({
    relation: "vendor",
    field: "vamt",
    aggregate: "formula",
    formula: "SUM(values) * 1.18",
    where: [{ field: "vstatus", op: "eq", value: "Open" }],
    format: { currency: "INR" },
  })
  await close()
})

// airtable-02: a rollup sorts the linked rows it adds up by one of their
// fields, either way, and adds up only its first N, as Airtable's do; saved as
// the server keeps it (the sort by field id).
for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a rollup sorts its linked rows and adds up only its first N`, async ({ browser }, testInfo) => {
    const at = phone ? 390 : 1280
    const s = server()
    const { page, close } = await s.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    if (phone) {
      // The grid on a phone, for its columns' menus.
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), s.id)
      await page.reload({ waitUntil: "domcontentloaded" })
    }
    await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
    const press = (l: Locator) => (phone ? l.tap() : l.click())
    const pick = async (box: string, option: string) => {
      await press(page.getByRole("combobox", { name: box, exact: true }))
      await press(page.getByRole("option", { name: option, exact: true }))
    }
    await menuOf(page, "Spend")
    await press(page.getByRole("button", { name: "Rollup", exact: true }))
    await expect(page.getByRole("combobox", { name: "Direction" })).toHaveCount(0)
    // What most people see (DB-29 E1): link order and every row, the first N typed with no browser stepper (M1).
    await expect(page.getByRole("combobox", { name: "Sort the rows by" })).toHaveText("Link order")
    const first = page.getByRole("spinbutton", { name: "Only the first rows" })
    await expect(first).toHaveValue("")
    expect(await first.evaluate((el) => getComputedStyle(el).appearance)).toBe("textfield")
    if (process.env.SHOTS_DIR) {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme })
        await page.screenshot({ path: `${process.env.SHOTS_DIR}/rollup-order-default-${at}-${colorScheme}.png`, animations: "disabled" })
      }
      await page.emulateMedia({ colorScheme: "light" })
    }
    await pick("Sort the rows by", "Ordered")
    await pick("Direction", "Newest first")
    await page.getByRole("spinbutton", { name: "Only the first rows" }).fill("2")
    await expect(page.getByRole("button", { name: "Save rollup" })).toBeInViewport({ ratio: 1 })
    if (process.env.SHOTS_DIR) {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme })
        await page.screenshot({ path: `${process.env.SHOTS_DIR}/rollup-sort-${at}-${colorScheme}.png`, animations: "disabled" })
      }
      await page.emulateMedia({ colorScheme: "light" })
    }
    await press(page.getByRole("button", { name: "Save rollup" }))
    await expect.poll(() => s.writes.filter((w) => w.kind === "field").at(-1)?.body.config).toEqual({
      relation: "vendor",
      field: "vamt",
      aggregate: "sum",
      sort: "vdate",
      desc: true,
      limit: 2,
      format: { currency: "INR" },
    })
    await close()
  })
}

// A rollup saved with a sort it can't use, by a field since deleted or by one
// no view sorts by (a list of choices), says so in its order's select with the
// reason first, since the select truncates a long name (DB-30 M2), and offers
// no direction for it.
for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a rollup's sort it can't use says why first`, async ({ browser }, testInfo) => {
    const at = phone ? 390 : 1280
    const s = new TableServer(
      [
        ...fields,
        { id: "csort", name: "Contract sort", type: "rollup", config: { relation: "vendor", field: "vamt", aggregate: "sum", sort: "vtags", result: "number" } },
        { id: "lsort", name: "Lost sort", type: "rollup", config: { relation: "vendor", field: "vamt", aggregate: "sum", sort: "gone", result: "number" } },
      ],
      rows(),
    )
    s.linked.set(VENDORS, [...vendorFields, { id: "vtags", name: "Supplier contract before launch", type: "multi_select" }])
    const { page, close } = await s.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    if (phone) {
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), s.id)
      await page.reload({ waitUntil: "domcontentloaded" })
    }
    await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
    const press = (l: Locator) => (phone ? l.tap() : l.click())
    for (const [column, words, name] of [
      ["Contract sort", "Can't sort by Supplier contract before launch", "unusable"],
      ["Lost sort", "Can't sort by a deleted field", "deleted"],
    ] as const) {
      await menuOf(page, column)
      await press(page.getByRole("button", { name: "Rollup", exact: true }))
      await expect(page.getByRole("combobox", { name: "Sort the rows by" })).toHaveText(words)
      await expect(page.getByRole("combobox", { name: "Direction" })).toHaveCount(0)
      if (process.env.SHOTS_DIR) {
        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme })
          await page.screenshot({ path: `${process.env.SHOTS_DIR}/rollup-sort-${name}-${at}-${colorScheme}.png`, animations: "disabled" })
        }
        await page.emulateMedia({ colorScheme: "light" })
      }
      // Out of the settings page, then out of the column menu, before the next column's.
      const open = page.locator('[data-overlay="float"][data-state="open"]')
      for (let i = 0; i < 3 && (await open.count()) > 0; i++) await page.keyboard.press("Escape")
      await expect(open).toHaveCount(0)
      // A closed menu stays mounted for its 180 ms exit (data-state="closed"); wait
      // until it's gone, so the next column's menu isn't opened over it. A menu
      // that stayed in the page after Escape would fail here.
      await expect(page.locator('[data-overlay="float"]')).toHaveCount(0)
    }
    await close()
  })
}

// airtable-02: a rollup adds up another table's rollup (the vendors' orders
// total) by what it gives, as Airtable's do, while its sort reads only the
// linked rows' own values; and one whose chain can't be worked out says why in
// its column's menu.
for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a rollup adds up another table's rollup`, async ({ browser }, testInfo) => {
    const at = phone ? 390 : 1280
    const s = new TableServer(
      [
        ...fields,
        { id: "round", name: "Round total", type: "rollup", config: { relation: "vendor", field: "vspend", aggregate: "sum", result: "number", error: "A rollup can't add up rollups that add each other up" } },
        { id: "unworked", name: "Hidden total", type: "rollup", config: { relation: "vendor", field: "vspend", aggregate: "sum", result: "number", error: "The rollup this adds up can't be worked out" } },
        // As the server keeps it: the field says what is wrong too (computed.go), so its header shows the warning.
        { id: "gone", name: "Gone total", type: "formula", config: { formula: "{Gone} * 2", result: "number", error: GONE } },
      ],
      // As the server sends them: every row's broken rollup or formula carries {error: why}.
      rows().map((r) => ({
        ...r,
        round: { error: "A rollup can't add up rollups that add each other up" },
        unworked: { error: "The rollup this adds up can't be worked out" },
        gone: { error: GONE },
      })),
    )
    s.previewErrors.set("{Gone} * 2", GONE)
    s.linked.set(VENDORS, [...vendorFields, { id: "vspend", name: "Orders total", type: "rollup", config: { relation: "vorders", field: "oamt", aggregate: "sum", result: "number" } }])
    const { page, close } = await s.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    if (phone) {
      await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), s.id)
      await page.reload({ waitUntil: "domcontentloaded" })
    }
    await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
    const press = (l: Locator) => (phone ? l.tap() : l.click())
    const pick = async (box: string, option: string) => {
      await press(page.getByRole("combobox", { name: box, exact: true }))
      await press(page.getByRole("option", { name: option, exact: true }))
    }
    const shoot = async (name: string) => {
      if (!process.env.SHOTS_DIR) return
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme })
        await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}-${at}-${colorScheme}.png`, animations: "disabled" })
      }
      await page.emulateMedia({ colorScheme: "light" })
    }
    const closeMenus = async () => {
      const open = page.locator('[data-overlay="float"][data-state="open"]')
      for (let i = 0; i < 3 && (await open.count()) > 0; i++) await page.keyboard.press("Escape")
      await expect(page.locator('[data-overlay="float"]')).toHaveCount(0)
    }
    for (const [column, words, name] of [
      ["Round total", "A rollup can't add up rollups that add each other up", "round"],
      ["Hidden total", "The rollup this adds up can't be worked out", "unworked"],
    ] as const) {
      await menuOf(page, column)
      // The menu's reason row (each cell also carries the words, for assistive tech).
      await expect(page.locator("p").filter({ hasText: words })).toBeVisible()
      await shoot(`rollup-chain-${name}`)
      await closeMenus()
    }
    // A broken rollup's or formula's cells: the shared error face, whose card
    // says why and opens the field's own settings (a rollup's, never a
    // formula's, and a formula's still its formula), and goes once pressed.
    for (const [words, id, edit, save, shot] of [
      ["A rollup can't add up rollups that add each other up", "round", "Edit rollup", "Save rollup", "rollup-chain-round"],
      ["The rollup this adds up can't be worked out", "unworked", "Edit rollup", "Save rollup", "rollup-chain-unworked"],
      [GONE, "gone", "Edit formula", "Save formula", "formula-broken"],
    ] as const) {
      // A mouse resting on another broken cell opens that cell's card by
      // itself: it starts away from the grid, so the only card is the press's.
      if (!phone) await page.mouse.move(1, 1)
      await expect(page.getByRole("note")).toHaveCount(0)
      const cell = page.locator(`tbody td[data-field="${id}"]`).first()
      await cell.scrollIntoViewIfNeeded()
      await expect(cell).toContainText("#ERROR")
      await press(cell)
      const card = page.locator('[role="note"][data-state="open"]').filter({ hasText: words })
      await expect(card).toBeVisible()
      // Its button is the card's footer's (app/overlay.css): on a phone it
      // stands at the sheet's full size, as wide as the sheet inside its gutters.
      const button = card.locator("[data-overlay-footer]").getByRole("button", { name: edit, exact: true })
      await expect(button).toBeVisible()
      if (phone) {
        const box = (await button.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(390 - 2 * 16 - 1)
        // Its foot is its gutter, never under 16px: the one rule for every phone sheet (V-73).
        await footIsGutter(card, "a broken cell's card")
      }
      await shoot(`${shot}-cell`)
      const pressed = await card.getAttribute("id")
      const saveIt = page.getByRole("button", { name: save, exact: true })
      await press(button)
      await expect(saveIt).toBeVisible()
      // The settings it opened say what is wrong, as the column's menu does: a
      // rollup's from its field, a formula's from its editor's check.
      await expect(page.locator("[data-settings-page]").getByText(words)).toBeVisible()
      if (save === "Save rollup") {
        // There the words stand flush with the fields they sit over: the row
        // takes its margin from the page it is on, not from the menu's rows.
        // Both are read in one frame: at 1280 the popover may still be moving
        // to fit its new page, and two reads a moment apart see it in two places.
        await expect(page.locator("[data-settings-page]").getByRole("combobox", { name: "Rows of", exact: true })).toBeVisible()
        const { left, right } = await page.locator("[data-settings-page]").evaluate((settings, said) => {
          const row = [...settings.querySelectorAll("p")].find((p) => p.textContent?.includes(said))!.getBoundingClientRect()
          const label = [...settings.querySelectorAll("label")].find((l) => l.textContent?.trim() === "Rows of")!
          const field = document.getElementById(label.htmlFor)!.getBoundingClientRect()
          return { left: row.left - field.left, right: row.right - field.right }
        }, words)
        expect(Math.abs(left)).toBeLessThanOrEqual(1)
        expect(Math.abs(right)).toBeLessThanOrEqual(1)
      }
      // Its work done, the card goes: never left under the settings it opened.
      await expect(page.locator(`[id="${pressed}"]`)).toHaveCount(0)
      // The mouse goes on to the settings, past any cell it was left on.
      if (!phone) await saveIt.hover()
      await expect(page.getByRole("note")).toHaveCount(0)
      await shoot(`${shot}-settings`)
      await closeMenus()
    }
    await menuOf(page, "Spend")
    await press(page.getByRole("button", { name: "Rollup", exact: true }))
    await pick("Field", "Orders total")
    // A number's ways, since the vendors' total gives one.
    await pick("Calculate", "Largest")
    await press(page.getByRole("combobox", { name: "Sort the rows by", exact: true }))
    await expect(page.getByRole("option", { name: "Amount", exact: true })).toBeVisible()
    await expect(page.getByRole("option", { name: "Orders total", exact: true })).toHaveCount(0)
    await press(page.getByRole("option", { name: "Link order", exact: true }))
    await shoot("rollup-of-rollup")
    await press(page.getByRole("button", { name: "Save rollup" }))
    await expect.poll(() => s.writes.filter((w) => w.kind === "field").at(-1)?.body.config).toEqual({
      relation: "vendor",
      field: "vspend",
      aggregate: "max",
      format: { currency: "INR" },
    })
    await close()
  })
}

// With its Order row a rollup's settings are taller (DB-29 E2): opened from the
// table's last column in a 1280x720 window, the settings' body scrolls within
// the room the menu has, above Cancel and Save rollup, which stay in view.
test("at 1280x720, a rollup's settings opened from the last column scroll above Save rollup, which stays in view", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 720 } })
  await expect(page.getByText("₹1,180.00").first()).toBeVisible({ timeout: 60_000 })
  await menuOf(page, "Last order")
  await page.getByRole("button", { name: "Rollup", exact: true }).click()
  const save = page.getByRole("button", { name: "Save rollup" })
  await expect(page.getByRole("combobox", { name: "Sort the rows by" })).toBeVisible()
  await expect(save).toBeInViewport({ ratio: 1 })
  const body = page.locator("[data-settings-page] > div").nth(1)
  const room = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  testInfo.annotations.push({ type: "settings body", description: `${room.scroll} px of content in ${room.client} px` })
  const shoot = async (name: string) => {
    if (!process.env.SHOTS_DIR) return
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme })
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}-${colorScheme}.png`, animations: "disabled" })
    }
    await page.emulateMedia({ colorScheme: "light" })
  }
  await shoot("rollup-sort-720-top")
  // Scrolled to its end: the first N in view, and Save rollup still pinned below it.
  await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect(page.getByRole("spinbutton", { name: "Only the first rows" })).toBeInViewport({ ratio: 1 })
  await expect(save).toBeInViewport({ ratio: 1 })
  await shoot("rollup-sort-720-end")
  await close()
})

test("the formula editor lists FILTER, MAP and CURRENT with the lists", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM)
  await menuOf(page, "With tax")
  await page.getByText("Formula…", { exact: true }).click()
  await page.getByRole("button", { name: "Show functions" }).click()
  await expect(page.getByText("Lists", { exact: true })).toBeVisible()
  await expect(page.getByText("FILTER", { exact: true })).toBeVisible()
  await expect(page.getByText("This row", { exact: true })).toBeVisible()
  await close()
})

test("the formula editor offers fields, a linked table's fields and functions as you write (T4c)", async ({ browser }, testInfo) => {
  const s = server()
  const { page, close } = await s.open(browser, testInfo, SAM)
  await menuOf(page, "With tax")
  await page.getByText("Formula…", { exact: true }).click()
  const box = page.getByRole("textbox", { name: "Formula" })
  await box.fill("")
  await box.pressSequentially("{Co")
  await expect(page.getByRole("option", { name: /^Cost/ })).toBeVisible()
  await box.press("Enter")
  await expect(box).toHaveValue("{Cost}")
  // A linked table's fields after {Link}.
  await box.pressSequentially(" + COUNTA({Vendor}.{Am")
  await expect(page.getByRole("option", { name: /^Amount/ })).toBeVisible()
  await box.press("Tab")
  await expect(box).toHaveValue("{Cost} + COUNTA({Vendor}.{Amount}")
  // Inside a call, what it takes; a function as its name is typed.
  await box.pressSequentially(", ")
  await expect(page.locator("[data-formula-hint]")).toContainText("COUNTA(a, b, …)")
  await box.pressSequentially("ROUNDU")
  await box.press("Enter")
  await expect(box).toHaveValue("{Cost} + COUNTA({Vendor}.{Amount}, ROUNDUP(")
  await close()
})

const shots = process.env.TABLE_SHOTS
for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`B2's formulas and rollups, ${width} ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const s = server()
      const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width, height }, colorScheme: scheme })
      await context.addInitScript((id) => {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false }))
      }, s.id)
      const page = await context.newPage()
      await s.attach(page, testInfo, SAM)
      await page.goto(`/app/tables/${s.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByText("₹1,180.00")).toBeVisible({ timeout: 60_000 })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `${shots}/b2-grid-${width}-${scheme}.png`, animations: "disabled" })
      if (width < 640) {
        // The rest of the columns on a phone: the rollups.
        await page.locator("[data-table-grid]").evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }))
        await page.screenshot({ path: `${shots}/b2-grid-end-${width}-${scheme}.png`, animations: "disabled" })
        await page.locator("[data-table-grid]").evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }))
      }
      await menuOf(page, "With tax")
      await page.getByText("Format", { exact: true }).click()
      await expect(page.getByRole("button", { name: "Duration", exact: true })).toBeVisible()
      await page.screenshot({ path: `${shots}/b2-format-${width}-${scheme}.png`, animations: "disabled" })
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      await menuOf(page, "Spend")
      await page.getByRole("button", { name: "Rollup", exact: true }).click()
      await page.getByRole("combobox", { name: "Calculate" }).click()
      await page.getByRole("option", { name: "With a formula" }).click()
      await page.getByRole("textbox", { name: "Formula" }).fill("SUM(values) * 1.18")
      await page.getByRole("button", { name: "Add a condition" }).click()
      await page.getByRole("combobox", { name: "Condition's field" }).click()
      await page.getByRole("option", { name: "Status" }).click()
      await page.getByRole("combobox", { name: "Condition", exact: true }).click()
      await page.getByRole("option", { name: "is", exact: true }).click()
      await page.getByRole("textbox", { name: "Condition's value" }).fill("Open")
      // However tall the page, its Save stays on the screen (pinned at the foot).
      await expect(page.getByRole("button", { name: "Save rollup" })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: `${shots}/b2-rollup-${width}-${scheme}.png`, animations: "disabled" })
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      await menuOf(page, "With tax")
      await page.getByText("Formula…", { exact: true }).click()
      await page.getByRole("button", { name: "Show functions" }).click()
      await page.getByText("Lists", { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shots}/b2-editor-${width}-${scheme}.png`, animations: "disabled" })
      // Writing: a linked table's fields offered after {Link}. (T4c).
      const box = page.getByRole("textbox", { name: "Formula" })
      await box.fill("/* tax on the vendor's open orders */ ROUND(SUM({Vendor}.{")
      await box.press("End")
      await expect(page.getByRole("option", { name: /^Amount/ })).toBeVisible()
      await page.screenshot({ path: `${shots}/b2-assist-${width}-${scheme}.png`, animations: "disabled" })
      await context.close()
    })
  }
}
