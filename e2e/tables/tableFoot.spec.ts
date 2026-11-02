import { expect, test, type Locator, type Page } from "@playwright/test"

import { finger, flingEnded } from "../finger"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// DB-23's must (27 Oct, live at 1280x900): on a tall table the line under the
// grid, "+ New row", was cut in half at the card's foot or fell below it, and
// the summary bar with it. The grid's body took a height guessed from what
// stands above it (the screen less 16rem), and a notice over the page or a
// toolbar on two lines made the guess too tall. Now the body takes the height
// left under the toolbar, so what is under it ends inside the card whatever
// stands above, and on every view that shares the frame.

const SHOTS = process.env.SHOTS_DIR
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "due", name: "Due", type: "date" },
]
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ item: `Line ${i}`, stage: i % 2 ? "Done" : "To do", cost: i * 10, due: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` }))
// A grouped, sorted view with nested filters: its chips, its count and the toolbar's actions run to two lines at 1280.
const RULES = {
  sort: [{ field: "cost", dir: "desc" }],
  filters: [
    { field: "item", op: "contains", value: "Line" },
    { field: "cost", op: "gte", value: "0" },
    { match: "any", filters: [{ field: "stage", op: "is", value: "To do" }, { field: "item", op: "contains", value: "1" }] },
  ],
  match: "all",
  groups: [{ field: "stage", dir: "asc" }],
}

/** A notice over the page, one line as the demo's note is: in the sheet's column, above its scroller. */
const addNotice = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.querySelector("[data-main-sheet]")
    const scroller = sheet?.querySelector(":scope > [data-split-view]")
    if (!sheet || !scroller) throw new Error("no sheet to put a notice in")
    const note = document.createElement("div")
    note.setAttribute("data-test-notice", "")
    note.style.cssText = "flex: none; height: 44px; padding: 12px 24px"
    note.textContent = "A notice over the page, as tall as the demo's"
    sheet.insertBefore(note, scroller)
  })

/** How a box sits in the card: where it ends against the card's foot, and whether the point at its middle is it (not clipped or covered). */
async function inCard(page: Page, target: Locator) {
  const card = await page.locator("[data-main-sheet]").boundingBox()
  const box = await target.boundingBox()
  if (!card || !box) throw new Error("no box")
  const hit = await target.evaluate((el, [x, y]) => {
    const at = document.elementFromPoint(x, y)
    return !!at && (el === at || el.contains(at))
  }, [box.x + box.width / 2, box.y + box.height / 2] as const)
  return { over: Math.round(box.y + box.height - (card.y + card.height)), hit, bottom: Math.round(box.y + box.height), foot: Math.round(card.y + card.height) }
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A notice over a phone's page, as tall as the demo's note there: in the shell, above the page's scroller. */
const addPhoneNotice = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector("[data-app-scroller]")
    if (!scroller?.parentElement) throw new Error("no scroller to put a notice over")
    const note = document.createElement("div")
    note.setAttribute("data-test-notice", "")
    note.style.cssText = "flex: none; height: 99px; padding: 12px 16px"
    note.textContent = "A notice over the page, as tall as the demo's on a phone"
    scroller.parentElement.insertBefore(note, scroller)
  })

/**
 * How a box sits on a phone's screen: where it ends against the screen's foot,
 * and whether the point in the middle of what shows of it is it (a summary bar
 * runs as wide as the grid's columns, past the screen's edge).
 */
async function onScreen(page: Page, target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error("no box")
  const { width, height } = page.viewportSize()!
  const x = (Math.max(box.x, 0) + Math.min(box.x + box.width, width)) / 2
  const y = (Math.max(box.y, 0) + Math.min(box.y + box.height, height)) / 2
  const hit = await target.evaluate((el, [x, y]) => {
    const at = document.elementFromPoint(x, y)
    return !!at && (el === at || el.contains(at))
  }, [x, y] as const)
  return { over: Math.round(box.y + box.height - height), hit, bottom: Math.round(box.y + box.height) }
}

/** What the page itself can still scroll, beyond what it has. */
const pageRoom = (page: Page) => page.locator("[data-app-scroller]").evaluate((s) => s.scrollHeight - s.clientHeight - s.scrollTop)

/** A finger's swipe up from (x, from) to (x, to), one move a frame, then the fling run out on `scroller`. */
async function swipeUp(page: Page, scroller: Locator, x: number, from: number, to: number) {
  const touch = await finger(page)
  await touch.down(x, from)
  for (let i = 1; i <= 12; i++) {
    await touch.move(x, Math.round(from + ((to - from) * i) / 12))
    await page.waitForTimeout(16)
  }
  await touch.up()
  await flingEnded(scroller)
}

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

for (const [width, height] of [
  [1280, 900],
  [1280, 720],
] as const) {
  for (const notice of [false, true]) {
    const name = `${width}x${height}${notice ? ", under a notice" : ""}`
    test(`at ${name}, a tall grouped table's summary bar and "+ New row" end inside the card`, async ({ browser }, testInfo) => {
      const server = new TableServer(fields, rowsOf(300))
      const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width, height } })
      await page.evaluate(([id, rules]) => localStorage.setItem(`onecamp:tableView:${id}`, JSON.stringify(rules)), [server.id, RULES] as const)
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(page.locator("tbody tr[data-group-header]").first()).toBeVisible({ timeout: 60_000 })
      const bar = page.locator("tr[data-summary-bar]")
      await expect(bar).toBeVisible({ timeout: 30_000 })
      if (notice) await addNotice(page)
      const toolbar = await page.locator("[data-table-toolbar]").first().boundingBox()
      const newRow = page.locator("[data-new-row]")
      const row = await inCard(page, newRow)
      const sums = await inCard(page, bar)
      console.log(`TABLE-FOOT ${name}: toolbar ${Math.round(toolbar?.height ?? 0)} px; New row ends ${row.bottom} against the foot ${row.foot} (${row.over} over, hit ${row.hit}); summary bar ${sums.over} over, hit ${sums.hit}`)
      expect(toolbar!.height, "the toolbar runs to two lines").toBeGreaterThan(60)
      expect(row.over, "New row ends inside the card").toBeLessThanOrEqual(0)
      expect(row.hit, "the point at New row's middle is New row").toBe(true)
      expect(sums.over, "the summary bar ends inside the card").toBeLessThanOrEqual(0)
      expect(sums.hit, "the point at the summary bar's middle is the bar").toBe(true)
      // The grid's rows scroll above the line, never under it.
      const body = await page.locator("[data-table-grid]").boundingBox()
      const line = await newRow.boundingBox()
      expect(Math.round(body!.y + body!.height)).toBeLessThanOrEqual(Math.round(line!.y))
      await shoot(page, `tableFoot-${width}x${height}${notice ? "-notice" : ""}`)
      if (notice) {
        // A row selected: its bar floats on the New row line, under the summary bar (DB-23), and takes none of the rows' height.
        const bodyBefore = await page.locator("[data-table-grid]").boundingBox()
        const first = page.locator("tbody tr[data-row]").first()
        await first.hover()
        await first.getByRole("checkbox", { name: /^Select row / }).click()
        const selected = page.getByRole("toolbar", { name: "Selected rows" })
        await expect(selected).toBeVisible({ timeout: 30_000 })
        const floats = await inCard(page, selected)
        const barBox = await selected.boundingBox()
        expect(floats.over, "the selection bar ends inside the card").toBeLessThanOrEqual(0)
        expect(floats.hit, "the point at the selection bar's middle is the bar").toBe(true)
        const mid = barBox!.y + barBox!.height / 2
        expect(mid, "the selection bar sits on the New row line").toBeGreaterThanOrEqual(line!.y)
        expect(mid, "the selection bar sits on the New row line").toBeLessThanOrEqual(line!.y + line!.height)
        const sumsBox = (await bar.boundingBox())!
        expect(Math.round(barBox!.y), "the selection bar hides no sum").toBeGreaterThanOrEqual(Math.round(sumsBox.y + sumsBox.height) - 1)
        // "+ New row" is still in reach at the line's start.
        const plus = (await newRow.locator("svg").first().boundingBox())!
        const plusHit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-new-row]"), [plus.x + plus.width / 2, plus.y + plus.height / 2] as const)
        expect(plusHit, "the point at New row's plus is New row").toBe(true)
        expect((await page.locator("[data-table-grid]").boundingBox())!.height).toBe(bodyBefore!.height)
        await shoot(page, `tableFoot-${width}x${height}-notice-selected`)
      }
      await close()
    })
  }
}

test("at 1280x900, a short table's \"+ New row\" sits right under its last row", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(4))
  const { page, close } = await server.open(browser, testInfo, SAM)
  const rows = page.locator("tbody tr[data-row]")
  await expect(rows).toHaveCount(4, { timeout: 60_000 })
  const last = await rows.last().boundingBox()
  const line = await page.locator("[data-new-row]").boundingBox()
  // The body grows with its rows: no gap opens between the last row and the line (a summary bar of 32 px may sit between).
  expect(Math.round(line!.y - (last!.y + last!.height))).toBeLessThanOrEqual(34)
  await shoot(page, "tableFoot-1280x900-short")
  await close()
})

// The list and the gallery kept the cap on a computer too, till V-304 (1 Nov) fitted every view's body.
for (const [view, box] of [
  ["Board", "[data-table-board]"],
  ["Calendar", "[data-table-calendar]"],
  ["List", "[data-list-scroll]"],
  ["Gallery", "[data-gallery-scroll]"],
  ["Timeline", "[data-timeline-scroll]"],
] as const) {
  test(`at 1280x720 under a notice, a tall ${view.toLowerCase()} scrolls inside the card`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 720 } })
    await page.getByRole("group", { name: "View", exact: true }).getByRole("button", { name: view, exact: true }).click()
    const body = page.locator(box)
    await expect(body).toBeVisible({ timeout: 60_000 })
    await addNotice(page)
    const at = await inCard(page, body)
    console.log(`TABLE-FOOT ${view} 1280x720, under a notice: ends ${at.bottom} against the foot ${at.foot} (${at.over} over)`)
    expect(at.over, `the ${view.toLowerCase()}'s scroll box ends inside the card`).toBeLessThanOrEqual(0)
    if (view !== "Calendar") expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight), `the ${view.toLowerCase()} scrolls inside its box`).toBe(true)
    await shoot(page, `tableFoot-${view.toLowerCase()}-1280x720-notice`)
    await close()
  })
}

// A4 (29 Oct, the live walk): on a phone the New row line sat under the
// screen's foot, so a row's selection bar stuck to the foot instead, 7 px over
// the summary bar's sums. On a phone it keeps 8 px over the summary bar,
// wherever the page is scrolled, in either theme.
for (const theme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${theme}, a row selected: its bar keeps 8 px over the summary bar`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: theme })
    // Six fields: a phone would show the list; this reader keeps the grid.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    const first = page.locator("tbody tr[data-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    const sums = page.locator("tr[data-summary-bar]")
    await expect(sums).toBeVisible({ timeout: 30_000 })
    await first.getByRole("checkbox", { name: /^Select row / }).tap()
    const selected = page.getByRole("toolbar", { name: "Selected rows" })
    await expect(selected).toBeVisible({ timeout: 30_000 })
    const gap = async () => {
      const s = (await selected.boundingBox())!
      const b = (await sums.boundingBox())!
      return Math.round(b.y - (s.y + s.height))
    }
    await expect.poll(gap, { message: "at the page's top, 8 px or more between the selection bar and the summary bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-${theme}`)
    // The page at its end: the New row line in sight.
    await page.locator("[data-new-row]").scrollIntoViewIfNeeded()
    await expect.poll(gap, { message: "at the page's end, 8 px or more between the selection bar and the summary bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-end-${theme}`)
    await close()
  })
}

// A4's should-fix (DB-29, 29 Oct): with a row selected, the grid scrolled to
// its end left its last row under the selection bar, its number and Stage
// hidden, and no way to scroll it clear. While the bar shows, the rows end
// with room for it, so the last row stops above the bar.
for (const theme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${theme}, a row selected: the last row scrolls clear of its bar`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: theme })
    // Six fields: a phone would show the list; this reader keeps the grid.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    const first = page.locator("tbody tr[data-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("tr[data-summary-bar]")).toBeVisible({ timeout: 30_000 })
    await first.getByRole("checkbox", { name: /^Select row / }).tap()
    const selected = page.getByRole("toolbar", { name: "Selected rows" })
    await expect(selected).toBeVisible({ timeout: 30_000 })
    // The page and the grid each at their end: the last row in sight.
    await page.locator("[data-new-row]").scrollIntoViewIfNeeded()
    const grid = page.locator("[data-table-grid]")
    const last = page.locator("tbody tr[data-row]").filter({ hasText: "Line 299" })
    await expect
      .poll(async () => {
        await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
        return last.count()
      }, { message: "the last row drawn at the grid's end" })
      .toBe(1)
    const clearance = async () => {
      await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      const r = (await last.boundingBox())!
      const s = (await selected.boundingBox())!
      return Math.round(s.y - (r.y + r.height))
    }
    await expect.poll(clearance, { message: "8 px or more between the last row and the selection bar" }).toBeGreaterThanOrEqual(8)
    await shoot(page, `tableFoot-390-selected-last-${theme}`)
    // Cleared, the rows end where they did.
    await selected.getByRole("button", { name: /^Clear/ }).tap()
    await expect(selected).toHaveCount(0)
    await expect(page.locator("tbody tr[data-float-room]")).toHaveCount(0)
    await close()
  })
}

// V-304 (1 Nov, the v2.77.0 triage's E7-E11): on a phone the view's box took
// the screen less 16rem, a guess at what stands above it, and more stood above
// it, so the summary bar and "+ New row" started under the screen's foot, and
// a finger on the rows moved only the rows, which hold their own scroll. The
// page is the screen's height now and the view takes what is left under the
// toolbar, as on a computer: the foot is whole at first sight, under a notice
// too and on every view, and a body keeps its floor, past which the page
// scrolls as a whole.
for (const notice of [false, true]) {
  const name = `390 with touch${notice ? ", under a notice" : ""}`
  test(`at ${name}, a tall table's summary bar and "+ New row" are whole on the screen at first sight, and stay so under a finger on the rows`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
    // Six fields: a phone would show the list; this reader keeps the grid.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.locator("tbody tr[data-row]").first()).toBeVisible({ timeout: 60_000 })
    const sums = page.locator("tr[data-summary-bar]")
    await expect(sums).toBeVisible({ timeout: 30_000 })
    if (notice) await addPhoneNotice(page)
    const newRow = page.locator("[data-new-row]")
    const grid = page.locator("[data-table-grid]")
    // No swipe: what is under the rows is whole on the screen, and the page has nothing to scroll.
    await expect.poll(async () => (await onScreen(page, newRow)).over, { message: "New row ends on the screen at first sight" }).toBeLessThanOrEqual(0)
    const row = await onScreen(page, newRow)
    const bar = await onScreen(page, sums)
    const room = await pageRoom(page)
    const banners = await page.evaluate(() => document.querySelector("[data-app-banners]")?.getBoundingClientRect().height ?? 0)
    console.log(`TABLE-FOOT ${name}: New row ends ${row.bottom} (${row.over} over the screen's foot, hit ${row.hit}); summary bar ${bar.over} over, hit ${bar.hit}; the page's room ${room} px; the shell's banners ${Math.round(banners)} px`)
    expect(row.hit, "the point at New row's middle is New row").toBe(true)
    expect(bar.over, "the summary bar ends on the screen").toBeLessThanOrEqual(0)
    expect(bar.hit, "the point at the summary bar's middle is the bar").toBe(true)
    expect(room, "the page has nothing to scroll").toBeLessThanOrEqual(1)
    // The grid's rows scroll above the line, never under it.
    const body = (await grid.boundingBox())!
    expect(Math.round(body.y + body.height)).toBeLessThanOrEqual(Math.round((await newRow.boundingBox())!.y))
    await shoot(page, `tableFoot-390${notice ? "-notice" : ""}`)
    // A finger on the rows: they scroll in their box, and the foot stays whole.
    for (let swipe = 0; swipe < 3; swipe++) await swipeUp(page, grid, 195, Math.round(body.y + body.height * 0.75), Math.round(body.y + body.height * 0.2))
    expect(await grid.evaluate((el) => el.scrollTop), "the rows scrolled under the finger").toBeGreaterThan(0)
    expect((await onScreen(page, newRow)).over, "New row still ends on the screen").toBeLessThanOrEqual(0)
    const after = await onScreen(page, sums)
    expect(after.over, "the summary bar still ends on the screen").toBeLessThanOrEqual(0)
    expect(after.hit, "the point at the summary bar's middle is still the bar").toBe(true)
    await close()
  })
}

// MAIN 2 Nov (V-304 re-cut on V-236): on a phone a view fills the room between its top and the top of what owns the
// screen's foot: the floating tab bar's top where the page shows one, or else the home indicator's pad (--phone-floor;
// a table's page owns its bottom edge, lib/utils/mobileBottomNav, so MobileNavigationBar sets it then). Its foot (the
// sums and "+ New row", or the list's end) sits just above that, 8 px clear, never under it.
for (const view of ["grid", "list"] as const) {
  test(`at 390 with touch, a tall table's ${view} ends just above the tab bar's top, or the home indicator's pad where the page has no bar`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
    await page.evaluate(([id, list]) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list })), [server.id, view === "list"] as const)
    await page.reload({ waitUntil: "domcontentloaded" })
    const foot = page.locator(view === "grid" ? "[data-new-row]" : "[data-table-list] [data-list-scroll]")
    await expect(foot).toBeVisible({ timeout: 60_000 })
    if (view === "grid") await expect(page.locator("tr[data-summary-bar]")).toBeVisible({ timeout: 30_000 })
    const tabs = page.getByRole("navigation", { name: "Primary" })
    const bar = (await tabs.isVisible()) ? (await tabs.boundingBox())!.y : null
    const floor = Math.round(
      bar ??
        (await page.evaluate(() => {
          const probe = document.createElement("div")
          probe.style.cssText = "position:fixed;bottom:0;height:var(--phone-floor);visibility:hidden"
          document.body.append(probe)
          const top = probe.getBoundingClientRect().top
          probe.remove()
          return top
        })),
    )
    const end = async () => {
      const b = (await foot.boundingBox())!
      return Math.round(b.y + b.height)
    }
    await expect.poll(end, { message: `the ${view}'s foot ends at or above ${floor}` }).toBeLessThanOrEqual(floor)
    const at = await end()
    console.log(`TABLE-FOOT ${view} 390 floor: ${bar === null ? "no tab bar, the home indicator's pad" : "the tab bar"} at ${floor}; the ${view}'s foot ends ${at}`)
    expect(at, "the view fills the room down to it, 8 px clear").toBeGreaterThanOrEqual(floor - 12)
    if (view === "grid") expect((await onScreen(page, page.locator("tr[data-summary-bar]"))).hit, "the sums are seen").toBe(true)
    await close()
  })
}

for (const [view, box, tall] of [
  ["List", "[data-list-scroll]", true],
  ["Board", "[data-table-board]", true],
  ["Gallery", "[data-gallery-scroll]", true],
  ["Timeline", "[data-timeline-scroll]", true],
  ["Calendar", "[data-table-calendar]", false],
  ["Chart", "[data-table-chart]", false],
] as const) {
  test(`at 390 with touch under a notice, a tall table's ${view.toLowerCase()} ends on the screen at first sight`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rowsOf(300))
    const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
    // Six fields: the phone shows the list first.
    await expect(page.locator("[data-table-list] li[aria-setsize]").first()).toBeVisible({ timeout: 60_000 })
    if (view !== "List") await page.getByRole("button", { name: view, exact: true }).tap()
    const body = page.locator(box)
    await expect(body).toBeVisible({ timeout: 60_000 })
    await addPhoneNotice(page)
    await expect.poll(async () => (await onScreen(page, body)).over, { message: `the ${view.toLowerCase()}'s box ends on the screen` }).toBeLessThanOrEqual(0)
    const at = await onScreen(page, body)
    console.log(`TABLE-FOOT ${view} 390, under a notice: ends ${at.bottom} (${at.over} over the screen's foot); the page's room ${await pageRoom(page)} px`)
    expect(await pageRoom(page), "the page has nothing to scroll").toBeLessThanOrEqual(1)
    if (tall) expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight), `the ${view.toLowerCase()} scrolls inside its box`).toBe(true)
    await shoot(page, `tableFoot-390-${view.toLowerCase()}-notice`)
    await close()
  })
}

test("at 390x480 with touch under a notice, the rows' box keeps its floor and the page scrolls to the foot", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rowsOf(300))
  const { page, close } = await server.open(browser, testInfo, SAM, { ...PHONE, viewport: { width: 390, height: 480 } })
  await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator("tbody tr[data-row]").first()).toBeVisible({ timeout: 60_000 })
  const sums = page.locator("tr[data-summary-bar]")
  await expect(sums).toBeVisible({ timeout: 30_000 })
  await addPhoneNotice(page)
  const grid = page.locator("[data-table-grid]")
  const scroller = page.locator("[data-app-scroller]")
  // 329 px under the bars, the toolbar's foot near 213 of them, and New row's 36: the box would get 80 px, and keeps 8rem.
  expect((await grid.boundingBox())!.height, "the rows' box keeps its floor").toBeGreaterThanOrEqual(127)
  expect(await pageRoom(page), "past the floor, the page scrolls").toBeGreaterThan(1)
  // A swipe above the grid brings the page to its end, and the foot whole into sight.
  for (let swipe = 0; swipe < 4 && (await pageRoom(page)) > 1; swipe++) {
    const top = (await scroller.boundingBox())!.y
    const gridTop = (await grid.boundingBox())!.y
    await swipeUp(page, scroller, 195, Math.round((top + gridTop) / 2), Math.round(top + 4))
  }
  expect(await pageRoom(page), "the page swiped to its end").toBeLessThanOrEqual(1)
  expect((await onScreen(page, page.locator("[data-new-row]"))).over, "New row ends on the screen").toBeLessThanOrEqual(0)
  expect((await onScreen(page, sums)).over, "the summary bar ends on the screen").toBeLessThanOrEqual(0)
  await close()
})
