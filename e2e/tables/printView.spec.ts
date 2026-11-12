import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Print or save as PDF (scorecard gsheets-import-02, item 2): the table's More
// menu prints the view as the page shows it, through the browser's print
// dialog, which saves the PDF (lib/tables/printView): every row the view
// shows, not only those the grid draws, as its filter and sort show them, the
// shown fields in their order, a header row that repeats on every page, a
// grouped view's headings, the table's and the view's name as the title.
// Closing the dialog leaves nothing behind. An empty view prints a page that
// says so; a read that fails, or a view over the print's cap, prints nothing
// and says so in the toast that counted the rows. A print is light in a dark
// theme too. It is titled with the view the views menu shows, one made,
// renamed or deleted here included (CODE-REVIEWER-257 F1).

const SHOTS = process.env.SHOTS_DIR
const VIEW = "5a7e0000-0000-4000-8000-0000000000d1"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_won0000000", label: "Won" }, { id: "o_lost000000", label: "Lost" }] } },
  { id: "spend", name: "Spend", type: "number" },
]
/** `n` deals, every other one won, each spending ten times its number. */
const deals = (n: number) => Array.from({ length: n }, (_, i) => ({ item: `Deal ${String(i).padStart(4, "0")}`, stage: i % 2 ? "Lost" : "Won", spend: i * 10 }))
/** 1,200 deals: 600 won, more than a window of the view (WINDOW_ROWS 500). */
const many = deals(1200)
const wonBySpend = { sort: [{ field: "spend", dir: "desc" }], filters: [{ field: "stage", op: "is", value: "Won" }], match: "all" }

type Printed = { title: string; heading: string | null; head: string[][]; numeric: boolean[]; rows: string[][]; groups: string[] }

/** The table on its one saved view, `rules`, named `name`. */
function served(rows: Record<string, unknown>[], name: string, rules: Record<string, unknown>) {
  const server = new TableServer(fields, rows)
  server.savedViews = [{ id: VIEW, table_id: server.id, name, type: "grid", config: JSON.stringify({ rules }), position: 0 }]
  return server
}

/** Stands in for the print dialog: keeps what it would print, then closes, as Esc does (afterprint), unless `stay`. */
async function standIn(page: Page, stay = false) {
  await page.evaluate((stay) => {
    const w = window as unknown as { printed: Printed[]; hosted: number }
    w.printed = []
    // Every print host put on the page, filled or not: a print that says it failed draws none.
    w.hosted = 0
    new MutationObserver((changes) => {
      for (const c of changes) for (const n of c.addedNodes) if (n instanceof Element && n.matches("[data-table-print]")) w.hosted++
    }).observe(document.documentElement, { childList: true, subtree: true })
    window.print = () => {
      const host = document.querySelector("[data-table-print]")
      const cells = (tr: Element) => Array.from(tr.children).map((c) => c.textContent ?? "")
      w.printed.push({
        title: document.title,
        heading: host?.querySelector("h1")?.textContent ?? null,
        head: Array.from(host?.querySelectorAll("thead tr") ?? []).map(cells),
        numeric: Array.from(host?.querySelectorAll("thead th") ?? []).map((th) => th.classList.contains("n")),
        rows: Array.from(host?.querySelectorAll("tbody tr:not([data-group])") ?? []).map(cells),
        groups: Array.from(host?.querySelectorAll("tbody tr[data-group]") ?? []).map((tr) => tr.textContent ?? ""),
      })
      if (!stay) window.dispatchEvent(new Event("afterprint"))
    }
  }, stay)
}
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: Printed[] }).printed)
const hosted = (page: Page) => page.evaluate(() => (window as unknown as { hosted: number }).hosted)

/** A state's frames, light then dark (the theme follows the system's): `shown` stays on screen in each. */
async function inBothThemes(page: Page, frame: string, shown: Locator[]) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme === "dark")
    for (const l of shown) await expect(l).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${frame}-${theme}.png`, animations: "disabled" })
  }
}

/** The paper as the print dialog draws it (print media), kept as `frame` if named, then the dialog closed and nothing left. */
async function paper(page: Page, frame?: string) {
  await page.emulateMedia({ media: "print" })
  await expect(page.locator("[data-table-print]")).toBeVisible()
  if (SHOTS && frame) await page.screenshot({ path: `${SHOTS}/${frame}.png`, fullPage: true, animations: "disabled" })
  await page.emulateMedia({ media: "screen" })
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
  await expect(page.locator("[data-table-print], style[data-table-print-style]")).toHaveCount(0)
}

const devices = [
  { name: "at 1280, by mouse", short: "1280", options: { viewport: { width: 1280, height: 900 } }, touch: false },
  { name: "at 390, by touch", short: "390", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]

for (const device of devices) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())
  const print = async (page: Page) => {
    await press(page.getByRole("button", { name: "More", exact: true }))
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Print or save as PDF" }))
  }
  /** Picks `item` in the views menu, and names the view in the dialog it opens, if it opens one. */
  const views = async (page: Page, item: string, naming?: { dialog: string; name: string }) => {
    await press(page.getByRole("button", { name: /^View: / }))
    await press(page.getByRole("menu").getByRole("menuitem", { name: item }))
    if (!naming) return
    const dialog = page.getByRole("dialog", { name: naming.dialog })
    await dialog.getByRole("textbox", { name: "Name" }).fill(naming.name)
    await press(dialog.getByRole("button", { name: "Save", exact: true }))
    await expect(dialog).toHaveCount(0)
  }
  /** The title of the `n`th print (from 1). */
  const printedTitle = async (page: Page, n: number) => {
    await print(page)
    await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(n)
    return (await printed(page))[n - 1].title
  }

  test(`${device.name}, a filtered and sorted view prints every row it shows, not only those drawn, under the table's and view's name, and leaves nothing behind`, async ({ browser }, testInfo) => {
    const server = served(many, "Won by spend", wonBySpend)
    // The table's index answers its views a window at a time: the page holds 500 of the view's 600 rows.
    server.answersQuery = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    const frame = page.locator("[data-table-frame]")
    await expect(frame.getByText("Deal 1198", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    const before = await page.title()
    await standIn(page)
    await print(page)
    await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(1)
    // The rows the page lacked were read first: the toast that counts them says so (4 s).
    await expect(page.getByText("Printing 600 rows")).toBeVisible()
    const [p] = await printed(page)
    expect(p.title).toBe("Deals — Won by spend")
    expect(p.heading).toBe("Deals — Won by spend")
    expect(p.head).toEqual([["Item", "Stage", "Spend"]])
    expect(p.numeric).toEqual([false, false, true])
    // Every won deal, by spend from the most: 600 rows, more than the page holds and many more than the grid draws.
    const won = many.filter((r) => r.stage === "Won").sort((a, b) => b.spend - a.spend)
    expect(p.rows).toEqual(won.map((r) => [r.item, "Won", String(r.spend)]))
    expect(await frame.getByText(/^Deal \d{4}$/).count()).toBeLessThan(won.length)
    // The dialog closed (Esc or printed): nothing left on the page, and its title back.
    await expect(page.locator("[data-table-print], style[data-table-print-style]")).toHaveCount(0)
    await expect.poll(() => page.title()).toBe(before)
    await close()
  })

  test(`${device.name}, a grouped view prints each group's heading before its rows`, async ({ browser }, testInfo) => {
    const rows = many.slice(0, 6)
    const server = served(rows, "By stage", { sort: [{ field: "spend", dir: "asc" }], filters: [], match: "all", groups: [{ field: "stage", dir: "asc" }] })
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]").getByText("Deal 0005", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await standIn(page, true)
    await print(page)
    await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(1)
    const [p] = await printed(page)
    expect(p.groups).toEqual(["Stage: Won · 3 rows", "Stage: Lost · 3 rows"])
    expect(p.rows.map((r) => r[0])).toEqual(["Deal 0000", "Deal 0002", "Deal 0004", "Deal 0001", "Deal 0003", "Deal 0005"])
    // Paper is light in either theme: one frame, at 1280.
    await paper(page, device.touch ? undefined : "print-preview-grouped-1280-light")
    await close()
  })

  test(`${device.name}, an empty view prints a page that says it has no rows`, async ({ browser }, testInfo) => {
    const server = served(
      many.slice(0, 4).map((r) => ({ ...r, stage: "Won" })),
      "Lost deals",
      { sort: [], filters: [{ field: "stage", op: "is", value: "Lost" }], match: "all" },
    )
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]")).not.toHaveAttribute("aria-busy", "true", { timeout: 60_000 })
    await standIn(page, true)
    await print(page)
    await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(1)
    const [p] = await printed(page)
    expect(p.title).toBe("Deals — Lost deals")
    expect(p.head).toEqual([["Item", "Stage", "Spend"]])
    expect(p.rows).toEqual([["No rows in this view."]])
    await paper(page, device.touch ? undefined : "print-preview-empty-1280-light")
    await close()
  })

  test(`${device.name}, a read that fails prints nothing and says so, as a print`, async ({ browser }, testInfo) => {
    const server = served(many, "Won by spend", wonBySpend)
    server.answersQuery = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]").getByText("Deal 1198", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    // Every row's read (GET /tables/<id>/rows) fails from here on.
    await page.route((url) => url.pathname.endsWith(`/tables/${server.id}/rows`), (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, json: { msg: "down" } }) : route.fallback()))
    await standIn(page)
    await print(page)
    // Exact: the toast's own words, not the screen reader's announcement of them.
    const said = [page.getByText("Couldn't print the table", { exact: true }), page.getByText("Not every row could be read. Try again.", { exact: true })]
    await expect(said[0]).toBeVisible({ timeout: 30_000 })
    await inBothThemes(page, `print-failed-${device.short}`, said)
    // The print dialog never opened, and no print was ever drawn.
    expect(await printed(page)).toEqual([])
    expect(await hosted(page)).toBe(0)
    await expect(page.locator("[data-table-print], style[data-table-print-style]")).toHaveCount(0)
    await close()
  })

  test(`${device.name}, while the rows the page lacks are read, the toast counts them against the table's rows`, async ({ browser }, testInfo) => {
    const server = served(deals(2400), "Won by spend", wonBySpend)
    server.answersQuery = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]").getByText("Deal 2398", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    // The read of every row goes through the table's 2,400 rows, two pages of 1,000 at a time: those past the first two wait for the frames.
    let release = () => {}
    const held = new Promise<void>((done) => (release = done))
    await page.route(
      (url) => url.pathname.endsWith(`/tables/${server.id}/rows`) && Number(url.searchParams.get("offset")) >= 2000,
      async (route) => {
        if (route.request().method() === "GET") await held
        await route.fallback()
      },
    )
    await standIn(page)
    await print(page)
    const reading = [page.getByText("Getting the print ready", { exact: true }), page.getByText("Reading rows: 2,000 of 2,400", { exact: true })]
    await expect(reading[1]).toBeVisible({ timeout: 30_000 })
    await inBothThemes(page, `print-reading-${device.short}`, reading)
    expect(await printed(page)).toEqual([])
    release()
    await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(1)
    await expect(page.getByText("Printing 1,200 rows")).toBeVisible()
    await close()
  })

  test(`${device.name}, a view over the print's cap prints nothing, and the toast that counted its rows says so`, async ({ browser }, testInfo) => {
    const big = Array.from({ length: 5_001 }, (_, i) => ({ item: `Deal ${String(i).padStart(4, "0")}`, stage: "Won", spend: i }))
    const server = served(big, "Every deal", { sort: [], filters: [], match: "all" })
    server.answersQuery = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]").getByText("Deal 0000", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await standIn(page)
    await print(page)
    const said = [page.getByText("Too many rows to print", { exact: true }), page.getByText("This view shows 5,001 rows, and a print takes up to 5,000. Filter the view, or export CSV.", { exact: true })]
    await expect(said[0]).toBeVisible({ timeout: 60_000 })
    // One toast: the one that counted the rows became the refusal.
    await expect(page.getByText("Getting the print ready", { exact: true })).toHaveCount(0)
    await expect(said[0]).toHaveCount(1)
    await inBothThemes(page, `print-cap-${device.short}`, said)
    expect(await printed(page)).toEqual([])
    expect(await hosted(page)).toBe(0)
    await close()
  })

  test(`${device.name}, a print whose code can't load (offline) prints nothing, and says so as a print`, async ({ browser }, testInfo) => {
    const server = served(many.slice(0, 12), "Won by spend", wonBySpend)
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.locator("[data-table-frame]").getByText("Deal 0010", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await standIn(page)
    await press(page.getByRole("button", { name: "More", exact: true }))
    const item = page.getByRole("menu").getByRole("menuitem", { name: "Print or save as PDF" })
    await expect(item).toBeVisible()
    // The print's chunk is read on use: from here on no chunk comes.
    await page.route(/\/_next\/static\/chunks\//, (route) => route.abort("internetdisconnected"))
    await press(item)
    await expect(page.getByText("Couldn't print the table", { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toBeVisible()
    expect(await printed(page)).toEqual([])
    expect(await hosted(page)).toBe(0)
    await close()
  })

  test(`${device.name}, a view made here prints under its own name`, async ({ browser }, testInfo) => {
    const server = served(many.slice(0, 12), "Won by spend", wonBySpend)
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.getByRole("button", { name: "View: Won by spend", exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("[data-table-frame]").getByText("Deal 0010", { exact: true }).first()).toBeVisible()
    await standIn(page)
    await views(page, "New view", { dialog: "New view", name: "Big deals" })
    await expect(page.getByRole("button", { name: "View: Big deals", exact: true })).toBeVisible()
    expect(await printedTitle(page, 1)).toBe("Deals — Big deals")
    await close()
  })

  test(`${device.name}, a view renamed here prints under its new name, and with the last view deleted under the table's alone`, async ({ browser }, testInfo) => {
    const server = served(many.slice(0, 12), "Won by spend", wonBySpend)
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, VIEW)
    await expect(page.getByRole("button", { name: "View: Won by spend", exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("[data-table-frame]").getByText("Deal 0010", { exact: true }).first()).toBeVisible()
    await standIn(page)
    await views(page, "Rename", { dialog: "Rename view", name: "Won, biggest first" })
    await expect(page.getByRole("button", { name: "View: Won, biggest first", exact: true })).toBeVisible()
    expect(await printedTitle(page, 1)).toBe("Deals — Won, biggest first")
    await views(page, "Delete view")
    await press(page.getByRole("button", { name: "Delete view", exact: true }))
    await expect(page.getByRole("button", { name: "View: none saved", exact: true })).toBeVisible()
    expect(await printedTitle(page, 2)).toBe("Deals")
    await close()
  })

  for (const theme of ["light", "dark"] as const) {
    test(`${device.name}, ${theme}, the menu offers the print, and the page prints light`, async ({ browser }, testInfo) => {
      const server = served(many.slice(0, 12), "Won by spend", wonBySpend)
      const { page, close } = await server.open(browser, testInfo, SAM, { ...device.options, colorScheme: theme }, VIEW)
      await expect(page.locator("[data-table-frame]").getByText("Deal 0010", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await standIn(page, true)
      await press(page.getByRole("button", { name: "More", exact: true }))
      const item = page.getByRole("menu").getByRole("menuitem", { name: "Print or save as PDF" })
      await expect(item).toBeVisible()
      await expect(item).toBeInViewport()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/print-menu-${device.short}-${theme}.png`, animations: "disabled" })
      await press(item)
      await expect.poll(async () => (await printed(page)).length, { timeout: 30_000 }).toBe(1)
      // As the print dialog draws it: the host alone, on white, whatever the theme.
      await page.emulateMedia({ media: "print" })
      const host = page.locator("[data-table-print]")
      await expect(host).toBeVisible()
      await expect(page.locator("[data-table-frame]")).toBeHidden()
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)")
      expect(await host.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 0, 0)")
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/print-preview-${device.short}-${theme}.png`, fullPage: true, animations: "disabled" })
      await page.emulateMedia({ media: "screen" })
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
      await expect(page.locator("[data-table-print], style[data-table-print-style]")).toHaveCount(0)
      await close()
    })
  }
}
