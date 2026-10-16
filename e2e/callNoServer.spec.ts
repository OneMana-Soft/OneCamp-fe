import { expect, test } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// QA F-21: after Join now the tab died. A call asked, on every join, whether
// Chrome can recognise speech on the device (SpeechRecognition.available), and
// a Chromium that exposes that API without its on-device service ends the page
// for it ("bad Mojo message"), as this headless browser does. The question is
// asked only while captions are on, so a call whose server can't be reached
// ends on why, with Try again, and the tab lives on.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const CH = "c0ffee00-0000-4000-8000-0000000000c1"

test("a call whose server can't be reached says so, and the tab lives on", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  let crashed = false
  page.on("crash", () => {
    crashed = true
  })
  await stubBackend(page, testInfo, {
    // A server with calls, so the call route opens its green room.
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
  })
  // The call server refuses: its socket closes as it opens.
  await page.routeWebSocket(/livekit/, (ws) => ws.close())
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 60_000 })
  // The tab died within a second of Join: stay well past it.
  await page.waitForTimeout(12_000)
  expect(crashed).toBe(false)
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
})
