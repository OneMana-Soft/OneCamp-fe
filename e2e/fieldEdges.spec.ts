import { expect, test } from "@playwright/test"

import { openKeyboard } from "./keyboard"
import { sheetLayout, topSheet } from "./sheetLayout"
import { SAM, expectHomeSettled, stubBackend } from "./stubbedApp"

// The owner, 17 Oct 2026: a search field in a sheet was "trimmed from left and
// right". The shared search field (components/ui/search-input, an input group)
// shows whole, its edge and its 4px focus halo, inside whatever holds it: a
// list's frame as well as a sheet. Measured with the sheets' own measure
// (e2e/sheetLayout `clipped`), on a 390px touch screen, focused.

const PHONE = { width: 390, height: 844 }

test.describe("the search field shows whole where it sits, on a 390px phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

  test("in the conversations list's frame, focused", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await stubBackend(page, testInfo, {
      "/dm/getLatestChatList": { msg: "ok", data: { ...SAM, user_dms: [] } },
    })
    await page.goto("/app/chat", { waitUntil: "domcontentloaded", timeout: 180_000 })
    const field = page.getByRole("searchbox", { name: "Find a conversation" })
    await expect(field).toBeVisible({ timeout: 120_000 })
    await field.focus()
    // The list's own frame clips (overflow hidden): the field keeps its halo inside it.
    const frame = page.locator("[data-list-search]").locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' overflow-hidden ')][1]")
    expect((await sheetLayout(frame)).clipped).toEqual([])
  })

  test("in the emoji sheet over the status sheet, focused, with the keyboard up", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await stubBackend(page, testInfo, {
      "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
      "/activity/unified": { msg: "ok", data: null },
      "/user/assignedTaskList": { msg: "ok", data: null },
      "/event/getEvents": { msg: "ok", data: null },
      "/project/overview": { msg: "ok", data: { projects: [] } },
      "/ch/suggested": { msg: "ok", data: [] },
    })
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expectHomeSettled(page)
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await page.getByRole("button", { name: /^(Set a status|Change your status)$/ }).click({ timeout: 60_000 })
    await page.getByRole("button", { name: "Choose a status emoji" }).click({ timeout: 60_000 })
    const field = page.getByRole("searchbox", { name: "Search emoji" })
    await expect(field).toBeVisible({ timeout: 60_000 })
    await field.focus()
    expect((await sheetLayout(topSheet(page))).clipped, "focused").toEqual([])
    const close = await openKeyboard(page, "visual")
    await field.fill("smile")
    expect((await sheetLayout(topSheet(page))).clipped, "with the keyboard up and something typed").toEqual([])
    await close()
  })
})
