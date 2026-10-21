import { expect, test } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// A call button on a tablet started no call (split view's case 14, 20 Oct
// 2026). The channel, DM and group headers open a call beside the
// conversation, and decided that by "is this a phone?" alone; the shell shows
// no views side by side on a tablet, so the tap was taken, the call went into
// a pane nobody could see, and nothing happened. The shell's switch decides
// now (components/views/callBeside.test.tsx holds all three headers): on a
// tablet in portrait the button opens the call's page.

test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true })

const CH = "c0ffee00-0000-4000-8000-0000000000d4"

test("a channel's call button on a tablet in portrait opens the call's page", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/channelBasicInfo": {
      msg: "ok",
      channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_member: true, ch_is_admin: false, ch_deleted_at: "0001-01-01T00:00:00Z", ch_member_count: 3 },
    },
  })
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const call = page.getByRole("link", { name: "Start a huddle" })
  await expect(call).toBeVisible({ timeout: 90_000 })
  await call.tap()
  await expect(page).toHaveURL(new RegExp(`/app/meet/ch/${CH}$`), { timeout: 30_000 })
})
