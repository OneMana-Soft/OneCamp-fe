import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// Tables V2b (DESIGN-BUILD-21's rulings): a table grouped from the Sort menu
// ("Group and sort"), each group's header with its count and its totals, a
// chip in the rules row, and groups the reader collapses for themselves.

const SHOTS = process.env.SHOTS_DIR
const STAGES = ["Lead", "Won", "Lost"]
const table = (rows: number, extra = 0) =>
  new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "stage", name: "Stage", type: "select", config: { options: STAGES.map((label, i) => ({ id: `o${i}`, label, color: ["sky", "moss", "berry"][i] })) } },
      { id: "amount", name: "Amount", type: "number" },
      ...Array.from({ length: extra }, (_, i) => ({ id: `note${i}`, name: `Note ${i + 1}`, type: "text" })),
    ],
    Array.from({ length: rows }, (_, i) => ({ item: `Line ${i}`, stage: STAGES[i % 3], amount: (i * 7) % 1000 })),
  )

/** Groups the table by Stage from the Sort menu, a tap or a click at a time; `shot` names a shot of the menu (or the phone's sheet) as it groups. */
async function groupByStage(page: Page, touch = false, shot?: string) {
  const press = (l: ReturnType<Page["locator"]>) => (touch ? l.tap() : l.click())
  await press(page.getByRole("button", { name: "Sort and group" }))
  await expect(page.getByRole("heading", { name: "Group and sort" })).toBeVisible()
  await press(page.getByRole("button", { name: "Add a group" }))
  await press(page.getByRole("combobox", { name: "Group by" }))
  await press(page.getByRole("option", { name: "Stage" }))
  // The field list closes first: an Escape before then closes it, not the menu.
  await expect(page.getByRole("listbox")).toBeHidden()
  if (shot) await shoot(page, shot)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("heading", { name: "Group and sort" })).toBeHidden()
  await expect(page.locator("[data-rule-chip]").filter({ hasText: "Grouped by Stage" })).toBeVisible()
}

/** The header texts wider than their own box (clipped or cut short), at the page's width. */
const clipped = (page: Page) =>
  page.locator("[data-group-header] span").evaluateAll((els) =>
    els.filter((e) => !e.classList.contains("sr-only") && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
  )

/** Waits for what moves (a chevron's turn, a press's tint, a crossfade, a scheme's change) to end, so a shot shows the page at rest. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => setTimeout(done, 1500)),
    ]),
  )

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await settle(page)
    await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

test("at 1280, a table read in windows groups by a field: the server counts and sums each group, and a collapse reads the windows again", async ({ browser }, testInfo) => {
  const server = table(100_000)
  server.answersQuery = true
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  await groupByStage(page, false, "groups-1280-menu")
  const lead = page.getByRole("button", { name: "Collapse Stage: Lead, 33,334 rows" })
  await expect(lead).toBeVisible({ timeout: 30_000 })
  const headers = page.locator("tbody tr[data-group-header]")
  // Each group's sum, as the server worked it out over every row it holds.
  await expect(headers.first().locator('[data-field="amount"]')).toContainText("16,650,331")
  const counts = () => server.queries.filter((q) => q.count && q.spec.groups)
  expect(counts().at(-1)?.spec.groups).toEqual([{ field: "field:stage" }])
  await expect(page.locator("tbody tr[data-row]").first()).toContainText("Line 0")
  await shoot(page, "groups-1280-open")

  await lead.click()
  await expect(page.getByRole("button", { name: "Expand Stage: Lead, 33,334 rows" })).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByRole("button", { name: "Collapse Stage: Won, 33,333 rows" })).toBeVisible()
  // Won's rows follow its header once the windows are read again without Lead's; the groups aren't counted again.
  await expect(page.locator("tbody tr[data-row]").first()).toContainText("Line 1", { timeout: 30_000 })
  expect(server.queries.some((q) => !q.count && q.spec.groups?.[0]?.collapsed?.includes('["Lead"]'))).toBe(true)
  expect(counts()).toHaveLength(1)
  await expect(headers.nth(1).locator('[data-field="amount"]')).toContainText("16,649,669")
  await shoot(page, "groups-1280-collapsed")

  // The chip drops the grouping: the rows come back in the table's order.
  await page.getByRole("button", { name: "Remove the grouping" }).click()
  await expect(headers).toHaveCount(0)
  await expect(page.locator("tbody tr[data-row]").nth(1)).toContainText("Line 1")
  await sam.close()
})

test("at 1280, a small table groups in the browser, with each group's count and sum", async ({ browser }, testInfo) => {
  const server = table(12)
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  await groupByStage(page)
  const headers = page.locator("tbody tr[data-group-header]")
  await expect(headers).toHaveCount(3)
  await expect(headers.nth(1).locator('[data-field="amount"]')).toContainText("154")
  await page.getByRole("button", { name: "Collapse Stage: Won, 4 rows" }).click()
  await expect(page.locator("tbody tr[data-row]")).toHaveCount(8)
  expect(server.queries).toHaveLength(0)
  await shoot(page, "groups-1280-browser")
  await sam.close()
})

// DB-23's question (27 Oct): a group a reader collapses is theirs alone, never
// the view's: saved as a view, it opens for another reader with every group open.
test("at 1280, the groups one reader collapses stay theirs: another opens the saved view with every group open", async ({ browser }, testInfo) => {
  const server = table(12)
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  await groupByStage(page)
  await page.getByRole("button", { name: "Collapse Stage: Won, 4 rows" }).click()
  await expect(page.getByRole("button", { name: "Expand Stage: Won, 4 rows" })).toBeVisible()
  await page.getByRole("button", { name: /^View: / }).click()
  await page.getByRole("menuitem", { name: "New view" }).click()
  const naming = page.getByRole("dialog", { name: "New view" })
  await naming.getByRole("textbox", { name: "Name" }).fill("By stage")
  await naming.getByRole("radio", { name: "Everyone" }).click()
  await naming.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => server.savedViews.find((v) => v.name === "By stage")?.config ?? "", { timeout: 15_000 }).toContain("stage")
  const saved = server.savedViews.find((v) => v.name === "By stage")!
  expect(saved.config).not.toContain('"shut"')
  // The one who saved it still sees their collapse.
  await expect(page.getByRole("button", { name: "Expand Stage: Won, 4 rows" })).toBeVisible()
  const priya = await server.open(browser, testInfo, PRIYA, {}, saved.id)
  await expect(priya.page.getByRole("button", { name: "View: By stage", exact: true })).toBeVisible({ timeout: 30_000 })
  for (const stage of STAGES) await expect(priya.page.getByRole("button", { name: `Collapse Stage: ${stage}, 4 rows` })).toBeVisible({ timeout: 30_000 })
  await expect(priya.page.locator("tbody tr[data-row]")).toHaveCount(12)
  await priya.close()
  await sam.close()
})

test("at 1280, a table read in the browser past the rows it holds: each header's count and total say they're of the rows loaded, until Load all reads the rest", async ({ browser }, testInfo) => {
  // Not answered by the server (its index isn't whole yet): the browser reads 10,000 of its 12,000 rows and stops.
  const server = table(12_000)
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  await groupByStage(page)
  await expect(page.getByRole("button", { name: "Collapse Stage: Lead, 3,334 loaded" })).toBeVisible({ timeout: 60_000 })
  const lead = page.locator("tbody tr[data-group-header]").first()
  await expect(lead.locator("[data-group-count]")).toHaveText("3,334 loaded")
  // The rules bar says how much of the table is loaded; the band's totals read as ever and fit their columns.
  await expect(page.getByText("Showing 10,000 of 12,000 rows")).toBeVisible()
  await expect(lead.locator('[data-field="amount"] .sr-only')).toHaveText(" of the 3,334 loaded ")
  expect(await clipped(page)).toEqual([])
  await shoot(page, "groups-1280-partial")
  await page.getByRole("button", { name: "Load all" }).click()
  await expect(page.getByRole("button", { name: "Collapse Stage: Lead, 4,000 rows" })).toBeVisible({ timeout: 60_000 })
  await expect(lead.locator('[data-field="amount"] .sr-only')).toHaveCount(0)
  expect(server.queries).toHaveLength(0)
  await sam.close()
})

test("at 390 with touch, the phone's list heads a partly loaded table's groups with their rows loaded, each header fitting", async ({ browser }, testInfo) => {
  // Five fields: a phone shows the table as a list. Not answered by the server: the browser holds 10,000 of 12,000 rows.
  const server = table(12_000, 2)
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const { page } = sam
  await expect(page.locator("[data-table-list]")).toBeVisible({ timeout: 30_000 })
  await groupByStage(page, true)
  await expect(page.getByRole("button", { name: "Collapse Stage: Lead, 3,334 loaded" })).toBeVisible({ timeout: 60_000 })
  expect(await clipped(page)).toEqual([])
  await shoot(page, "groups-390-partial")
  await sam.close()
})

test("at 390 with touch, the phone's list heads each group, and a tap collapses one", async ({ browser }, testInfo) => {
  // Five fields: a phone shows the table as a list.
  const server = table(100_000, 2)
  server.answersQuery = true
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const { page } = sam
  await expect(page.locator("[data-table-list]")).toBeVisible({ timeout: 30_000 })
  await groupByStage(page, true, "groups-390-sheet")
  const lead = page.getByRole("button", { name: "Collapse Stage: Lead, 33,334 rows" })
  await expect(lead).toBeVisible({ timeout: 30_000 })
  await shoot(page, "groups-390-open")
  await lead.tap()
  await expect(page.getByRole("button", { name: "Expand Stage: Lead, 33,334 rows" })).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByRole("button", { name: "Collapse Stage: Won, 33,333 rows" })).toBeVisible()
  await expect(page.locator("[data-table-list] li:not([data-group-header]):not([data-placeholder])").first()).toContainText("Line 1", { timeout: 30_000 })
  await shoot(page, "groups-390-collapsed")
  await sam.close()
})

// DB-24 (27 Oct): a grouping more than one level deep, its chip at both widths.
test("at 1280 and at 390 with touch, a grouping two levels deep names both levels in its chip, and the chip's words fit", async ({ browser }, testInfo) => {
  for (const phone of [false, true]) {
    // Five fields at 390: the phone's list.
    const server = table(12, phone ? 2 : 0)
    const sam = await server.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    const { page } = sam
    const press = (l: ReturnType<Page["locator"]>) => (phone ? l.tap() : l.click())
    if (phone) await expect(page.locator("[data-table-list]")).toBeVisible({ timeout: 30_000 })
    await groupByStage(page, phone)
    await press(page.getByRole("button", { name: "Sort and group" }))
    // Text can't group: the subgroup takes the next field that can, Amount.
    await press(page.getByRole("button", { name: "Add a subgroup" }))
    await expect(page.getByRole("combobox", { name: "Then group by" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Group and sort" })).toBeHidden()
    const chip = page.locator("[data-rule-chip]").filter({ hasText: "Grouped by Stage › Amount" })
    await expect(chip).toBeVisible()
    expect(await chip.locator("button").first().evaluate((b) => b.scrollWidth <= b.clientWidth + 1), "the chip's words fit, none cut short").toBe(true)
    await shoot(page, `groups-${phone ? 390 : 1280}-chip2`)
    await sam.close()
  }
})

// CR-76 MF1 (V-48): the server left a grouping's groups out of every count,
// each past its budget, the three re-asks' too, and the grid drew rows on
// their way for good: no rows, no reason. The rows now show ungrouped, in
// their groups' order, under words that say why, with a Try again (DB-29).
for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a grouping the server left out of every count shows its rows ungrouped, says why, and groups them when Try again counts them`, async ({ browser }, testInfo) => {
    // On a phone, five fields: the table shows as a list.
    const server = table(100_000, phone ? 2 : 0)
    server.answersQuery = true
    const sam = await server.open(browser, testInfo, SAM, phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {})
    const { page } = sam
    const rows = phone ? page.locator("[data-table-list] li:not([data-group-header]):not([data-placeholder])") : page.locator("tbody tr[data-row]")
    await expect(rows.first()).toContainText("Line 0", { timeout: 30_000 })
    // The re-asks wait 5, 15 and 45 s: the page's clock runs on to each.
    await page.clock.install()
    server.countsLeavingOut = 10
    await groupByStage(page, phone)
    const counted = () => server.queries.filter((q) => q.count && q.spec.groups).length
    for (const n of [1, 2, 3, 4]) {
      await expect
        .poll(
          async () => {
            await page.clock.fastForward(50_000)
            return counted()
          },
          { timeout: 20_000 },
        )
        .toBeGreaterThanOrEqual(n)
    }
    const notice = page.getByRole("status").filter({ hasText: "show ungrouped" })
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(rows.first()).toContainText("Line 0")
    await expect(page.locator("[data-group-header]")).toHaveCount(0)
    expect(counted()).toBe(4)
    const again = notice.getByRole("button", { name: "Try again" })
    await expect(again).toBeVisible()
    await shoot(page, `groups-left-out-${phone ? 390 : 1280}`)
    // The server counts them now: Try again groups the rows, and the notice goes.
    server.countsLeavingOut = 0
    await (phone ? again.tap() : again.click())
    await expect(page.getByRole("button", { name: "Collapse Stage: Lead, 33,334 rows" })).toBeVisible({ timeout: 15_000 })
    await expect(notice).toHaveCount(0)
    expect(counted()).toBe(5)
    await shoot(page, `groups-left-out-again-${phone ? 390 : 1280}`)
    await sam.close()
  })
}
