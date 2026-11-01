import { expect, test, type Locator } from "@playwright/test"

import { SAM, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"

// V-121: a table in the trash is deleted for good with the same button and
// confirmation as docs' trash (components/trash/DeleteForGood). It asks
// first, saying what goes, and deletes nothing until it's confirmed; then the
// table leaves the trash at once. On a phone the button is its icon, at a full
// touch size. Beside both buttons, who deleted it and when reads whole: the
// line wraps rather than cutting off. The empty trash names both ways out.
// Every request is answered here; nothing reaches a server.

const OLD = "7d1e6b2f-3c4d-4e5f-9a0b-1c2d3e4f5a6b"

for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a table in the trash is deleted for good only after its confirmation`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
    const at = new Date().toISOString()
    server.trash.push({
      table: { id: OLD, name: "Old budget", visibility: "workspace", created_by: SAM.user_uuid, created_at: at, updated_at: at, deleted_at: at },
      deleted_by_name: SAM.user_full_name,
    })
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
      ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
    })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const press = (target: Locator) => (phone ? target.tap() : target.click())
    const theme = async (name: string) => {
      await reviewShot(page, name, "light")
      await page.emulateMedia({ colorScheme: "dark" })
      await reviewShot(page, name, "dark")
      await page.emulateMedia({ colorScheme: "light" })
    }

    await press(page.getByRole("button", { name: "Trash", exact: true }))
    const purge = page.getByRole("button", { name: "Delete “Old budget” for good" })
    await expect(purge).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("button", { name: "Restore Old budget" })).toBeVisible()
    const meta = page.locator("[data-trash-item] p").nth(1)
    await expect(meta).toHaveText(/^Deleted .+ by Sam Rivera$/)
    expect(
      await meta.evaluate((line) => line.scrollWidth <= line.clientWidth && line.scrollHeight <= line.clientHeight),
      "who deleted it, and when, reads whole beside both buttons",
    ).toBe(true)
    if (phone) {
      const box = await purge.boundingBox()
      expect(box && Math.min(box.width, box.height), "the phone's Delete for good is a full touch target").toBeGreaterThanOrEqual(44)
    }
    await theme("tables-trash")

    await press(purge)
    await expect(page.getByText("Delete “Old budget” for good?")).toBeVisible()
    await expect(page.getByText("“Old budget” goes for good, with its rows and their pages, comments and files. Nobody can bring it back.")).toBeVisible()
    await theme("tables-purge-confirm")
    expect(server.purged, "nothing goes before the confirmation").toEqual([])

    await press(page.getByRole("button", { name: "Delete for good", exact: true }))
    await expect.poll(() => server.purged).toEqual([OLD])
    await expect(page.getByText("Deleted “Old budget” for good", { exact: true })).toBeVisible()
    await expect(page.getByText("The trash is empty")).toBeVisible()
    await expect(page.getByText("A table you delete waits here until you bring it back or delete it for good.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Restore Old budget" })).toHaveCount(0)
    await theme("tables-purged")
    await context.close()
  })
}

// A trash row grows with who deleted it (DB-50, 30 Oct). On a touch screen the
// row kept a fixed 48 px while that line wrapped to three, so the table's name
// was cut off at the list's top and each row ran into the next. Two rows here,
// one deleted by someone with a long name.
const LONG_NAME = "Maximiliana Wolfeschlegelsteinhausen-Bergerdorff"
const PLAN = "2b8c4d1e-5f6a-4b7c-8d9e-0f1a2b3c4d5e"

for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, each trash row grows with who deleted it, so no row runs into the next`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
    const at = new Date().toISOString()
    for (const [id, name, who] of [
      [OLD, "Old budget", LONG_NAME],
      [PLAN, "Hiring plan", SAM.user_full_name],
    ] as const) {
      server.trash.push({
        table: { id, name, visibility: "workspace", created_by: SAM.user_uuid, created_at: at, updated_at: at, deleted_at: at },
        deleted_by_name: who,
      })
    }
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
      ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
    })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const trash = page.getByRole("button", { name: "Trash", exact: true })
    await (phone ? trash.tap() : trash.click())
    await expect(page.getByRole("button", { name: "Restore Hiring plan" })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("[data-trash-item]", { hasText: "Old budget" }).locator("p").nth(1)).toHaveText(new RegExp(`by ${LONG_NAME}$`))

    const boxes = await page.locator("[data-tables-trash]").evaluate((list) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom }
      }
      return {
        list: box(list),
        rows: [...list.querySelectorAll("[data-trash-item]")].map((row) => {
          const name = row.querySelector("p")!
          return { row: box(row), name: box(name), text: box(name.parentElement!) }
        }),
      }
    })
    expect(boxes.rows).toHaveLength(2)
    for (const [i, { row, name, text }] of boxes.rows.entries()) {
      expect(name.top, `row ${i + 1}'s table name starts inside the list, not cut off above it`).toBeGreaterThanOrEqual(boxes.list.top - 0.5)
      expect(text.top, `row ${i + 1}'s name and line start inside the row`).toBeGreaterThanOrEqual(row.top - 0.5)
      expect(text.bottom, `row ${i + 1}'s name and line end inside the row`).toBeLessThanOrEqual(row.bottom + 0.5)
    }
    expect(boxes.rows[0].text.bottom, "the first row's text ends before the second row's begins").toBeLessThanOrEqual(boxes.rows[1].text.top + 0.5)
    await reviewShot(page, "tables-trash-two-rows", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-trash-two-rows", "dark")
    await context.close()
  })
}

// "by" and the deleter's name move to a new line together (DB-50, 30 Oct): a
// narrow line breaks before "by", never between "by" and the name, and never
// inside a word of the name that fits on a line.
const SHORT_NAME = "Bartholomew Lee"

/**
 * Where a trash row's line breaks, read in the page: whether "by" starts a
 * line, which of the `whole` words run across two lines, and whether the line
 * runs out of its row.
 */
const lineBreaks = (line: Element, { whole }: { whole: string[] }) => {
  const nodes: Text[] = []
  const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) nodes.push(node as Text)
  const text = nodes.map((node) => node.data).join("")
  // A Range over the line's text from `from` up to `to`, across its text nodes.
  const span = (from: number, to: number) => {
    const range = document.createRange()
    let at = 0
    for (const node of nodes) {
      const end = at + node.data.length
      if (from >= at && from < end) range.setStart(node, from - at)
      if (to > at && to <= end) {
        range.setEnd(node, to - at)
        break
      }
      at = end
    }
    return range
  }
  const lines = (range: Range) => new Set(Array.from(range.getClientRects(), (box) => Math.round(box.top))).size
  const by = text.lastIndexOf(" by ") + 1
  const first = span(0, 1).getClientRects()[0]
  const byBox = span(by, by + 2).getClientRects()[0]
  const split: string[] = []
  let from = by
  for (const word of whole) {
    const at = text.indexOf(word, from)
    if (lines(span(at, at + word.length)) > 1) split.push(word)
    from = at + word.length
  }
  return {
    byStartsLine: byBox.top > first.top + 1 && Math.abs(byBox.left - first.left) <= 1.5,
    split,
    overflows: line.scrollWidth > line.clientWidth,
  }
}

for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, “by” and the name move to a new line together, and no word of a name is split`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
    const at = new Date().toISOString()
    for (const [id, name, who] of [
      [OLD, "Old budget", SHORT_NAME],
      [PLAN, "Hiring plan", LONG_NAME],
    ] as const) {
      server.trash.push({
        table: { id, name, visibility: "workspace", created_by: SAM.user_uuid, created_at: at, updated_at: at, deleted_at: at },
        deleted_by_name: who,
      })
    }
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
      ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
    })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const trash = page.getByRole("button", { name: "Trash", exact: true })
    await (phone ? trash.tap() : trash.click())
    await expect(page.getByRole("button", { name: "Restore Hiring plan" })).toBeVisible({ timeout: 60_000 })

    // Every word of the short name fits on a line; of the long one, "Maximiliana" does.
    for (const [table, who, whole] of [
      ["Old budget", SHORT_NAME, SHORT_NAME.split(" ")],
      ["Hiring plan", LONG_NAME, ["Maximiliana"]],
    ] as const) {
      const line = page.locator("[data-trash-item]", { hasText: table }).locator("p").nth(1)
      await expect(line).toHaveText(new RegExp(`^Deleted .+ by ${who}$`))
      const got = await line.evaluate(lineBreaks, { whole: [...whole] })
      expect(got.byStartsLine, `${table}: the line breaks before “by”, not between “by” and the name`).toBe(true)
      expect(got.split, `${table}: no word of the name runs across two lines`).toEqual([])
      expect(got.overflows, `${table}: a name longer than the row wraps inside it`).toBe(false)
    }
    await reviewShot(page, "tables-trash-by-name", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-trash-by-name", "dark")
    await context.close()
  })
}

// V-130: a trash that couldn't be read says so in the shared error state,
// which the tables' shell draws (the trash's own chunk imports none of it),
// and Try again reads it again.
for (const phone of [false, true]) {
  test(`at ${phone ? "390 with touch" : "1280"}, a trash that couldn't be read says so, and Try again reads it again`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
    const at = new Date().toISOString()
    server.trash.push({
      table: { id: OLD, name: "Old budget", visibility: "workspace", created_by: SAM.user_uuid, created_at: at, updated_at: at, deleted_at: at },
      deleted_by_name: SAM.user_full_name,
    })
    server.trashReadsFail = 1
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
      ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
    })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const press = (target: Locator) => (phone ? target.tap() : target.click())

    await press(page.getByRole("button", { name: "Trash", exact: true }))
    await expect(page.getByText("Couldn't load the trash")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Nothing has been lost. This is usually a connection problem: try again in a moment.")).toBeVisible()
    // V-131: a screen reader hears it once, as an alert, since the toast stays quiet.
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't load the trash" }), "the failed read is announced as one alert").toHaveCount(1)
    await expect(page.getByRole("button", { name: "Restore Old budget" })).toHaveCount(0)
    await reviewShot(page, "tables-trash-failed", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-trash-failed", "dark")
    await page.emulateMedia({ colorScheme: "light" })

    await press(page.getByRole("button", { name: "Try again" }))
    await expect(page.getByRole("button", { name: "Restore Old budget" })).toBeVisible()
    expect(server.trashReads, "Try again reads the trash once more").toBe(2)
    await expect(page.getByText("Couldn't load the trash")).toHaveCount(0)
    await context.close()
  })
}

// V-131: a refused read says the server's words in place of the default line,
// and a screen reader hears them once, as an alert (DB-52's look at 390).
test("at 390 with touch, a trash the server refuses says why, as one alert", async ({ browser }, testInfo) => {
  const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
  server.trashReadsFail = 1
  server.trashRefusal = "Only the workspace's admins see every deleted table."
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await server.attach(page, testInfo, SAM)
  await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })

  await page.getByRole("button", { name: "Trash", exact: true }).tap()
  await expect(page.getByText(server.trashRefusal)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("Nothing has been lost."), "the server's words take the default line's place").toHaveCount(0)
  await expect(page.getByRole("alert").filter({ hasText: server.trashRefusal }), "the refusal is announced as one alert").toHaveCount(1)
  await reviewShot(page, "tables-trash-refused", "light")
  await page.emulateMedia({ colorScheme: "dark" })
  await reviewShot(page, "tables-trash-refused", "dark")
  await context.close()
})
