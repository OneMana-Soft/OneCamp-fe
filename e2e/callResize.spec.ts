import { expect, test, type Page } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// Crossing the phone width during a call dropped you out of it (27 Oct 2026):
// the shell drew a call's page in the phone's frame under 640px and in the
// call's own frame above it, so a window resized across the line, or a phone
// or a tablet turned, gave the page a new parent. React mounted the page
// anew, the call's room went with the old one, and the person was back in
// the green room. A call's page now keeps the frame it opened in until it is
// left (app/app/LayoutContent.tsx).
//
// The call's server never answers here (stubBackend accepts every socket and
// says nothing), so the call is still connecting: its stage and dock are up,
// which is all this needs, and no media server is involved.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const CH = "c0ffee00-0000-4000-8000-0000000000c3"
const COMPUTER = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

async function joinTheCall(page: Page, testInfo: Parameters<typeof stubBackend>[1]) {
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
  })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
  const stage = page.locator("[data-call-stage]")
  await expect(stage).toHaveCount(1, { timeout: 30_000 })
  return (await stage.elementHandle())!
}

for (const [from, to] of [
  [COMPUTER, PHONE],
  [PHONE, COMPUTER],
] as const) {
  test(`a call goes on when the window crosses the phone width, ${from.width} to ${to.width} and back`, async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.setViewportSize(from)
    const stage = await joinTheCall(page, testInfo)
    for (const size of [to, from]) {
      await page.setViewportSize(size)
      // Past a layout pass, so a frame swapped under the page has drawn.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      // The same call, not a new one: the green room didn't come back, and the
      // stage on screen is the element that was there before the resize.
      await expect(page.getByRole("button", { name: "Join now" }), `at ${size.width}`).toHaveCount(0)
      expect(await stage.evaluate((el) => el.isConnected), `the stage at ${size.width}`).toBe(true)
      await expect(page.locator("[data-call-stage]")).toHaveCount(1)
      expect(new URL(page.url()).pathname).toBe(`/app/meet/ch/${CH}`)
    }
  })
}
