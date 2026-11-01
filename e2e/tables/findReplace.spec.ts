import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { demoBuild } from "../demoBuild"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// G2b (gsheets-grid-01 items 3 and 5, airtable-04's find): find and replace
// over the view's every row, as the server finds them, stepped through with
// the match in sight and its cells tinted; Replace all as one step that the
// toast's one Undo takes back; and a clean-up, remove duplicate rows, that
// counts with a dry run before Apply, its Undo bringing the rows back. On a
// computer by the keys (Ctrl+F, Ctrl+H, Enter, Escape); on a phone from the
// More menu, by touch. Someone who edits the rows but not the columns finds
// and replaces with the keys.

const fields = [
  { id: "name", name: "Name", type: "text" },
  { id: "email", name: "Email", type: "email" },
  { id: "city", name: "City", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
]
// Rows 2 and 4 repeat rows 0 and 1, every field alike.
const rows = () => [
  { name: "Ada Lovelace", email: "ada@example.com", city: "London", amount: 100 },
  { name: "Grace Hopper", email: "grace@example.com", city: "New York", amount: 200 },
  { name: "Ada Lovelace", email: "ada@example.com", city: "London", amount: 100 },
  { name: "Alan Turing", email: "alan@example.com", city: "London", amount: 300 },
  { name: "Grace Hopper", email: "grace@example.com", city: "New York", amount: 200 },
]
const rowId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`

const DEVICES = [
  { name: "at 1280", phone: false, options: { viewport: { width: 1280, height: 800 } } },
  { name: "at 390 with touch", phone: true, options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
]

// Design shots when SHOTS_DIR is set (the bar, its Replace row, the clean-up's count, the toasts), in light and in
// dark (the theme follows the system's), as the other table specs take them.
const SHOTS = process.env.SHOTS_DIR
async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme })
    // Entry animations (a drawer's slide, a toast's fade) run to their end first, so a shot never catches one midway.
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}.png`, animations: "disabled" })
  }
  await page.emulateMedia({ colorScheme: "light" })
}
// The bar's count and the tinted cells in the first frame that shows the toast titled title: the toast lands with
// the count over the rows as they are now, never beside the matches as they were.
const atToast = (page: Page, title: string) =>
  page.evaluate(
    (title) =>
      new Promise<{ status: string; marked: number }>((done) => {
        const end = performance.now() + 15_000
        const look = () => {
          const shown = [...document.querySelectorAll(".toast-title")].some((n) => n.textContent === title)
          if (shown) return done({ status: document.querySelector('[data-find-bar] [role="status"]')?.textContent ?? "", marked: document.querySelectorAll("tbody td[data-found]").length })
          if (performance.now() > end) return done({ status: "no toast in 15 s", marked: -1 })
          requestAnimationFrame(look)
        }
        look()
      }),
    title,
  )
const tag = (device: (typeof DEVICES)[number]) => (device.phone ? "390" : "1280")
// Whether the reader sees the element there: the top-most element at its centre (or 2 px under its top edge) is it
// or inside it, never a bar, a banner or anything else drawn over it.
const seen = (l: Locator, at: "centre" | "top" = "centre") =>
  l.evaluate((el, at) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, at === "top" ? r.top + 2 : r.top + r.height / 2)
    return !!hit && el.contains(hit)
  }, at)

async function open(browser: Browser, testInfo: TestInfo, device: (typeof DEVICES)[number], setUp?: (s: TableServer) => void) {
  const server = new TableServer(fields, rows())
  setUp?.(server)
  const { page, close } = await server.open(browser, testInfo, SAM, device.options)
  await expect(page.locator('[data-cell="4:3"]')).toBeAttached({ timeout: 60_000 })
  const press = (l: Locator) => (device.phone ? l.tap() : l.click())
  const bar = page.getByRole("search", { name: "Find in this view" })
  // A cell of the grid, by its row and field: the find's tint is on it.
  const td = (row: number, field: string) => page.locator(`tbody tr[data-row="${rowId(row)}"] > td[data-field="${field}"]`)
  const more = async (item: RegExp) => {
    await press(page.getByRole("button", { name: "More", exact: true }))
    await press(page.getByRole("menuitem", { name: item }))
  }
  return { server, page, close, press, bar, td, more }
}

for (const device of DEVICES) {
  test(`${device.name}, a find counts every match in the view and steps through them, and Replace all is one step one Undo takes back`, async ({ browser }, testInfo) => {
    const t = await open(browser, testInfo, device)
    if (device.phone) await t.more(/^Find and replace$/)
    else await t.page.keyboard.press("Control+f")
    const find = t.bar.getByRole("textbox", { name: "Find" })
    await expect(find).toBeFocused()
    await find.fill("london")
    await expect(t.bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
    // Every match tinted, the one it's at more.
    await expect(t.page.locator("tbody td[data-found]")).toHaveCount(3)
    await expect(t.td(0, "city")).toHaveAttribute("data-found", "at")
    await shoot(t.page, `find-${tag(device)}`)
    const asked = t.server.transforms.at(-1)
    expect(asked).toMatchObject({ step: "find", find: "london", fields: ["name", "email", "city", "amount"], rows: [0, 1, 2, 3, 4].map(rowId) })

    if (device.phone) await t.press(t.bar.getByRole("button", { name: "Next match" }))
    else await t.page.keyboard.press("Enter")
    await expect(t.bar.getByRole("status")).toHaveText("2 of 3")
    await expect(t.td(2, "city")).toHaveAttribute("data-found", "at")
    await expect(t.td(0, "city")).toHaveAttribute("data-found", "")

    if (!device.phone) {
      // Escape leaves the match it was at selected (its cell holds the focus, the box shut), and the tints go with the bar.
      await t.page.keyboard.press("Escape")
      await expect(t.bar).toHaveCount(0)
      await expect(t.td(2, "city").locator("[data-cell-box]")).toBeFocused()
      await expect(t.page.locator("tbody td[data-found]")).toHaveCount(0)
      // Ctrl+H: the bar again, with its Replace row.
      await t.page.keyboard.press("Control+h")
      await find.fill("london")
      await expect(t.bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
    }

    await t.bar.getByRole("textbox", { name: "Replace with" }).fill("Paris")
    await shoot(t.page, `replace-row-${tag(device)}`)
    const landed = atToast(t.page, "Replaced 3 in 3 rows")
    await t.press(t.bar.getByRole("button", { name: "Replace all" }))
    expect(await landed).toEqual({ status: "No matches", marked: 0 })
    await expect(t.page.getByText("Replaced 3 in 3 rows", { exact: true })).toBeVisible({ timeout: 15_000 })
    await shoot(t.page, `replaced-toast-${tag(device)}`)
    // Only the view's text fields are written: never a number.
    expect(t.server.transforms.filter((b) => b.step === "replace").at(-1)).toMatchObject({ step: "replace", find: "london", replace: "Paris", fields: ["name", "email", "city"], rows: [0, 1, 2, 3, 4].map(rowId) })
    await expect(t.td(3, "city")).toContainText("Paris")
    expect([0, 1, 2, 3, 4].map((i) => t.server.valuesOf(i).city)).toEqual(["Paris", "New York", "Paris", "Paris", "New York"])
    await expect(t.bar.getByRole("status")).toHaveText("No matches")

    await t.press(t.page.getByRole("button", { name: "Undo", exact: true }).first())
    await expect(t.td(3, "city")).toContainText("London", { timeout: 15_000 })
    expect([0, 1, 2, 3, 4].map((i) => t.server.valuesOf(i).city)).toEqual(["London", "New York", "London", "London", "New York"])
    // The Undo brings the matches back into the count, tinted.
    await expect(t.bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
    await expect(t.page.locator("tbody td[data-found]")).toHaveCount(3)

    // Matches only in a number: a replace changes the text fields alone, so both rest, and the bar says why.
    await find.fill("200")
    await expect(t.bar.getByRole("status")).toHaveText("1 of 2", { timeout: 15_000 })
    await expect(t.td(1, "amount")).toHaveAttribute("data-found", "at")
    await expect(t.bar.getByRole("button", { name: "Replace", exact: true })).toBeDisabled()
    await expect(t.bar.getByRole("button", { name: "Replace all" })).toBeDisabled()
    await expect(t.bar.getByText("None of these matches can be replaced. Replace changes text, long text, URL, email and phone fields.")).toBeVisible()
    await shoot(t.page, `replace-why-${tag(device)}`)
    await t.close()
  })

  test(`${device.name}, Remove duplicate rows counts them with a dry run first, removes them as one step, and one Undo brings them back`, async ({ browser }, testInfo) => {
    const t = await open(browser, testInfo, device)
    await t.more(/^Remove duplicate rows/)
    const dialog = t.page.getByRole("dialog", { name: "Remove duplicate rows" })
    await expect(dialog.getByRole("status")).toHaveText("2 duplicate rows of 5", { timeout: 15_000 })
    expect(t.server.transforms.at(-1)).toMatchObject({ step: "dedupe", dry_run: true, fields: ["name", "email", "city", "amount"], rows: [0, 1, 2, 3, 4].map(rowId) })
    expect(t.server.rows).toHaveLength(5)

    const apply = dialog.getByRole("button", { name: "Remove 2 rows" })
    await expect(apply).toBeInViewport()
    await shoot(t.page, `dedupe-count-${tag(device)}`)
    await t.press(apply)
    await expect(t.page.getByText("Removed 2 duplicate rows", { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toHaveCount(0)
    expect(t.server.transforms.at(-1)).toMatchObject({ step: "dedupe", fields: ["name", "email", "city", "amount"] })
    expect(t.server.transforms.at(-1)).not.toHaveProperty("dry_run")
    // The first of each stays.
    expect(t.server.rows.map((r) => r.id)).toEqual([0, 1, 3].map(rowId))
    await expect(t.page.locator("tbody tr[data-row]")).toHaveCount(3, { timeout: 15_000 })

    await t.press(t.page.getByRole("button", { name: "Undo", exact: true }).first())
    await expect(t.page.locator("tbody tr[data-row]")).toHaveCount(5, { timeout: 15_000 })
    expect(t.server.rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4].map(rowId))
    await t.close()
  })
}

// Whoever may open a table writes its rows (the server's paste rule); the More
// menu and the columns are its managers'. Someone who isn't one finds and
// replaces with the keys, on a computer (a phone has none: verify-findings).
// A refusal's words stay the server's backstop (FindBar.test).
test("at 1280, someone who edits the table's rows but not its columns finds and replaces with the keys", async ({ browser }, testInfo) => {
  const t = await open(browser, testInfo, DEVICES[0], (s) => {
    s.canManage = false
  })
  await expect(t.page.getByRole("button", { name: "More", exact: true })).toHaveCount(0)
  await expect(t.page.getByText("You can edit its rows. Its owner changes its columns.")).toBeVisible()
  await t.page.keyboard.press("Control+h")
  await t.bar.getByRole("textbox", { name: "Find" }).fill("london")
  await expect(t.bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
  await t.bar.getByRole("textbox", { name: "Replace with" }).fill("Paris")
  await shoot(t.page, "member-replace-1280")
  await t.press(t.bar.getByRole("button", { name: "Replace all" }))
  await expect(t.page.getByText("Replaced 3 in 3 rows", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(t.bar.getByRole("status")).toHaveText("No matches")
  expect([0, 1, 2, 3, 4].map((i) => t.server.valuesOf(i).city)).toEqual(["Paris", "New York", "Paris", "Paris", "New York"])
  await t.close()
})

// G2b-2 LIVE (DB-65's MUST 1, 1 Nov): a table with more than four fields is a list on a phone, and there a find marked
// nothing, so Replace wrote a match the reader couldn't see. The row the find is at reads apart as the grid's cell
// does, the other rows with matches tinted; the matched value shows in its row, a field the row's summary leaves out
// by name and value; and each step brings its row into sight.
const wideFields = [
  { id: "name", name: "Name", type: "text" },
  { id: "city", name: "City", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
  { id: "email", name: "Email", type: "email" },
  { id: "status", name: "Status", type: "select", config: { options: [{ label: "Open" }, { label: "Paid" }] } },
  { id: "vendor", name: "Vendor", type: "text" },
]
// 40 rows, so the list scrolls (a phone shows about a dozen). Acme supplies orders 3 and 34 alone, a value past the
// three a row's summary names (City, Amount, Email); the even orders are in Leeds.
const wideRows = () =>
  Array.from({ length: 40 }, (_, i) => ({
    name: `Order ${i + 1}`,
    city: i % 2 ? "Leeds" : "York",
    amount: 100 + i,
    email: `buyer${i + 1}@example.com`,
    status: i % 3 ? "Open" : "Paid",
    vendor: i === 2 || i === 33 ? "Acme Ltd" : "Brill and Co",
  }))

test("at 390 with touch, a find over a phone's list marks the row it's at, shows the matched value in its row and brings each match into sight", async ({ browser }, testInfo) => {
  const server = new TableServer(wideFields, wideRows())
  const { page, close } = await server.open(browser, testInfo, SAM, DEVICES[1].options)
  // A row of the list, by its order's number.
  const item = (n: number) => page.locator("[data-table-list] li").filter({ hasText: new RegExp(`^Order ${n}(?!\\d)`) })
  await expect(item(1)).toBeVisible({ timeout: 60_000 })
  // The demo's banner is up over the page, as a visitor first sees it (the bar rode up under it, DESIGN-BUILD-67);
  // a customer's build shows none there.
  const banners = page.locator("[data-app-banners]")
  if (demoBuild()) await expect(banners).toBeVisible()
  else await expect(banners).toBeHidden()
  // The rows' text never moves as a find marks and unmarks: order 1's title, before a find, with matches, with
  // none and after Close (it moved 8 px while marking, DESIGN-BUILD-67 MUST 2).
  const title = item(1).getByText(/^Order 1$/)
  const left = () => title.evaluate((el) => el.getBoundingClientRect().left)
  const before = await left()
  await shoot(page, "find-list-closed-390")
  await page.getByRole("button", { name: "More", exact: true }).tap()
  await page.getByRole("menuitem", { name: /^Find and replace$/ }).tap()
  const bar = page.getByRole("search", { name: "Find in this view" })
  const find = bar.getByRole("textbox", { name: "Find" })
  await find.fill("acme")
  await expect(bar.getByRole("status")).toHaveText("1 of 2", { timeout: 15_000 })
  expect.soft(await left(), "order 1's title with matches").toBe(before)
  await expect(item(3)).toHaveAttribute("data-found", "at")
  await expect(item(3)).toBeInViewport({ ratio: 1 })
  await expect(item(3).locator('[data-found-value="at"]')).toHaveText("Vendor Acme Ltd")
  await expect(page.locator("[data-table-list] li[data-found]")).toHaveCount(1)
  await shoot(page, "find-list-390")

  // The next match is 31 rows down, out of sight: the step brings it in, marked; the step back returns to order 3.
  await bar.getByRole("button", { name: "Next match" }).tap()
  await expect(bar.getByRole("status")).toHaveText("2 of 2")
  await expect(item(34)).toHaveAttribute("data-found", "at")
  await expect(item(34)).toBeInViewport({ ratio: 1 })
  await expect(item(34).locator('[data-found-value="at"]')).toHaveText("Vendor Acme Ltd")
  // The page scrolled to bring the row in, and the bar stayed whole over the list: its field, its count and its
  // arrows on top, never under the app's bar or the banner (DESIGN-BUILD-67 MUST 1). The row clears the screen's
  // edge by its scroll margin, never flush on it.
  expect.soft(await seen(find), "the bar's field after a step down").toBe(true)
  expect.soft(await seen(bar.getByRole("status")), "the bar's count after a step down").toBe(true)
  expect.soft(await seen(bar.getByRole("button", { name: "Next match" })), "the bar's arrows after a step down").toBe(true)
  const stepped = (await item(34).boundingBox())!
  expect.soft(stepped.y + stepped.height, "order 34 clears the screen's bottom edge").toBeLessThanOrEqual(844 - 10)
  await shoot(page, "find-list-step-390")
  await bar.getByRole("button", { name: "Previous match" }).tap()
  await expect(bar.getByRole("status")).toHaveText("1 of 2")
  await expect(item(3)).toHaveAttribute("data-found", "at")
  await expect(item(3)).toBeInViewport({ ratio: 1 })
  // A step up stops the row under the bar, its top edge seen, not behind the bar.
  expect.soft(await seen(item(3), "top"), "order 3's top edge after a step up").toBe(true)
  expect.soft(await seen(bar.getByRole("status")), "the bar's count after a step up").toBe(true)

  // A match in a value the summary names is marked where it is, and the other rows with matches are tinted lighter.
  await find.fill("leeds")
  await expect(bar.getByRole("status")).toHaveText("1 of 20", { timeout: 15_000 })
  await expect(item(2)).toHaveAttribute("data-found", "at")
  await expect(item(2).locator('[data-found-value="at"]')).toHaveText("City Leeds")
  await expect(item(4)).toHaveAttribute("data-found", "")
  await expect(item(4).locator('[data-found-value=""]')).toHaveText("City Leeds")
  await expect(item(3)).not.toHaveAttribute("data-found")
  await shoot(page, "find-list-many-390")

  // A query that finds nothing: nothing marked, and the text where it was.
  await find.fill("zzz")
  await expect(bar.getByRole("status")).toHaveText("No matches", { timeout: 15_000 })
  await expect(page.locator("[data-table-list] li[data-found]")).toHaveCount(0)
  expect.soft(await left(), "order 1's title with no matches").toBe(before)

  // The bar closed: nothing marked, and the text where it was.
  await bar.getByRole("button", { name: "Close find" }).tap()
  await expect(page.locator("[data-table-list] li[data-found]")).toHaveCount(0)
  expect.soft(await left(), "order 1's title after Close").toBe(before)
  await close()
})

// V-226 (DESIGN-BUILD-70, G2b-2 LIVE look, 1 Nov): a step to a match far down the grid left its cell under the sticky
// summary row, a sliver of its ring showing over the sums. The grid's sticky edges, its header row and its summary
// row, keep a cell brought into sight clear of them: a find's step far down, to the last row and back to the top,
// and on a computer a move down by the keys past the first screen.
// 60 rows with four fields, so a phone draws the grid too; Acme names rows 2, 31 and 60 alone.
const longRows = () =>
  Array.from({ length: 60 }, (_, i) => ({
    name: i === 1 || i === 30 || i === 59 ? `Acme ${i + 1}` : `Order ${i + 1}`,
    email: `buyer${i + 1}@example.com`,
    city: i % 2 ? "Leeds" : "York",
    amount: 100 + i,
  }))
// Where a cell is once the grid's scroll has stood still for five frames (a step brings its row into sight, then its
// cell a frame later): whether the top-most element at its centre is it or inside it, and how far its edges clear
// the sticky header row's foot and the summary row's top (negative: under them).
const placeSettled = (l: Locator) =>
  l.evaluate(
    (el) =>
      new Promise<{ seen: boolean; underHead: number; overFoot: number }>((done) => {
        const box = el.closest("[data-table-grid]")
        let last = -1
        let still = 0
        const look = () => {
          const top = box?.scrollTop ?? 0
          still = top === last ? still + 1 : 0
          last = top
          if (still < 5) return void requestAnimationFrame(look)
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const head = box?.querySelector("thead")?.getBoundingClientRect()
          const foot = box?.querySelector("tfoot")?.getBoundingClientRect()
          done({ seen: !!hit && el.contains(hit), underHead: Math.round(r.top - (head?.bottom ?? 0)), overFoot: Math.round((foot?.top ?? 1e6) - r.bottom) })
        }
        look()
      }),
  )
// The grid's scroll position frame by frame, from now until it has stood still for 60 frames: how many times it moved.
// A row not drawn yet lands once, where the step leaves it, never short of it and then moved again a frame later.
type ScrollWatch = { scrollWatch?: { tops: number[]; done: boolean } }
const watchScroll = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector("[data-table-grid]")
    const watch = { tops: [box?.scrollTop ?? 0], done: false }
    ;(window as ScrollWatch).scrollWatch = watch
    let still = 0
    const look = () => {
      const top = box?.scrollTop ?? 0
      if (top !== watch.tops[watch.tops.length - 1]) {
        watch.tops.push(top)
        still = 0
      } else still++
      if (still < 60) requestAnimationFrame(look)
      else watch.done = true
    }
    requestAnimationFrame(look)
  })
const scrollMoves = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => (window as ScrollWatch).scrollWatch?.done ?? false)).toBe(true)
  return page.evaluate(() => ((window as ScrollWatch).scrollWatch?.tops.length ?? 1) - 1)
}
const clearOfEdges = async (l: Locator, what: string) => {
  const at = await placeSettled(l)
  expect.soft(at.seen, `${what}: its centre seen`).toBe(true)
  expect.soft(at.underHead, `${what}: clear of the header row`).toBeGreaterThanOrEqual(0)
  expect.soft(at.overFoot, `${what}: clear of the summary row`).toBeGreaterThanOrEqual(0)
}

for (const device of DEVICES) {
  test(`${device.name}, a find's step far down the grid, to its last row and back to its top, stops the match clear of the sticky header and summary rows`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, longRows())
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    const press = (l: Locator) => (device.phone ? l.tap() : l.click())
    const td = (row: number) => page.locator(`tbody tr[data-row="${rowId(row)}"] > td[data-field="name"]`)
    await expect(td(0)).toBeVisible({ timeout: 60_000 })
    // The summary row is up, stuck to the grid's foot, as it is by default.
    await expect(page.locator("[data-table-grid] tfoot")).toBeVisible()
    if (device.phone) {
      await press(page.getByRole("button", { name: "More", exact: true }))
      await press(page.getByRole("menuitem", { name: /^Find and replace$/ }))
    } else await page.keyboard.press("Control+f")
    const bar = page.getByRole("search", { name: "Find in this view" })
    await bar.getByRole("textbox", { name: "Find" }).fill("acme")
    await expect(bar.getByRole("status")).toHaveText("1 of 3", { timeout: 15_000 })
    await expect(td(1)).toHaveAttribute("data-found", "at")
    const step = async (status: string, row: number, once = false) => {
      await watchScroll(page)
      if (device.phone) await press(bar.getByRole("button", { name: "Next match" }))
      else await page.keyboard.press("Enter")
      await expect(bar.getByRole("status")).toHaveText(status)
      await expect(td(row)).toHaveAttribute("data-found", "at")
      await clearOfEdges(td(row), `row ${row + 1}'s cell after the step to ${status}`)
      if (once) expect.soft(await scrollMoves(page), `the step to ${status} scrolls the grid once`).toBe(1)
    }
    // Row 31 is out of sight and not drawn yet (the virtualizer brings it in, then the step its cell), row 60 is the
    // last, and the step after it goes back up to row 2.
    await expect(td(30)).toHaveCount(0)
    await step("2 of 3", 30, true)
    await shoot(page, `find-far-step-${tag(device)}`)
    await step("3 of 3", 59)
    await step("1 of 3", 1)
    if (!device.phone) {
      // Escape leaves row 2's cell focused; the keys move it down row by row past the first screen.
      await page.keyboard.press("Escape")
      await expect(td(1).locator("[data-cell-box]")).toBeFocused()
      for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowDown")
      // The focus moved with the keys: it is in row 16's cell (its box or the box's field).
      await expect.poll(() => td(15).evaluate((el) => el.contains(document.activeElement)), { message: "the focus is in row 16's cell" }).toBe(true)
      await clearOfEdges(td(15), "row 16's cell after the keys moved down to it")
    }
    await close()
  })
}
