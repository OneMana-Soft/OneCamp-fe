import { expect, test } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// On a call's own page the dock's Chat lit up and opened nothing (18 Oct
// 2026): it puts the conversation in split view, and the page drew the call
// alone. Chat now opens the channel beside the call, on the same page, and the
// call stays where it is (components/split/MeetingSplit.tsx).
//
// The call's server never answers here (stubBackend accepts every socket and
// says nothing), so the call is still connecting: its stage and dock are up,
// which is all this needs, and no media server is involved.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const CH = "c0ffee00-0000-4000-8000-0000000000c2"

test("Chat on a call's own page opens the channel beside the call, and closes it again", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
  })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })

  const chat = page.getByRole("button", { name: "Chat", exact: true })
  await expect(chat).toBeVisible({ timeout: 30_000 })
  await expect(chat).toHaveAttribute("aria-pressed", "false")
  const stage = page.locator("[data-call-stage]")
  await expect(stage).toHaveCount(1)
  const stageEl = await stage.elementHandle()

  await chat.click()
  const beside = page.getByRole("region", { name: "Channel, side by side" })
  await expect(beside).toBeVisible()
  await expect(chat).toHaveAttribute("aria-pressed", "true")
  // The same call, not a new one: the green room didn't come back, and the
  // stage on screen is the element that was there before Chat.
  await expect(page.getByRole("button", { name: "Join now" })).toHaveCount(0)
  expect(await stageEl!.evaluate((el) => el.isConnected)).toBe(true)
  // The page is still the call's: nothing navigated.
  expect(new URL(page.url()).pathname).toBe(`/app/meet/ch/${CH}`)

  await chat.click()
  await expect(beside).toHaveCount(0)
  await expect(chat).toHaveAttribute("aria-pressed", "false")
  expect(await stageEl!.evaluate((el) => el.isConnected)).toBe(true)
})
