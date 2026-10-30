import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// The message box named its keys ("⏎ send ⇧⏎ new line") on a tablet too,
// where there is no Enter key to press (design-03, item 5). Keys are named
// on a computer: a fine pointer, as the shell reads one (lib/ui/shellBand).

const CH = "c0ffee00-0000-4000-8000-0000000000e5"

async function openChannel(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/ch/channelBasicInfo": {
      msg: "ok",
      channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_member: true, ch_is_admin: false, ch_deleted_at: "0001-01-01T00:00:00Z", ch_member_count: 3 },
    },
  })
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[contenteditable='true']").last()).toBeVisible({ timeout: 90_000 })
  return page.locator("[data-send-hint]")
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("the message box names its keys", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await expect(await openChannel(page, testInfo)).toBeVisible()
  })
})

test.describe("on a tablet held sideways", () => {
  test.use({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true })

  test("the message box names no keys, having none to press", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const hint = await openChannel(page, testInfo)
    // The box is the computer's, hint and all, so the hint is hidden rather than missing.
    await expect(hint).toHaveCount(1)
    await expect(hint).toBeHidden()
  })
})
