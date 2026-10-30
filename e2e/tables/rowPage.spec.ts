import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A row as a page (tables T2): a row's record shows its page under its
// fields, the doc's own editor with its saved body; a row with no page offers
// one to someone who may write in it; the record opens as a page across the
// window. With TABLE_SHOTS set to a folder, it also saves the record with its
// page at 1280 (beside the grid and as a page) and 390, light and dark, for
// the design review.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
]
const rows = [
  { item: "Booth for the launch", owner: "Priya", stage: "To do", cost: 1200 },
  { item: "Printed banners", owner: "Sam", stage: "Done", cost: 340 },
]

const BRIEF =
  "<h2>The brief</h2>" +
  "<p>A two-day booth at the launch. The venue opens at nine, so the build crew needs the keys by eight.</p>" +
  "<ul><li><p>Final quote from the venue</p></li><li><p>Banner sizes from print</p></li><li><p>Power for two screens</p></li></ul>" +
  "<p>Ask Priya before changing the stand.</p>"

async function openRecord(server: TableServer, options: { width: number; height: number; scheme: "light" | "dark"; asPage?: boolean }) {
  return async (browser: Parameters<TableServer["open"]>[0], testInfo: Parameters<TableServer["open"]>[1]) => {
    const sam = await server.open(browser, testInfo, SAM, { viewport: { width: options.width, height: options.height }, colorScheme: options.scheme })
    if (options.asPage) await sam.page.evaluate(() => localStorage.setItem("tables.record.asPage", "1"))
    await sam.page.goto(`/app/tables/${server.id}?row=${server.rows[0].id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(sam.page.locator("[data-record-panel]")).toBeVisible({ timeout: 60_000 })
    await expect(sam.page.locator("[data-row-page]")).toBeVisible({ timeout: 30_000 })
    return sam
  }
}

test("a row with no page offers one, and its editor opens in the record", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  const sam = await (await openRecord(server, { width: 1280, height: 900, scheme: "light" }))(browser, testInfo)
  const start = sam.page.getByRole("button", { name: /Write a page for this row/ })
  await expect(start).toBeVisible()
  await start.click()
  await expect.poll(() => server.pagesMade).toEqual([server.rows[0].id])
  await expect(sam.page.locator("[data-row-page-editor]")).toBeVisible({ timeout: 30_000 })
  await expect(start).toHaveCount(0)
  await sam.close()
})

test("a row's page shows its saved body under its fields, and the record opens as a page", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  server.pages.set(server.rows[0].id, { doc: "d0c00000-0000-4000-8000-00000000000a", body: BRIEF })
  const sam = await (await openRecord(server, { width: 1280, height: 900, scheme: "light" }))(browser, testInfo)
  const page = sam.page.locator("[data-row-page]")
  await expect(page.getByText("The brief")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Ask Priya before changing the stand.")).toBeVisible()
  const panel = sam.page.locator("[data-record-panel]")
  const narrow = (await panel.boundingBox())?.width ?? 0
  await sam.page.getByRole("button", { name: "Open as a page" }).click()
  await expect(panel).toHaveAttribute("data-record-as-page", "")
  const wide = (await panel.boundingBox())?.width ?? 0
  expect(wide).toBeGreaterThan(narrow + 400)
  await sam.page.getByRole("button", { name: "Back to the side panel" }).click()
  await expect(panel).not.toHaveAttribute("data-record-as-page", "")
  await sam.close()
})

const shots = process.env.TABLE_SHOTS
for (const [width, height, asPage] of [
  [1280, 900, false],
  [1280, 900, true],
  [390, 844, false],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the record with its page, ${width}${asPage ? " as a page" : ""} ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const server = new TableServer(fields, rows)
      server.pages.set(server.rows[0].id, { doc: "d0c00000-0000-4000-8000-00000000000a", body: BRIEF })
      const sam = await (await openRecord(server, { width, height, scheme, asPage }))(browser, testInfo)
      await expect(sam.page.locator("[data-row-page]").getByText("The brief")).toBeVisible({ timeout: 30_000 })
      await sam.page.locator("[data-row-page]").scrollIntoViewIfNeeded()
      await sam.page.screenshot({ path: `${shots}/row-page-${width}${asPage ? "-as-page" : ""}-${scheme}.png`, animations: "disabled" })
      await sam.close()
    })
  }
  if (!asPage && width === 1280) {
    test("the record offering a page, 1280 light", async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const server = new TableServer(fields, rows)
      const sam = await (await openRecord(server, { width, height, scheme: "light" }))(browser, testInfo)
      await sam.page.getByRole("button", { name: /Write a page for this row/ }).hover()
      await sam.page.screenshot({ path: `${shots}/row-page-start-1280-light.png`, animations: "disabled" })
      await sam.close()
    })
  }
}
