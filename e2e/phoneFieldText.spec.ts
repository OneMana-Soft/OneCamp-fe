import { expect, test, type Page } from "@playwright/test"

import { CollabRelay } from "./docs/collabRelay"
import { openDocWith } from "./docs/docWith"
import { expectFieldText } from "./foreignSheets"
import { SAM, stubBackend } from "./stubbedApp"
import { TableServer } from "./tables/tableServer"

// On a touch screen the app's main phone fields draw their text at 16px or
// more as they take focus, in Chromium and WebKit: iOS Safari zooms the page
// into a smaller one, and zoomed in, the app stops fitting a sheet to the
// keyboard (lib/ui/visualViewport reads a zoom as the person's). Playwright's
// WebKit never zooms, so the size is what is checked (V-377). The rules that
// size them: app/globals.css's NO ZOOM ON FOCUS (a field set in a small size),
// the editors' in components/minimal-tiptap/styles/index.css, and a docked
// sheet's in components/ui/foreignSheets.css. A board's own sheets (its
// comment, reply and AI composer) are checked by expectSheet, in
// e2e/boardSheets.spec.ts.

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const DOC = "3e7a5c1d-9b2f-4e8a-a6d4-c0f1e2d3b4a5"
const ITEM = { id: "item", name: "Item", type: "text" }
const COST = { id: "cost", name: "Cost", type: "number" }

test.use(PHONE)

/**
 * The field with the focus draws its text at 16px or more (what iOS reads as
 * it takes focus), and so does every other field the page shows
 * (expectFieldText). The run's log records each focused field's size.
 */
async function expectFocusedText(page: Page, what: string) {
  const focused = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const name = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || ""
    return { field: `${el.tagName.toLowerCase()} "${name}"`, size: getComputedStyle(el).fontSize, coarse: matchMedia("(pointer: coarse)").matches }
  })
  console.log(`FIELD [${test.info().project.name}] ${what}: ${JSON.stringify(focused)}`)
  expect(focused, `${what}: a field has the focus`).not.toBeNull()
  expect(focused?.coarse, `${what}: the screen is a touch screen`).toBe(true)
  expect(parseFloat(focused?.size ?? "0"), `${what}: ${focused?.field} draws its text at 16px or more`).toBeGreaterThanOrEqual(16)
  await expectFieldText(page.locator("body"), what)
}

test("a conversation's message box", async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await stubBackend(page, testInfo, {
    "/user/allUsers": { msg: "ok", users: [SAM, MAYA] },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
  })
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  const box = page.locator('[contenteditable="true"]').last()
  await expect(box).toBeVisible({ timeout: 120_000 })
  await box.tap()
  await expect(box).toBeFocused()
  await expectFocusedText(page, "a conversation's message box")
})

test("the conversations list's search", async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await stubBackend(page, testInfo, { "/dm/getLatestChatList": { msg: "ok", data: { ...SAM, user_dms: [] } } })
  await page.goto("/app/chat", { waitUntil: "domcontentloaded", timeout: 180_000 })
  const field = page.getByRole("searchbox", { name: "Find a conversation" })
  await expect(field).toBeVisible({ timeout: 120_000 })
  await field.tap()
  await expect(field).toBeFocused()
  await expectFocusedText(page, "the conversations list's search")
})

test("search's field", async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await stubBackend(page, testInfo, { "/query/search": { data: { page: [], totals: {}, total: 0, has_more: false } } })
  await page.goto("/app/search?query=budget", { waitUntil: "domcontentloaded", timeout: 180_000 })
  const field = page.getByRole("searchbox", { name: "Search" }).or(page.getByRole("textbox", { name: "Search" }))
  await expect(field).toHaveValue("budget", { timeout: 120_000 })
  await field.tap()
  await expect(field).toBeFocused()
  await expectFocusedText(page, "search's field")
})

test("a doc's comment", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, body: "<p>Launch on Friday</p>" }, {}, { width: 390, height: 844, isMobile: true, hasTouch: true })
  // A phone's comments are a page of their own, with a box for the page.
  await tab.page.goto(`/app/doc/${DOC}/comment`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const draft = tab.page.getByRole("textbox", { name: "Comment on the page" })
  await expect(draft).toBeVisible({ timeout: 60_000 })
  await draft.tap()
  await expect(draft).toBeFocused()
  await expectFocusedText(tab.page, "a doc's comment")
  await tab.close()
})

test("a table's cell", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  // Two fields: a phone draws the grid, each cell a text box.
  const server = new TableServer([ITEM, COST], [{ item: "Booth", cost: 1200 }])
  const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
  const cost = page.getByRole("textbox", { name: "Cost" }).first()
  await expect(cost).toHaveValue("1200", { timeout: 30_000 })
  // Under a finger a cell's text box takes no tap until it has the focus: a finger presses the cell's box (table.css).
  await page.locator('[data-cell-box]:has(> [data-cell="0:1"])').tap()
  await expect(cost).toBeFocused()
  await expectFocusedText(page, "a table's cell")
  await close()
})

test("a row's record, from the phone's list", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  // Past four fields a phone draws a list, and a row opens its record.
  const fields = [ITEM, COST, { id: "units", name: "Units", type: "number" }, { id: "vendor", name: "Vendor", type: "text" }, { id: "notes", name: "Notes", type: "text" }]
  const server = new TableServer(fields, [{ item: "Booth", cost: 1200, units: 2, vendor: "Acme" }])
  const { page, close } = await server.open(browser, testInfo, SAM, PHONE)
  await page.getByRole("button", { name: /^Booth / }).tap({ timeout: 30_000 })
  const vendor = page.locator("[data-record-panel]").getByRole("textbox", { name: "Vendor" })
  await expect(vendor).toHaveValue("Acme")
  await vendor.tap()
  await expect(vendor).toBeFocused()
  await expectFocusedText(page, "a row's record")
  await close()
})
