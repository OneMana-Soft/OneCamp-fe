import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// V-126: a DM with an agent (a bot, by class) says the agent's role where a person's presence would be, and offers
// no huddle or call with it, at both widths by one rule (lib/botCopy). At 390 the phone's bar said "Offline"
// and offered "Start a huddle" while 1280 showed the agent's line. A person's DM keeps presence and its huddle.
// The no-huddle checks run only once the bar says who the DM is with, so they never pass on a page still loading.

const AI = { user_uuid: "a1a1a1a1-0000-4000-8000-0000000000a1", user_name: "OneCamp AI", user_full_name: "OneCamp AI", user_email_id: "ai@example.com", is_bot: true }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen", user_email_id: "maya@example.com", user_status: "online", user_device_connected: 1 }
const QUIET = {
  "/config/client": { msg: "ok", data: { features: { calls: true, ai: true } } },
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  [`/user/profile/${AI.user_uuid}`]: { msg: "ok", data: AI },
  [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
  [`/dm/latestChat/${AI.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
  [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
  "/dm/": { msg: "ok", data: [] },
  "/user/dm-ai-suggestions": { msg: "ok", data: [] },
}
const LINE = "Acts for you · can do only what you can"

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
type View = (typeof views)[number]

/** Sam's DM with `peer` at a width (a phone with touch at 390). */
async function openDm(browser: Browser, testInfo: TestInfo, view: View, peer: { user_uuid: string }) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport,
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, QUIET)
  await page.goto(`/app/chat/${peer.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { context, page }
}

for (const view of views) {
  test(`at ${view.name}: an agent's DM says its role, never presence, and offers no huddle or call`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const { context, page } = await openDm(browser, testInfo, view, AI)
    if (view.phone) {
      const title = page.getByRole("button", { name: "OneCamp AI, profile" })
      await expect(title).toContainText("Acts for you", { timeout: 90_000 })
      await expect(title).not.toContainText(/Active|Away|Offline/)
    } else {
      await expect(page.locator("[data-header-meta]").first()).toHaveText(LINE, { timeout: 90_000 })
    }
    await expect(page.getByRole("link", { name: /huddle/i })).toHaveCount(0)
    if (view.phone) {
      // The options sheet's second call path (the phone's "Join call") is gone as well.
      await page.getByRole("button", { name: "Chat options" }).tap()
      await expect(page.getByRole("dialog").getByRole("button", { name: "Call recordings" })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole("button", { name: "Join call" })).toHaveCount(0)
    }
    await context.close()
  })

  test(`at ${view.name}: a person's DM keeps presence and offers a huddle`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const { context, page } = await openDm(browser, testInfo, view, MAYA)
    if (view.phone) {
      await expect(page.getByRole("button", { name: "Maya Chen, profile" })).toContainText(/Active|Away|Offline/, { timeout: 90_000 })
    } else {
      await expect(page.locator("[data-header-meta]").first()).not.toHaveText(LINE, { timeout: 90_000 })
    }
    await expect(page.getByRole("link", { name: "Start a huddle" }).first()).toBeVisible({ timeout: 60_000 })
    if (view.phone) {
      await page.getByRole("button", { name: "Chat options" }).tap()
      await expect(page.getByRole("dialog").getByRole("button", { name: "Join call" })).toBeVisible({ timeout: 30_000 })
    }
    await context.close()
  })
}
