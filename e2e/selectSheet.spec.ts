import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test"

import { importPage } from "./adminImport"

// A select (components/ui/select) on a phone is a sheet, "a sheet list with the
// chosen row checked" (design/drawers-v3), never a list in the page under the
// finger. Read through the import page's Basecamp account picker: by touch at
// 390 a titled sheet whose rows take a finger's 44px, no row lit while nothing
// is chosen, a tap that picks and closes it, and the chosen row checked when it
// opens again; at 1280 the list by its field, as before.

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 860 } }
const NAME = "Pick a Basecamp account"

async function accountPicker(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), ...options })
  const page = await context.newPage()
  await importPage(page, testInfo, true, "&connected=basecamp")
  const field = page.getByRole("combobox", { name: NAME })
  await expect(field).toBeVisible({ timeout: 90_000 })
  await field.scrollIntoViewIfNeeded()
  return page
}

test("by touch at 390, a select is a titled sheet: 44px rows, nothing lit until chosen, a tap picks", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const page = await accountPicker(browser, testInfo, PHONE)
  const field = page.getByRole("combobox", { name: NAME })

  await field.tap()
  const sheet = page.getByRole("dialog", { name: NAME })
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute("data-overlay", "sheet")
  const rows = sheet.getByRole("option")
  await expect(rows).toHaveCount(2)
  for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "a row under a finger").toBeGreaterThanOrEqual(44)
  await expect(page.locator('[role="option"]:is([data-highlighted], [data-selected="true"])'), "nothing chosen: no row lit").toHaveCount(0)

  await sheet.getByRole("option", { name: "Acme Studio" }).tap()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByLabel("Workspace name")).toHaveValue("Acme Studio")
  await expect(field).toHaveText(/Acme Studio/)

  await field.tap()
  await expect(page.getByRole("dialog", { name: NAME }).getByRole("option", { name: "Acme Studio" })).toHaveAttribute("aria-checked", "true")
  await page.context().close()
})

test("at 1280, a select is the list by its field, as before", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const page = await accountPicker(browser, testInfo, COMPUTER)
  await page.getByRole("combobox", { name: NAME }).click()
  await expect(page.getByRole("listbox")).toBeVisible()
  await expect(page.locator("[data-v3-sheet]")).toHaveCount(0)
  await page.getByRole("option", { name: "Acme Studio" }).click()
  await expect(page.getByLabel("Workspace name")).toHaveValue("Acme Studio")
  await page.context().close()
})
