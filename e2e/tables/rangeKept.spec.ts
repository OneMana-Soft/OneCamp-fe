import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-617: a range's write (a paste, a fill) the server couldn't store (Postgres out of space) answers 503 since
// backend b235, nothing of it written. The web dropped its cells like any refusal, so a paste refused for space
// vanished and read as the person's mistake. Its cells are kept and marked as a cell's save is (V-583), said once
// with Retry for the whole write, never sent again by itself; Retry sends one batch of the cells still kept, with
// the paste's new rows, so the paste lands whole or not at all.
// DESIGN-BUILD-129: the new rows aren't drawn once refused, so the toast that holds them stays until the person acts
// (Retry or its x), with no timer (F1a); every mark of the write retries the WHOLE write, and says so (F1b); the words
// stay two short sentences at 390 (G2); SHOTS_DIR gets each frame at 1280 and 390, light and dark (F2).

const FIELDS = [
  { id: "item", name: "Item", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
]
const fourRows = () => Array.from({ length: 4 }, (_, i) => ({ item: `Line ${i + 1}`, amount: i + 1 }))
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const CLIPBOARD = { permissions: ["clipboard-read", "clipboard-write"] }
const RETRY_LATER = "The table couldn't be read or changed just now. Try again in a moment."

const cell = (page: Page, at: string) => page.locator(`[data-cell="${at}"]`).first()
const td = (page: Page, at: string) => page.locator(`tbody td[data-field]:has([data-cell="${at}"])`).first()
const toast = (page: Page, text: string | RegExp) => page.locator(".toast-root", { hasText: text })
/** What every mark of the refused paste sends and is named for: the whole write (F1b). */
const WHOLE = "Retry saving the paste: 2 cells and 1 new row"
const SHOTS = process.env.SHOTS_DIR

/** The frame in each theme, the toast at rest (opacity 1), for the design review. */
async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  const width = page.viewportSize()?.width
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${colorScheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** The toast settled: its entrance over, at rest at full opacity. */
async function settled(page: Page) {
  const offer = toast(page, "Not saved")
  await expect.poll(() => offer.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 }).toBe("1")
  return offer
}

/** An element's rendered lines, from its height and line height. */
const lines = (el: Element) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))

/** A cell's text, whole: a number at rest. */
const reads = (text: string) => new RegExp(`^\\s*${text}\\s*$`)

/** The cell at row, col focused by the keyboard from the row beside it (rangesPasteFill's reach). */
async function reach(page: Page, row: number, col: number, phone: boolean) {
  const from = row === 0 ? 1 : 0
  const start = td(page, `${from}:0`)
  // Again until it takes: a tap on a busy machine can land before the grid hears it (red-3, 4 workers).
  await expect(async () => {
    await (phone ? start.tap() : start.click())
    await expect(cell(page, `${from}:0`)).toBeFocused({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  for (let r = from; r < row; r++) await page.keyboard.press("ArrowDown")
  for (let c = 0; c < col; c++) await page.keyboard.press("ArrowRight")
  await expect(cell(page, `${row}:${col}`)).toBeFocused()
}

/**
 * Refuses the first `refusals` batches (POST .../rows/batch) with a 503, as a server that couldn't store them; the
 * rest go on to the table's server. Registered after it, so it sees each batch first. By its path, as
 * rangesPasteFill's holdBatches does.
 */
async function refuseBatches(page: Page, refusals: number) {
  const sent: number[] = []
  await page.route((url) => url.pathname.endsWith("/rows/batch"), async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    const status = sent.length < refusals ? 503 : 200
    sent.push(status)
    if (status === 200) return route.fallback()
    const origin = route.request().headers()["origin"] || "*"
    return route.fulfill({ status, headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" }, json: { msg: RETRY_LATER } })
  })
  return sent
}

/** The paste of 70, 80, 90 over Amount of rows 3 and 4 (and one new row), refused 503 once; its offer, settled. */
async function pasteRefused(page: Page, phone: boolean) {
  const sent = await refuseBatches(page, 1)
  await expect(cell(page, "3:0")).toBeVisible({ timeout: 30_000 })
  await reach(page, 2, 1, phone)
  await page.evaluate(() => navigator.clipboard.writeText("70\n80\n90"))
  await page.keyboard.press("ControlOrMeta+V")
  await expect(toast(page, "Not saved")).toBeVisible({ timeout: 15_000 })
  return { sent, offer: await settled(page) }
}

/** The kept cells of the refused paste, each marked as holding the whole write. */
async function markedWhole(page: Page) {
  for (const [c, v] of [
    ["2:1", "70"],
    ["3:1", "80"],
  ]) {
    await expect(td(page, c)).toHaveAttribute("data-unsaved", "true")
    await expect(td(page, c)).toHaveText(reads(v))
    await expect(td(page, c).getByRole("button", { name: WHOLE, exact: true })).toHaveCount(1)
  }
  await expect(td(page, "1:1")).not.toHaveAttribute("data-unsaved")
  await expect(page.locator("tbody tr[data-adding]")).toHaveCount(0)
}

type Batch = { kind: string; patch: { row: string; values: Record<string, unknown> }[]; create?: { values: Record<string, unknown> }[] }

/** One batch went: the kept cells as pasted and the new row; the marks go and the new row is drawn. */
async function landedWhole(page: Page, server: TableServer, sent: number[]) {
  await expect.poll(() => server.batches.length, { timeout: 15_000 }).toBe(1)
  const batch = server.batches[0] as Batch
  expect(batch.kind).toBe("paste")
  expect(batch.patch).toEqual([
    { row: server.rows[2].id, values: { amount: "70" } },
    { row: server.rows[3].id, values: { amount: "80" } },
  ])
  expect(batch.create).toEqual([{ values: { amount: "90" } }])
  await expect(td(page, "2:1")).not.toHaveAttribute("data-unsaved", { timeout: 10_000 })
  await expect(td(page, "3:1")).not.toHaveAttribute("data-unsaved")
  await expect(page.getByRole("button", { name: /^Retry saving/ })).toHaveCount(0)
  await expect(td(page, "2:1")).toHaveText(reads("70"))
  await expect(td(page, "4:1")).toHaveText(reads("90"), { timeout: 10_000 })
  expect(server.rows.map((r) => r.values.amount)).toEqual([1, 2, 70, 80, 90])
  expect(sent).toEqual([503, 200])
}

for (const phone of [false, true]) {
  const at = phone ? "390 with touch" : "1280"
  const w = phone ? "phone" : "desk"
  test(`at ${at}, a paste the server asks to have again later (503) keeps its cells marked and its offer until the person acts, sends nothing by itself, and Retry sends it once, whole`, async ({ browser }, testInfo) => {
    const server = new TableServer(FIELDS, fourRows())
    const sam = await server.open(browser, testInfo, SAM, { ...(phone ? PHONE : {}), ...CLIPBOARD })
    const page = sam.page
    const { sent, offer } = await pasteRefused(page, phone)

    // Kept and marked, said once with Retry in two short sentences (G2: the fallback, never the server's longer
    // words); the range says nothing of its own, and the new row isn't drawn.
    await expect(offer.locator(".toast-desc")).toHaveText("1 new row wasn't added. Try again in a moment.")
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(1)
    await expect(toast(page, "Couldn't paste")).toHaveCount(0)
    await markedWhole(page)
    expect(sent).toEqual([503])
    expect(server.rows.map((r) => r.values.amount)).toEqual([1, 2, 3, 4])
    await shoot(page, `refused-${w}`)
    if (phone) {
      // G2 at 390: the title on one line, the description on at most two, its count whole.
      const title = await offer.locator(".toast-title").evaluate(lines)
      const desc = await offer.locator(".toast-desc").evaluate((el) => ({ n: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)), cut: el.scrollWidth > el.clientWidth }))
      testInfo.annotations.push({ type: "G2 at 390", description: `title ${title} line(s), description ${desc.n} line(s), cut ${desc.cut}` })
      expect(title).toBe(1)
      expect(desc.n).toBeLessThanOrEqual(2)
      expect(desc.cut).toBe(false)

      // The phone's list: the kept rows marked as holding the whole write, and no new row; its last row is row 4.
      await page.getByRole("button", { name: "Row height and colour" }).tap()
      await page.getByRole("menuitem", { name: "Show as a list" }).tap()
      const list = page.locator("ul.v3-grid-list > li")
      await expect(list).toHaveCount(4, { timeout: 10_000 })
      for (const i of [2, 3]) {
        await expect(list.nth(i)).toHaveAttribute("data-unsaved", "true")
        await expect(list.nth(i).getByRole("button", { name: WHOLE, exact: true })).toHaveCount(1)
      }
      await expect(list.nth(1)).not.toHaveAttribute("data-unsaved")
      await expect(list.last()).toContainText("Line 4")
      await list.last().scrollIntoViewIfNeeded()
      await settled(page)
      await shoot(page, "refused-list-phone")
      await page.getByRole("button", { name: "Row height and colour" }).tap()
      await page.getByRole("menuitem", { name: "Show as a grid" }).tap()
      await expect(cell(page, "3:0")).toBeVisible({ timeout: 10_000 })
      await markedWhole(page)
    } else {
      await page.mouse.move(4, 4)
    }

    // F1a: ten seconds on, with nothing resting on it, the offer and its one Retry are still there; nothing was sent.
    await page.waitForTimeout(10_000)
    await expect(offer).toBeVisible()
    await expect(offer.getByRole("button", { name: "Retry", exact: true })).toHaveCount(1)
    expect(sent).toEqual([503])
    expect(server.batches).toHaveLength(0)
    await expect(td(page, "2:1")).toHaveAttribute("data-unsaved", "true")
    await shoot(page, `after-10s-${w}`)

    const retry = offer.getByRole("button", { name: "Retry", exact: true })
    if (phone) await retry.tap()
    else {
      // From a cell in edit, ⌥T is the editor's (a character on a Mac): the focus stays in it (V-831).
      await td(page, "1:0").click()
      await expect(cell(page, "1:0")).toBeFocused()
      await expect(cell(page, "1:0")).toBeEditable()
      await page.keyboard.press("Alt+t")
      await expect(cell(page, "1:0")).toBeFocused()
      await expect(cell(page, "1:0")).toHaveValue("Line 2")
      await expect(page.locator(".toast-viewport")).not.toBeFocused()
      // By keyboard from the cell the paste was made in, at rest (a readonly textarea, the mouse away): ⌥T reaches
      // the toasts, Tab its Retry, with a ring (V-831: a readonly field isn't typed into).
      await page.mouse.move(4, 4)
      await cell(page, "2:1").focus()
      await expect(cell(page, "2:1")).not.toBeEditable()
      await page.keyboard.press("Alt+t")
      await expect(page.locator(".toast-viewport")).toBeFocused()
      for (let i = 0; i < 4 && !(await retry.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
      await expect(retry).toBeFocused()
      expect(await retry.evaluate((el) => el.matches(":focus-visible") && getComputedStyle(el).boxShadow !== "none")).toBe(true)
      await shoot(page, "retry-focus-desk")
      await page.keyboard.press("Enter")
      // The Retry hands the focus back to the cell it came from, never to the page.
      await expect(cell(page, "2:1")).toBeFocused()
    }
    await landedWhole(page, server, sent)
    await expect(toast(page, "Not saved")).toHaveCount(0)
    await shoot(page, `retried-${w}`)
    await sam.close()
  })

  test(`at ${at}, once its offer is closed by its x, a mark of the refused paste sends the whole write: its cells and its new row, as one batch`, async ({ browser }, testInfo) => {
    const server = new TableServer(FIELDS, fourRows())
    const sam = await server.open(browser, testInfo, SAM, { ...(phone ? PHONE : {}), ...CLIPBOARD })
    const page = sam.page
    const { sent, offer } = await pasteRefused(page, phone)
    await markedWhole(page)
    const close = offer.getByRole("button", { name: "Close notification" })
    if (phone) {
      // With no hover the staying offer shows its × at rest, and its tap is 44 px, reaching out and up, clear of Retry (F3).
      await expect.poll(() => close.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
      const b = (await close.boundingBox())!
      const hits = (x: number, y: number) => page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".toast-close"), [x, y])
      for (const [x, y] of [[b.x - 19, b.y - 19], [b.x + 23, b.y - 19], [b.x - 19, b.y + 23], [b.x + 23, b.y + 23]]) expect(await hits(x, y)).toBe(true)
      const r = (await offer.getByRole("button", { name: "Retry", exact: true }).boundingBox())!
      expect(await hits(r.x + r.width / 2, r.y + r.height / 2)).toBe(false)
      await page.touchscreen.tap(b.x - 18, b.y - 18)
    } else {
      await offer.hover()
      await close.click()
    }
    await expect(toast(page, "Not saved")).toHaveCount(0)
    expect(sent).toEqual([503])
    const mark = td(page, "3:1").getByRole("button", { name: WHOLE, exact: true })
    if (phone) await mark.tap()
    else await mark.click()
    await landedWhole(page, server, sent)
    expect(server.batches).toHaveLength(1)
    await sam.close()
  })
}
