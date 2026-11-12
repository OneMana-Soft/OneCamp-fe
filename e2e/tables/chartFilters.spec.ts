import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM, reviewShot, SHOT_THEMES } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A chart that tells the truth (TABLES-BOARDS-11, UX-TB-H3). The chart asked
// /aggregate for every row and hid the rules bar, so a view filtered to Q4
// charted every quarter; and it kept its choices in one browser. Now its
// numbers come from the grid's own query (the view's filter, grouped by the
// chart's field), the rules bar shows over it, and its look goes with the
// view: a second browser opening the view sees the same chart.

const fields = [
  { id: "item", name: "Item", type: "text" },
  // Q1 has no rows: a filter on it keeps none.
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_q1000000000", label: "Q1" }, { id: "o_q3000000000", label: "Q3" }, { id: "o_q4000000000", label: "Q4" }] } },
  { id: "amount", name: "Amount", type: "number" },
]
const VIEW = "5a7e0000-0000-4000-8000-0000000000c1"
const Q4 = { sort: [], filters: [{ field: "stage", op: "is", value: "Q4" }], match: "all" }

function sales() {
  const server = new TableServer(fields, [
    { item: "Booth", stage: "Q4", amount: 100 },
    { item: "Ads", stage: "Q4", amount: 200 },
    { item: "Print", stage: "Q4", amount: 50 },
    { item: "Venue", stage: "Q3", amount: 300 },
    { item: "Swag", stage: "Q3", amount: 20 },
  ])
  server.answersQuery = true
  server.savedViews = [{ id: VIEW, table_id: server.id, name: "Sales", type: "grid", config: "{}", position: 0 }]
  return server
}

/** What each bar says to a screen reader (SvgChart): "Count of rows · Q4: 3", in the chart's order. */
const bars = (page: Page) => page.locator("[data-table-chart] svg [aria-label*=' · ']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).sort())
const tab = (page: Page, name: string) => page.getByRole("group", { name: "View", exact: true }).getByRole("button", { name, exact: true })
/** Each bar's value as the eye sees it: its computed opacity ("0" while its bar still grows in). */
const seen = (page: Page) => page.locator("[data-table-chart] svg [data-bar-value]").evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))
/** Holds each bar's first-reveal grow (SvgChart's chart-bar-grow) where it is, and says how far each has got (0 to 1). */
const holdGrows = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a): a is CSSAnimation => a instanceof CSSAnimation && a.animationName === "chart-bar-grow")
      .map((a) => {
        a.pause()
        return Number(a.effect?.getComputedTiming().progress ?? 0)
      }),
  )
const landGrows = (page: Page) =>
  page.evaluate(() => {
    for (const a of document.getAnimations()) if (a instanceof CSSAnimation && a.animationName === "chart-bar-grow") a.finish()
  })

/** A keyboard's way to `target`: Tab from where the focus is until it has it, at most 40 presses. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(target).toBeFocused()
}

for (const theme of SHOT_THEMES) {
  for (const device of [
    { name: "at 1280, by mouse", options: { colorScheme: theme }, touch: false, tag: "1280" },
    { name: "at 390, by touch", options: { colorScheme: theme, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true, tag: "390" },
  ]) {
    const press = (target: Locator) => (device.touch ? target.tap() : target.click())

    test(`${device.name} (${theme}), the chart counts only the rows the view's filter keeps, and follows the filter`, async ({ browser }, testInfo) => {
      const server = sales()
      const origin = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001")).origin
      const sam = await server.open(browser, testInfo, SAM, { ...device.options, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(Q4) }] }] } })
      const page = sam.page
      await press(tab(page, "Chart"))
      await expect.poll(() => bars(page), { timeout: 30_000 }).toEqual(["Count of rows · Q4: 3"])
      await expect(page.locator("[data-table-chart] figcaption")).toHaveText("Count of rows by Stage")
      // The chart's numbers are the grid's own query's: the view's filter, its rows grouped by the chart's field.
      expect(server.queries.filter((q) => q.count && q.spec?.groups)).toContainEqual(
        expect.objectContaining({ spec: { filter: { op: "and", filters: [{ field: "field:stage", operator: "is", values: [{ text: "Q4" }] }] }, groups: [{ field: "field:stage" }] } }),
      )
      // The rules bar is over the chart, its filter there to change.
      const remove = page.getByRole("button", { name: /^Remove the filter Stage/ })
      await expect(remove).toBeVisible()
      await reviewShot(page, `table-chart-filtered-${device.tag}`, theme)
      await press(remove)
      await expect.poll(() => bars(page)).toEqual(["Count of rows · Q3: 2", "Count of rows · Q4: 3"])
      await sam.close()
    })

    test(`${device.name} (${theme}), the chart's choices open where a finger can pick them, and a sum adds each group's amounts`, async ({ browser }, testInfo) => {
      const server = sales()
      const origin = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001")).origin
      const sam = await server.open(browser, testInfo, SAM, { ...device.options, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(Q4) }] }] } })
      const page = sam.page
      await press(tab(page, "Chart"))
      await expect.poll(() => bars(page), { timeout: 30_000 }).toEqual(["Count of rows · Q4: 3"])
      if (!device.touch) {
        // By keyboard: Tab reaches the chart's Measure, its focus ring drawn (DB-136 F4).
        await tabTo(page, page.getByRole("combobox", { name: "Measure" }))
        await reviewShot(page, `table-chart-focus-measure-${device.tag}`, theme)
      }
      await press(page.getByRole("combobox", { name: "Measure" }))
      // On a phone a select is a sheet titled with its name (components/ui/selectSheet), its rows a finger's 44px.
      if (device.touch) {
        const sheet = page.getByRole("dialog", { name: "Measure" })
        await expect(sheet).toBeVisible()
        expect((await sheet.getByRole("option", { name: "Sum" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
        await reviewShot(page, `table-chart-measure-${device.tag}`, theme)
      }
      await press(page.getByRole("option", { name: "Sum" }))
      await expect.poll(() => bars(page)).toEqual(["Sum of Amount · Q4: 350"])
      // Each group's sum is the server's, asked beside the view's filter.
      expect(server.queries.filter((q) => q.count && q.spec?.groups).at(-1)?.spec?.summaries).toEqual([{ field: "field:amount", fns: ["sum"] }])
      // Its value over the bar, for the eye.
      await expect(page.locator("[data-table-chart] svg [data-bar-value]")).toHaveText(["350"])
      await expect(page.locator("[data-table-chart] figcaption")).toHaveText("Sum of Amount by Stage")
      await reviewShot(page, `table-chart-sum-${device.tag}`, theme)
      await sam.close()
    })

    test(`${device.name} (${theme}), a view whose filter keeps no row says so over its chart, with Clear filters`, async ({ browser }, testInfo) => {
      const server = sales()
      const origin = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001")).origin
      const Q1 = { ...Q4, filters: [{ field: "stage", op: "is", value: "Q1" }] }
      const sam = await server.open(browser, testInfo, SAM, { ...device.options, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(Q1) }] }] } })
      const page = sam.page
      await press(tab(page, "Chart"))
      await expect(page.locator("[data-table-chart]").getByText("No rows match these filters")).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, `table-chart-nomatch-${device.tag}`, theme)
      const clear = page.locator("[data-table-chart]").getByRole("button", { name: "Clear filters" })
      if (!device.touch) {
        // By keyboard: Tab reaches Clear filters, its focus ring drawn (DB-136 F4).
        await tabTo(page, clear)
        await reviewShot(page, `table-chart-nomatch-focus-${device.tag}`, theme)
      }
      // The chart's first bars (DB-136 F1): their grow slowed fifty times, then held mid-way. Each value is written, and
      // unseen until its bar has landed; let the bars land and every value is seen.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send("Animation.enable")
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.02 })
      await press(clear)
      await expect.poll(() => bars(page)).toEqual(["Count of rows · Q3: 2", "Count of rows · Q4: 3"])
      await expect(page.locator("[data-table-chart] svg [data-bar-value]")).toHaveText(["2", "3"])
      const grows = await holdGrows(page)
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
      expect(grows, "both bars still growing").toHaveLength(2)
      for (const g of grows) expect(g).toBeLessThan(1)
      expect(await seen(page), "no value before its bar has landed").toEqual(["0", "0"])
      await reviewShot(page, `table-chart-midgrow-${device.tag}`, theme)
      await landGrows(page)
      await expect.poll(() => seen(page), { message: "each value once its bar has landed" }).toEqual(["1", "1"])
      // Cleared: several bars, each with its value over it (DB-136 F2a).
      await reviewShot(page, `table-chart-cleared-${device.tag}`, theme)
      await expect(page.getByRole("button", { name: /^Remove the filter Stage/ })).toHaveCount(0)
      await sam.close()
    })

    test(`${device.name} (${theme}), a chart grouped by a field the server can't group by counts every row, and says so`, async ({ browser }, testInfo) => {
      const server = sales()
      const origin = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001")).origin
      const sam = await server.open(browser, testInfo, SAM, { ...device.options, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(Q4) }] }] } })
      const page = sam.page
      await press(tab(page, "Chart"))
      await expect.poll(() => bars(page), { timeout: 30_000 }).toEqual(["Count of rows · Q4: 3"])
      // A text field: the cell index orders choices, numbers, dates and ticks, so the chart asks /aggregate, over every row.
      await press(page.getByRole("combobox", { name: "Group by" }))
      await press(page.getByRole("option", { name: "Item" }))
      await expect(page.getByText("Showing every row: this view's filters can't apply to a chart yet.")).toBeVisible()
      await expect.poll(() => bars(page)).toHaveLength(5)
      expect(server.aggregates.at(-1)).toMatchObject({ group_by: "item", aggregate: "count" })
      // Five bars, each value seen where its band holds one (DB-136 F2b).
      await expect.poll(() => seen(page)).not.toContain("0")
      await reviewShot(page, `table-chart-every-row-${device.tag}`, theme)
      await sam.close()
    })

    test(`${device.name} (${theme}), a chart the server won't group says the server's words; one that fails says so, and Try again draws it`, async ({ browser }, testInfo) => {
      const server = sales()
      // The server's 422 for a grouping past its budget (business/RowQuery), in its own words.
      const why = "Grouped this way, the rows fall into more than 1,000 groups: group by a field with fewer values, or a date by a longer period"
      server.refuses = (q) => (q.count && q.spec?.groups ? why : null)
      const origin = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001")).origin
      const sam = await server.open(browser, testInfo, SAM, { ...device.options, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: `onecamp:tableView:${server.id}`, value: JSON.stringify(Q4) }] }] } })
      const page = sam.page
      const chart = page.locator("[data-table-chart]")
      await press(tab(page, "Chart"))
      await expect(chart.getByText(why)).toBeVisible({ timeout: 30_000 })
      await expect(chart.getByText("Couldn't load this chart")).toHaveCount(0)
      await reviewShot(page, `table-chart-refused-${device.tag}`, theme)
      // A server fault (a 500) has no words for a person: the app's one failure, with Try again (DB-136 F3).
      server.refuses = () => null
      server.groupCountsFailing = 1
      await press(page.getByRole("combobox", { name: "Measure" }))
      await press(page.getByRole("option", { name: "Sum" }))
      await expect(chart.getByText("Couldn't load this chart")).toBeVisible()
      await expect(chart.getByText("internal error")).toHaveCount(0)
      await reviewShot(page, `table-chart-failed-${device.tag}`, theme)
      await page.evaluate(() => Object.assign(window, { chartKept: true }))
      await press(chart.getByRole("button", { name: "Try again" }))
      await expect.poll(() => bars(page)).toEqual(["Sum of Amount · Q4: 350"])
      expect(await page.evaluate(() => "chartKept" in window), "Try again draws the chart without a reload").toBe(true)
      await sam.close()
    })
  }
}

test("a chart's look goes with its view: saved, a second browser opening the view sees the same chart", async ({ browser }, testInfo) => {
  const server = sales()
  const sam = await server.open(browser, testInfo, SAM, {}, VIEW)
  const page = sam.page
  await expect(page.getByRole("button", { name: "View: Sales", exact: true })).toBeVisible({ timeout: 30_000 })
  await tab(page, "Chart").click()
  await expect.poll(() => bars(page), { timeout: 30_000 }).toEqual(["Count of rows · Q3: 2", "Count of rows · Q4: 3"])
  await page.getByRole("combobox", { name: "Chart" }).click()
  await page.getByRole("option", { name: "Pie" }).click()
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => JSON.parse(server.savedViews[0].config || "{}").display?.chart?.type, { timeout: 15_000 }).toBe("pie")
  // Nothing of it stayed in this browser's own keeping.
  expect(await page.evaluate((id) => localStorage.getItem(`onecamp:tableChart:${id}`), server.id)).toBeNull()
  await sam.close()

  const ann = await server.open(browser, testInfo, SAM, {}, VIEW)
  // A pie's slices say their share: "Q4: 3 (60%)".
  await expect.poll(() => ann.page.locator("[data-table-chart] svg path[aria-label*='%)']").count(), { timeout: 30_000 }).toBe(2)
  await ann.close()
})
