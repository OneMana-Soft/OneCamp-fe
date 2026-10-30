import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { FILES_HOST, TableServer } from "./tableServer"

// Tables B4 (airtable-05, notion-db-04): a table shows as a gallery of cards
// and as a list, both reading the view's windows from the server in its
// order as the grid does, with the view's colours, and a card's cover from
// its row's first image.

const SHOTS = process.env.SHOTS_DIR
const ROWS = 2000
const STAGES = ["Lead", "Won", "Lost"]
const LOGO = "f0000000-0000-4000-8000-000000000001"
const served = () => {
  const server = new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "stage", name: "Stage", type: "select", config: { options: STAGES.map((label, i) => ({ id: `o${i}`, label, color: ["sky", "moss", "berry"][i] })) } },
      { id: "amount", name: "Amount", type: "number" },
      { id: "pics", name: "Pics", type: "attachment" },
      { id: "notes", name: "Notes", type: "text" },
    ],
    Array.from({ length: ROWS }, (_, i) => ({
      item: `Line ${i}`,
      stage: STAGES[i % 3],
      amount: i * 10,
      notes: `Note ${i}`,
      ...(i % 2 === 0 ? { pics: [{ id: LOGO, name: "logo.png", mime: "image/png" }] } : {}),
    })),
  )
  server.answersQuery = true
  return server
}

/** Until every overlay has finished coming or going, and every cover in sight has drawn. */
const settled = (page: Page) =>
  page.waitForFunction(
    () =>
      document.getAnimations().every((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target
        return a.playState !== "running" || !el?.closest('[role="menu"], [role="dialog"], [role="listbox"], [data-overlay]')
      }) && [...document.querySelectorAll<HTMLImageElement>("[data-cover] img")].every((i) => i.complete),
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

const picture = readFileSync("public/icons/icon-circle-512.png")
const windowsRead = (server: TableServer) => server.queries.filter((q) => !q.count).map((q) => q.cursor ?? "")

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 600
  test(`at ${viewport.width}, a table shows as a gallery and a list, each reading the view's windows`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const server = served()
    const sam = await server.open(browser, testInfo, SAM, { viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    const { page } = sam
    await page.route(`${FILES_HOST}/**`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: picture }))
    await expect(page.locator("tbody tr[data-row], [data-table-list] li[aria-setsize]").first()).toContainText("Line 0", { timeout: 30_000 })

    // The gallery: cards in the view's order, each naming its fields, covers from the rows' images.
    await page.getByRole("button", { name: "Gallery" }).click()
    await expect(page).toHaveURL(/view=gallery/)
    const cards = page.locator("[data-card]")
    await expect(cards.first()).toContainText("Line 0", { timeout: 30_000 })
    await expect(cards.first()).toContainText("Amount")
    await expect(cards.first().locator("[data-cover] img")).toBeVisible()
    await expect(cards.nth(1)).toContainText("Line 1")
    await expect(cards.first()).toHaveAttribute("aria-setsize", String(ROWS))
    if (phone) {
      // One card to a line on a phone, the width of the view.
      const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1)
    } else {
      const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
      expect(Math.abs(b!.y - a!.y)).toBeLessThan(1)
    }
    // The page never reads every row: the server's windows, from the first.
    expect(windowsRead(server)[0]).toBe("")
    // Coloured by Stage: each card's band in its option's colour.
    await page.getByRole("button", { name: "Row height and colour" }).click()
    await page.getByRole("menuitemradio", { name: "By Stage" }).click()
    await expect(cards.nth(0).locator("[data-row-hue]")).toHaveAttribute("data-row-hue", "sky")
    await expect(cards.nth(1).locator("[data-row-hue]")).toHaveAttribute("data-row-hue", "moss")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await page.mouse.move(0, 0)
    await shoot(page, `layouts-${viewport.width}-gallery`)
    // Scrolled to its end, it reads on through the windows, and draws the last cards.
    const before = windowsRead(server).length
    await page.locator("[data-gallery-scroll]").evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect.poll(() => windowsRead(server).length, { timeout: 30_000 }).toBeGreaterThan(before)
    await expect(page.locator("[data-card]", { hasText: `Line ${ROWS - 1}` })).toBeVisible({ timeout: 30_000 })
    // A card opens its row's record.
    await page.locator("[data-card]", { hasText: `Line ${ROWS - 1}` }).getByRole("button").click()
    const record = page.locator("[data-record-panel]")
    await expect(record).toBeVisible({ timeout: 30_000 })
    await expect(record).toHaveAttribute("aria-label", new RegExp(`^Line ${ROWS - 1}, a row of`))
    await record.getByRole("button", { name: "Close" }).click()
    await expect(record).toHaveCount(0)

    // The list: the view's rows as lines, read through the same windows, coloured the same.
    await page.getByRole("button", { name: "List" }).click()
    await expect(page).toHaveURL(/view=list/)
    const lines = page.locator("[data-table-list] li[aria-setsize]")
    await expect(lines.first()).toContainText("Line 0", { timeout: 30_000 })
    await expect(lines.first()).toHaveAttribute("aria-setsize", String(ROWS))
    await expect(lines.first().locator("[data-row-hue]")).toHaveAttribute("data-row-hue", "sky")
    await expect(page.locator("tbody tr[data-row]")).toHaveCount(0)
    await page.mouse.move(0, 0)
    await shoot(page, `layouts-${viewport.width}-list`)
    await sam.close()
  })
}

// B4's timeline and Gantt: the rows as bars across their days; a bar dragged
// two days writes its row's dates; the Gantt draws what each row waits on.
const TABLE = "6c0f5a1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b"
const rowId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
const day = (d: number) => {
  const t = new Date()
  t.setDate(t.getDate() + d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
}
const planned = () =>
  new TableServer(
    [
      { id: "item", name: "Task", type: "text" },
      { id: "starts", name: "Starts", type: "date" },
      { id: "due", name: "Due", type: "date" },
      { id: "after", name: "After", type: "relation", config: { relation_target: "table", table_id: TABLE } },
    ],
    Array.from({ length: 40 }, (_, i) => ({
      item: `Step ${i}`,
      starts: day(i * 2 - 4),
      // Each step ends the day before the next starts: its arrows kept, but Step 7's, which starts as Step 6 ends.
      due: day(i * 2 - (i === 6 ? 2 : 3)),
      ...(i % 5 ? { after: [{ id: rowId(i - 1), type: "row", table_id: TABLE, label: `Step ${i - 1}` }] } : {}),
    })),
  )

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 600
  test(`at ${viewport.width}, a table shows as a timeline and a Gantt, and a bar moves its row's days`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const server = planned()
    const sam = await server.open(browser, testInfo, SAM, { viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    const { page } = sam
    await expect(page.locator("tbody tr[data-row], [data-table-list] li[aria-setsize]").first()).toContainText("Step 0", { timeout: 30_000 })
    await page.getByRole("button", { name: "Timeline" }).click()
    await expect(page).toHaveURL(/view=timeline/)
    const bar = (i: number) => page.locator(`[data-bar="${rowId(i)}"]`)
    await expect(bar(3)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("combobox", { name: "Starts" })).toContainText("Starts")
    await expect(page.getByRole("combobox", { name: "Ends" })).toContainText("Due")
    await expect(page.locator("path[data-link]")).toHaveCount(0)
    await page.mouse.move(0, 0)
    await shoot(page, `layouts-${viewport.width}-timeline`)
    if (!phone) {
      // Dragged two days later (a week's zoom: 16 px a day), its row's dates follow.
      const box = (await bar(3).boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2, { steps: 4 })
      await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2, { steps: 4 })
      await page.mouse.up()
      await expect.poll(() => server.writes.filter((w) => w.kind === "patch" && w.rowId === rowId(3)).length, { timeout: 15_000 }).toBe(1)
      const patch = server.writes.find((w) => w.kind === "patch" && w.rowId === rowId(3))!
      expect(patch.body).toEqual({ values: { starts: day(4), due: day(5) } })
    }
    await page.getByRole("button", { name: "Gantt" }).click()
    await expect(page).toHaveURL(/view=gantt/)
    await expect(page.getByRole("combobox", { name: "Waits on" })).toContainText("After")
    await expect.poll(() => page.locator('path[data-link="kept"]').count(), { timeout: 30_000 }).toBeGreaterThan(4)
    // Step 7's; and at 1280, Step 4's too, now Step 3 was dragged into its first days.
    await expect(page.locator('path[data-link="broken"]')).toHaveCount(phone ? 1 : 2)
    await page.mouse.move(0, 0)
    await shoot(page, `layouts-${viewport.width}-gantt`)
    await sam.close()
  })
}
