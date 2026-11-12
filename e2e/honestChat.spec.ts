import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { LAUNCH, VIEWS, channel, openChannel, type View } from "./channelPage"
import { reviewShot, stubBackend, tidy } from "./stubbedApp"

// HONEST CHAT (UX-CHAT-H2), in a real browser with no backend, at 1280 and at
// 390 with touch, light and dark. On a workspace with no call server and AI
// off (the stubbed app's config: no features), an empty DM offered "Start a
// huddle" and the box offered Draft with AI, each a control that couldn't
// run; an announcement channel said only "moderators" post there, a role
// OneCamp doesn't have. Now the DM offers what can run, the box offers no
// AI, and the notice names channel admins. With SHOTS_DIR=<dir> each is saved.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }

async function openEmptyDm(browser: Browser, testInfo: TestInfo, view: View, scheme: string) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme === "dark" ? "dark" : "light",
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const tab = await context.newPage()
  await stubBackend(tab, testInfo, {
    "/command/catalog": { msg: "ok", data: { commands: [] } },
    "/message/scheduled": { msg: "ok", data: [] },
    "/user/notificationStatus": { msg: "ok", data: {} },
    "/ai/voice-input": { msg: "ok", data: {} },
    "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
    "/dm/publishChatTyping": { msg: "ok" },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [], has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  })
  await tab.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return tab
}

for (const view of VIEWS) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme} (calls and AI off): an empty DM offers no huddle, and the box no Draft with AI`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const tab = await openEmptyDm(browser, testInfo, view, scheme)
      await expect(tab.getByRole("button", { name: "Say hello to Maya" })).toBeVisible({ timeout: 90_000 })
      await expect(tab.getByRole("button", { name: "Start a huddle" })).toHaveCount(0)
      if (view.phone) {
        // The phone bar's huddle is drawn from a chunk of its own, so "none" is read only once the bar has settled:
        // the title says where Maya is (her profile is in, the gate's input), ⋯ is there, and no 44px slot is held.
        await expect(tab.getByRole("button", { name: "Maya Chen, profile" })).toContainText(/Active|Away|Offline/)
        await expect(tab.getByRole("button", { name: "Chat options" })).toBeVisible()
        await expect(tab.locator('[data-phone-bar-end] span[aria-hidden="true"].size-11:empty')).toHaveCount(0, { timeout: 30_000 })
        await expect(tab.getByRole("link", { name: "Start a huddle" })).toHaveCount(0)
      }
      // The bar's huddle is a link (a phone's moss circle, a computer's header): none without a call server.
      await expect(tab.getByRole("link", { name: /huddle/i })).toHaveCount(0)
      await tidy(tab)
      await reviewShot(tab, "honest-empty-dm", scheme)

      if (view.phone) {
        const field = tab.locator("[data-phone-composer] [contenteditable='true']")
        await field.click()
        await expect(tab.locator("[data-phone-tools]")).toBeVisible()
        await expect(tab.getByRole("button", { name: "Mention someone" })).toBeVisible()
        await expect(tab.getByRole("button", { name: "Draft with AI" })).toHaveCount(0)
        await reviewShot(tab, "honest-phone-strip", scheme)
      }
      await tab.getByRole("button", { name: "Add to the message" }).last().click()
      await expect(tab.getByRole("menuitem", { name: /Create a task/ })).toBeVisible()
      await expect(tab.getByRole("menuitem", { name: /Draft with AI/ })).toHaveCount(0)
      await reviewShot(tab, "honest-plus-menu", scheme)
      await tab.context().close()
    })

    test(`at ${view.name}, ${scheme}: an announcement channel says only channel admins post there`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const tab = await openChannel(browser, testInfo, view, scheme, () => ({
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: { ...channel, ch_post_policy: "admins_only", ch_is_admin: 0 } },
      }))
      await expect(tab.getByText("Only channel admins can post here.")).toBeVisible({ timeout: 60_000 })
      await expect(tab.getByText(/moderators/i)).toHaveCount(0)
      await reviewShot(tab, "honest-announcement", scheme)
      await tab.context().close()
    })
  }
}
