import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// Tables V4: a view's filters nest in groups, each matched all or any, and a
// people filter can name "Me", whoever opens the view. Built in the filter
// menu (a sheet on a phone), they show as chips in the bar, stay for the
// reader's next visit, and go with a press; a table its index answers sends
// them to the server, which reads "me" as whoever asks.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "owners", name: "Owners", type: "people" },
]
const sam = { id: SAM.user_uuid }
const priya = { id: PRIYA.user_uuid }
const work = (more: Record<string, unknown>[] = []) =>
  new TableServer(fields, [
    { item: "Booth", stage: "To do", owners: [sam] },
    { item: "Banner", stage: "Done", owners: [priya] },
    { item: "Flyer", stage: "Done", owners: [sam] },
    { item: "Poster", stage: "To do", owners: [priya, sam] },
    ...more,
  ])
// Sam's rows that are done, or posters.
const MINE_DONE_OR_POSTERS = {
  sort: [],
  match: "all",
  filters: [
    { field: "owners", op: "contains", value: "@me" },
    {
      match: "any",
      filters: [
        { field: "stage", op: "contains", value: "Done" },
        { field: "item", op: "contains", value: "post" },
      ],
    },
  ],
}

// Two groups deep: me, then Stage's choice, or a day and a word.
const DEEP = {
  sort: [],
  match: "all",
  filters: [
    { field: "owners", op: "contains", value: "@me" },
    {
      match: "any",
      filters: [
        { field: "stage", op: "contains", value: "Done" },
        {
          match: "all",
          filters: [
            { field: "due", op: "after", value: "2026-11-01" },
            { field: "item", op: "not_contains", value: "draft" },
          ],
        },
      ],
    },
  ],
}
/** A table saved with the deep view, open on it, and its filter menu opened by `press`. */
async function openDeep(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions, press: (target: Locator) => Promise<void>) {
  const server = new TableServer([...fields, { id: "due", name: "Due", type: "date" }], [{ item: "Booth", stage: "To do", owners: [sam], due: "2026-11-02" }])
  const view = "5a7e0000-0000-4000-8000-0000000000ee"
  server.savedViews = [{ id: view, table_id: server.id, name: "Deep", type: "grid", config: JSON.stringify({ rules: DEEP }), position: 0 }]
  const { page, close } = await server.open(browser, testInfo, SAM, options, view)
  await press(page.getByRole("button", { name: "Filter", exact: true }))
  return { page, close, menu: page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Add a filter" }) }) }
}

const frame = (page: Page) => page.locator("[data-table-frame]")
async function shows(page: Page, items: string[]) {
  for (const item of ["Booth", "Banner", "Flyer", "Poster"]) {
    // A grid's cell holds its text twice, in its field and in what it draws: a row shown has one or more, a row hidden none.
    const text = frame(page).getByText(item, { exact: true })
    if (items.includes(item)) await expect(text.first(), item).toBeVisible({ timeout: 15_000 })
    else await expect(text, item).toHaveCount(0, { timeout: 15_000 })
  }
}

for (const device of [
  { name: "at 1280, by mouse", options: {}, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())
  const choose = async (menu: Locator, label: string, option: string) => {
    await press(menu.getByRole("combobox", { name: label }))
    await press(menu.page().getByRole("option", { name: option, exact: true }))
  }

  test(`${device.name}, a member filters to their own rows that match any of a group, and the filters stay and go`, async ({ browser }, testInfo) => {
    const server = work()
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    await shows(page, ["Booth", "Banner", "Flyer", "Poster"])

    await press(page.getByRole("button", { name: "Filter", exact: true }))
    const menu = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Add a filter" }) })
    await press(menu.getByRole("button", { name: "Add a filter" }))
    await choose(menu, "Field", "Owners")
    // A name typed as text, or me: whoever opens the view.
    await press(menu.getByRole("button", { name: "Me, whoever opens the view" }))
    await expect(menu.getByRole("textbox", { name: "Value" })).toHaveCount(0)
    await shows(page, ["Booth", "Flyer", "Poster"])

    await press(menu.getByRole("button", { name: "Add a group" }))
    const group = menu.getByRole("group", { name: /^A group of/ })
    await expect(group).toHaveAccessibleName("A group of 1 filter")
    await choose(group, "Field", "Stage")
    await choose(group, "Value", "Done")
    await shows(page, ["Flyer"])
    await press(group.getByRole("button", { name: "Add a filter" }))
    await group.getByRole("textbox", { name: "Value" }).fill("post")
    // All of the group's filters: nothing is both done and a poster.
    await shows(page, [])
    await choose(group, "Match in this group", "any")
    await shows(page, ["Flyer", "Poster"])
    // Three levels deep at most: a group in this group could hold no other.
    await press(group.getByRole("button", { name: "Add a group" }))
    const inner = group.getByRole("group", { name: /^A group of/ })
    await expect(inner.getByRole("button", { name: "Add a filter" })).toBeVisible()
    await expect(inner.getByRole("button", { name: "Add a group" })).toHaveCount(0)
    if (device.touch) {
      const box = await menu.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      expect(box.scroll, "the menu, three levels deep, fits the phone without scrolling sideways").toBeLessThanOrEqual(box.client)
    }
    await press(inner.getByRole("button", { name: "Remove this group" }))
    await expect(group).toHaveAccessibleName("A group of 2 filters")
    // A float still closing ("any"'s select) holds Escape until its exit ends: Radix keeps it mounted as the top
    // layer, so the menu under it never hears the key. That race is beta's own (MF1) and its fix is a head of its
    // own after V4 (a closing float hands Escape to the one under it); until then the key waits for none to be left.
    await expect(page.locator('[data-overlay="float"][data-state="closed"]')).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)

    const chips = page.locator("[data-rule-chip]")
    await expect(chips).toHaveText(["Owners has me", "Any of 2 filters"])
    // The reader's filters stay for their next visit.
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(chips).toHaveText(["Owners has me", "Any of 2 filters"], { timeout: 60_000 })
    await shows(page, ["Flyer", "Poster"])

    await press(page.getByRole("button", { name: "Remove the group of 2 filters" }))
    await expect(chips).toHaveText(["Owners has me"])
    await shows(page, ["Booth", "Flyer", "Poster"])
    await close()
  })

  test(`${device.name}, a shared view of the reader's own rows asks the server for them, groups and me as they are`, async ({ browser }, testInfo) => {
    // A view's rows come from the server only past the bundle's page (500 rows): Priya's lines to do fill the table
    // out, and the view takes none of them.
    const server = work(Array.from({ length: 500 }, (_, i) => ({ item: `Line ${i}`, stage: "To do", owners: [priya] })))
    server.answersQuery = true
    const VIEW = "5a7e0000-0000-4000-8000-0000000000dd"
    server.savedViews = [{ id: VIEW, table_id: server.id, name: "Mine", type: "grid", config: JSON.stringify({ rules: MINE_DONE_OR_POSTERS }), position: 0 }]
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...device.options })
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto(`/app/tables/${server.id}?v=${VIEW}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await shows(page, ["Flyer", "Poster"])
    expect(server.queries.at(-1)?.spec.filter).toEqual({
      op: "and",
      filters: [
        { field: "field:owners", operator: "is", values: [{ text: "@me" }] },
        {
          op: "or",
          filters: [
            { field: "field:stage", operator: "contains", values: [{ text: "Done" }] },
            { field: "field:item", operator: "contains", values: [{ text: "post" }] },
          ],
        },
      ],
    })
    await expect(page.locator("[data-rule-chip]")).toHaveText(["Owners has me", "Any of 2 filters"])
    await context.close()
  })

  test(`${device.name}, a filter two groups in shows the whole of its value`, async ({ browser }, testInfo) => {
    // DESIGN-BUILD-20's M1: on a phone, two groups' insets left a date "11/01/" under its glyph, and "draft" as "dı".
    const { menu, close } = await openDeep(browser, testInfo, device.options, press)
    // Stage's choice, the day and the word: Me is a token of its own.
    const values = menu.getByLabel("Value")
    await expect(values).toHaveCount(3, { timeout: 15_000 })
    const edges = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right }
    })
    let under = 0
    for (const value of await values.all()) {
      await value.scrollIntoViewIfNeeded()
      const seen = await value.evaluate((el) => {
        const r = el.getBoundingClientRect()
        // A box that holds more than it shows, the control's own or one it draws in, cuts its value.
        const cut = [el, ...el.querySelectorAll<HTMLElement>("*")].filter((n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth).length
        // Its filter's field: the nearest box around the value that holds one.
        let row = el.parentElement
        while (row && !row.querySelector('[aria-label="Field"]')) row = row.parentElement
        const field = row?.querySelector('[aria-label="Field"]')?.getBoundingClientRect()
        // The next filter in its list, where one follows.
        const next = row?.parentElement?.nextElementSibling?.querySelector('[aria-label="Field"]')?.getBoundingClientRect()
        return {
          cut,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          fieldTop: field?.top ?? Number.NaN,
          fieldBottom: field?.bottom ?? Number.NaN,
          next: next?.top,
          text: el instanceof HTMLInputElement ? el.value : el.textContent,
        }
      })
      expect(seen.cut, `"${seen.text}" shows whole`).toBe(0)
      expect(seen.left, `"${seen.text}" starts inside the menu`).toBeGreaterThanOrEqual(edges.left)
      expect(seen.right, `"${seen.text}" ends inside the menu`).toBeLessThanOrEqual(edges.right)
      // On a computer the menu widens with its groups: a value two groups in stays on its field's line (DESIGN-BUILD-21's M1).
      if (!device.touch) expect(Math.abs(seen.top - seen.fieldTop), `"${seen.text}" sits on its field's line`).toBeLessThanOrEqual(1)
      // On a phone a value under its field reads as one filter: nearer its field than the next filter (DESIGN-BUILD-21's SF-a).
      else if (seen.top > seen.fieldBottom && seen.next !== undefined) {
        under++
        expect(seen.next - seen.bottom, `"${seen.text}": the next filter, further than its own field`).toBeGreaterThan(seen.top - seen.fieldBottom)
      }
    }
    if (device.touch) expect(under, "a value under its field, another filter after it").toBeGreaterThan(0)
    await close()
  })

  // DESIGN-BUILD-21's M2: Radix placed the date picker by its stand-in's size, and kept the taller panel below its
  // field, cut at the window's foot.
  if (!device.touch)
    for (const height of [900, 720])
      test(`at 1280×${height}, a day's picker two groups in opens inside the window, Clear in reach`, async ({ browser }, testInfo) => {
        const { page, menu, close } = await openDeep(browser, testInfo, { viewport: { width: 1280, height } }, press)
        await press(menu.getByRole("button", { name: "Value, Sun 1 Nov 2026" }))
        const clear = page.getByRole("dialog").filter({ has: page.getByRole("group", { name: "Quick days" }) }).getByRole("button", { name: "Clear" })
        await expect(clear).toBeVisible()
        const seen = await clear.evaluate((el) => {
          const box = el.closest('[data-overlay="float"]')?.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          return { top: box?.top ?? Number.NaN, bottom: box?.bottom ?? Number.NaN, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el }
        })
        expect(seen.top, "the picker's top, 8px or more inside the window").toBeGreaterThanOrEqual(8)
        expect(seen.bottom, "the picker's foot, 8px or more inside the window").toBeLessThanOrEqual(height - 8)
        expect(seen.hit, "Clear, what the pointer finds at its centre").toBe(true)
        await close()
      })
}
