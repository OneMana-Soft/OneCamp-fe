import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { expectHomeSettled, stubBackend } from "./stubbedApp"

// The invite form is a lazy dialog (lib/lazy/lazyDialog, the doc route's
// payback, 23 Oct 2026): every signed-in screen may open it, from the
// workspace menu on a computer and from the You sheet on a phone, and its code
// comes the first time it opens. In a production build it has to come, open
// as itself, close, and open again. On a phone the You sheet hides while the
// form shows (components/drawers/sheetHandoff), so a form that never came
// would leave nothing on the screen.

async function home(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    // Someone who may invite: only they are offered "Invite people".
    "/me/capabilities": { msg: "ok", data: { "invitation.create": true } },
    // Home's own reads, answered empty: a "Not found" toast is a layer too.
    "/activity/unified": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", data: null },
    "/event/getEvents": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/ch/suggested": { msg: "ok", data: [] },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  await expectHomeSettled(page)
}

/** The invite form, open: an address typed in its field makes Send ready, and Cancel closes it. */
async function opensAndCloses(page: Page) {
  const form = page.getByRole("dialog", { name: "Invite people" })
  await expect(form).toBeVisible({ timeout: 60_000 })
  await form.getByLabel("Email addresses").fill("priya@example.com")
  await expect(form.getByRole("button", { name: "Send invitation" })).toBeEnabled()
  await form.getByRole("button", { name: "Cancel" }).click()
  await expect(form).toBeHidden()
}

test.describe("a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("the workspace menu's Invite people opens the invite form, and again once it's closed", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await home(page, testInfo)
    for (let round = 0; round < 2; round++) {
      await page.getByRole("button", { name: / workspace menu$/ }).click({ timeout: 120_000 })
      await page.getByRole("menuitem", { name: "Invite people" }).click()
      await opensAndCloses(page)
    }
  })
})

test.describe("a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the You sheet hands over to the invite form, and both are gone once it's closed", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await home(page, testInfo)
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    const you = page.locator("[data-you-status]")
    await expect(you).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: "Invite people" }).click()
    await expect(you).toBeHidden()
    await opensAndCloses(page)
    await expect(you).toBeHidden()
  })
})
