import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"
import { expectTouchSize } from "../touchTarget"
import { boxWithin, busySpinnerBox } from "../controlLook"

// "Export all tables" (gsheets-import-02, items 1 and 3): the tables page's
// header saves every table the reader can open as one Excel workbook, a sheet
// a table, as the server writes it (POST /tables/export, in the reader's
// zone). A refusal says the server's words and saves nothing; a reader with no
// table to open is offered no export at all. At 390 the action is pressed by
// touch and reaches a full touch target. While an export runs the action is
// busy and a second press asks for nothing more; on a phone its spinner draws
// inside the button, not at the touch reach's corner. An export whose code
// can't load says to check the connection, and the next press saves it.

for (const phone of [false, true]) {
  const at = phone ? "at 390 with touch" : "at 1280"
  const open = async (browser: Browser, testInfo: TestInfo, server: TableServer, before?: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
      ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
    })
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await before?.(page)
    await page.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
    return { page, close: () => context.close() }
  }
  const press = (target: Locator) => (phone ? target.tap() : target.click())

  test(`${at}, every table the reader can open saves as one Excel workbook from the header`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }])
    const { page, close } = await open(browser, testInfo, server)
    const action = page.getByRole("button", { name: "Export all tables", exact: true })
    await expect(action).toBeVisible({ timeout: 60_000 })
    if (phone) {
      // The icon draws at the header's size; its reach (F3's ::before, app/phone.css) is a full touch target.
      const reach = await action.evaluate((b) => {
        const r = b.getBoundingClientRect()
        const before = getComputedStyle(b, "::before")
        const grow = before.position === "absolute" ? -2 * parseFloat(before.left || "0") : 0
        return Math.min(r.width, r.height) + grow
      })
      expectTouchSize(reach, "the phone's Export all tables")
    }
    await reviewShot(page, "tables-export-all", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-export-all", "dark")
    await page.emulateMedia({ colorScheme: "light" })

    let answer = () => {}
    server.exportAllHeld = new Promise<void>((settle) => (answer = settle))
    const saved = page.waitForEvent("download")
    await press(action)
    await expect(action).toHaveAttribute("aria-busy", "true")
    // Exact: the toast's screen-reader announcement ("Notification Exporting every table ...") holds the same words.
    await expect(page.getByText("Exporting every table", { exact: true })).toBeVisible()
    await action.press("Enter")
    if (phone) {
      // The spinner is the busy layer's ::after (the reach is F3's ::before), inside its button under a coarse pointer too.
      const box = await busySpinnerBox(action)
      expect(box, "the busy action draws a spinner").not.toBeNull()
      expect(boxWithin(box!.spinner, box!.control), `the busy spinner ${JSON.stringify(box)} lies inside its button`).toBe(true)
    }
    await reviewShot(page, "tables-export-all-busy", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-export-all-busy", "dark")
    await page.emulateMedia({ colorScheme: "light" })
    answer()
    expect((await saved).suggestedFilename()).toBe("Tables.xlsx")
    await expect(page.getByText("Exported to Excel", { exact: true })).toBeVisible()
    await expect(action).not.toHaveAttribute("aria-busy", "true")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-export-all-saved", "dark")
    expect(server.exportsAll).toEqual([expect.stringMatching(/^\?tz=/)])
    await close()
  })

  test(`${at}, an export of every table the server refuses says its words and saves nothing`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }])
    const why = "You can open more than 100 tables, more than one workbook holds. Export the tables one at a time."
    server.exportAllRefused = why
    const { page, close } = await open(browser, testInfo, server)
    let downloads = 0
    page.on("download", () => downloads++)
    await press(page.getByRole("button", { name: "Export all tables", exact: true }))
    await expect(page.getByText("Couldn't export the tables", { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(why, { exact: true })).toBeVisible()
    await reviewShot(page, "tables-export-all-refused", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, "tables-export-all-refused", "dark")
    expect(server.exportsAll).toHaveLength(1)
    expect(downloads).toBe(0)
    await close()
  })

  test(`${at}, an export of every table whose code can't load says to check the connection, and the next press saves it`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }])
    // The export's own chunk (lib/tables/exportAll, read on use) fails on every request, as a dropped
    // connection fails it, until the first press has said so: lost only once, it is asked for again
    // (lib/chunkRecovery's HEAD, then the load itself) and loads, and nothing is said.
    let lost: string | undefined
    let holding = true
    let dropped = 0
    const { page, close } = await open(browser, testInfo, server, async (p) => {
      await p.route("**/_next/static/chunks/*.js", async (route) => {
        // Then the connection is back: every chunk loads as it is, and no response is read here that
        // could outlive the page (a read at close fails the test with "Response has been disposed").
        if (!holding) return route.fallback()
        if (route.request().url() === lost) {
          dropped++
          return route.abort("internetdisconnected")
        }
        const response = await route.fetch()
        const body = await response.text()
        if (holding && body.includes("Exporting every table")) {
          lost = route.request().url()
          dropped++
          return route.abort("internetdisconnected")
        }
        return route.fulfill({ response, body })
      })
    })
    const action = page.getByRole("button", { name: "Export all tables", exact: true })
    await expect(action).toBeVisible({ timeout: 60_000 })
    await press(action)
    await expect(page.getByText("Couldn't export the tables", { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Check your connection and try again.", { exact: true })).toBeVisible()
    expect(dropped).toBeGreaterThanOrEqual(1)
    holding = false
    await expect(action).not.toHaveAttribute("aria-busy", "true")
    await expect(action).toBeFocused()
    expect(server.exportsAll).toHaveLength(0)
    const saved = page.waitForEvent("download")
    await press(action)
    expect((await saved).suggestedFilename()).toBe("Tables.xlsx")
    await expect(page.getByText("Exported to Excel", { exact: true })).toBeVisible()
    expect(server.exportsAll).toHaveLength(1)
    await close()
  })

  test(`${at}, a reader with no table to open is offered no export of every table`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }])
    server.listsNoTable = true
    const { page, close } = await open(browser, testInfo, server)
    // The list loaded and holds nothing: the empty state's heading (it has a "New table" of its own beside the header's).
    await expect(page.getByRole("heading", { name: "Make your first table" })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("status", { name: "Loading tables" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Export all tables", exact: true })).toHaveCount(0)
    expect(server.exportsAll).toHaveLength(0)
    await close()
  })
}
