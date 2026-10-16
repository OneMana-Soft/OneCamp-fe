import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// QA PG2-11 (14 Oct): on a phone a table's calendar drew a "+" in every day
// and chips cut to one letter ("C…", "Pr…"). A phone's month is a dot per row
// on each day, and the picked day's rows below it, by title and field, with
// "Add a row" for that day alone.

test("on a phone, a table's calendar shows dots per day and the picked day's rows", async ({ browser }, testInfo) => {
  const now = new Date()
  const dayOf = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  const today = dayOf(now.getDate())
  const other = dayOf(now.getDate() === 10 ? 11 : 10)
  const server = new TableServer(
    [
      { id: "item", name: "Item", type: "text" },
      { id: "due", name: "Due", type: "date" },
      { id: "cost", name: "Cost", type: "number" },
    ],
    [
      { item: "Catering deposit", due: today, cost: 1200 },
      { item: "Printed programmes", due: today, cost: 300 },
      { item: "Venue walk-through", due: other, cost: 50 },
    ],
  )
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = sam.page
  await page.getByRole("button", { name: "Calendar", exact: true }).tap()
  const calendar = page.locator("[data-table-calendar][data-compact]")
  await expect(calendar).toBeVisible()

  // A dot per row on a day, and one "Add a row", for the picked day.
  await expect(calendar.locator(`[data-day="${today}"] [data-day-dots]`)).toHaveAttribute("data-day-dots", "2")
  await expect(page.getByRole("button", { name: /^Add a row on/ })).toHaveCount(1)

  // Today's rows, readable: the whole title and a field.
  const todays = calendar.locator(`[data-table-calendar-day="${today}"]`)
  const deposit = todays.locator("[data-table-calendar-row]", { hasText: "Catering deposit" })
  await expect(deposit).toContainText("Cost 1,200")
  const box = await deposit.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(300)

  // Another day, tapped, lists its own.
  await calendar.locator(`[data-day="${other}"]`).tap()
  const others = calendar.locator(`[data-table-calendar-day="${other}"]`)
  await expect(others.locator("[data-table-calendar-row]")).toHaveText([/Venue walk-through/])
  await expect(page.getByRole("button", { name: /^Add a row on/ })).toHaveCount(1)

  // A row opens its record.
  await others.locator("[data-table-calendar-row]").first().tap()
  await expect(page.locator("[data-record-panel]")).toBeVisible()
  await sam.close()
})
