import { expect, test } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// Keywords and VIPs (chat P3 stage 3), in a real browser with no backend: a
// channel post from someone else marks the reader's keyword (and only as a
// whole word), their own post marks nothing; Settings, Notifications keeps the
// keywords as chips and the VIPs as people, each saving at once. With
// SHOTS=<dir> each is saved at 1280 and 390, light and dark.

const person = (n: string, user_name: string) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "" })
const MAYA = person("6f", "Maya Chen")
const JONAS = person("70", "Jonas Weber")
const ME = { ...SAM, uid: "0x99", user_name: "Sam Rivera" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 18, h, m)).toISOString()
const channel = { ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 12, ch_recording: [] }
const post = (n: number, by: object, html: string, h: number, m: number) => ({
  post_uuid: `0c4a0000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`, post_text: html, post_by: by, post_created_at: at(h, m),
  post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [],
})
const POSTS = [
  post(1, MAYA, "<p>The Q4 plan is in. The budget review moves to Thursday, so the launch budget needs a last look.</p>", 9, 0),
  post(2, JONAS, "<p>Budgetary notes are in the doc.</p>", 9, 4),
  post(3, ME, "<p>I'll take the budget.</p>", 9, 6),
]

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

const COMMON = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/activity/seen": { msg: "ok" },
  "/user/botKinds": { msg: "ok", data: {} },
  "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
  "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
  "/me/keywords": { msg: "ok", data: ["budget", "Q4 plan"] },
  "/me/vips": { msg: "ok", data: [{ uuid: MAYA.user_uuid, name: "Maya Chen" }] },
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: your keywords are marked in a channel's posts, and kept in Settings`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() === 404 && new URL(r.url()).pathname !== "/") console.log(`PROBE 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      const puts: { path: string; body: unknown }[] = []
      tab.on("request", (r) => {
        const path = new URL(r.url()).pathname
        if (r.method() === "PUT" && path.startsWith("/me/")) puts.push({ path, body: r.postDataJSON() })
      })
      await stubBackend(tab, testInfo, {
        ...COMMON,
        "/ch/getFile": { msg: "ok", data: [] },
        "/ch/markSeen": { msg: "ok" },
        "/ch/publishChannelTyping": { msg: "ok" },
        [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
        [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [...POSTS].reverse(), has_more: false } },
        "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
        "/user/notificationPreferences": { msg: "ok", data: { email_supported: true, email_enabled: true, email_mentions: true, email_dms: true,
          email_task_assigned: true, email_task_status: true, email_comments: true, email_calls: true, email_channel_invites: true,
          email_only_when_offline: true, email_digest_frequency: "off", quiet_hours_enabled: false, quiet_hours_start: null, quiet_hours_end: null,
          quiet_hours_tz: null, read_receipts: true, read_receipts_allowed: true } },
        "/user/searchUserAndChannel": [{ user_uuid: JONAS.user_uuid, user_name: "Jonas Weber", user_full_name: "Jonas Weber" }],
      })

      // The channel: Maya's post marks "Q4 plan" and both "budget"s; Jonas's
      // "Budgetary" isn't the word; Sam's own post marks nothing.
      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("The Q4 plan is in.", { exact: false })).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      const marks = tab.locator("mark.keyword-hit")
      await expect(marks).toHaveCount(3)
      await expect(marks.nth(0)).toHaveText("Q4 plan")
      await expect(tab.getByText("I'll take the budget.").locator("mark")).toHaveCount(0)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/keywords-marked-${view.name}-${scheme}.png` })

      // Settings, Notifications: the card, then a keyword added.
      await tab.goto("/app/settings/notifications#notifications-keywords", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const card = tab.locator("#notifications-keywords")
      await expect(card.getByText("Keywords and VIPs")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await expect(card.getByText("Maya Chen")).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      await tab.route("**/me/keywords", (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ json: { msg: "ok", data: ["budget", "Q4 plan", "launch"] } })
          : route.fallback(),
      )
      await card.getByLabel("Keywords", { exact: true }).fill("launch")
      await card.getByLabel("Keywords", { exact: true }).press("Enter")
      await expect(card.getByRole("button", { name: "Remove keyword launch" })).toBeVisible()
      expect(puts).toContainEqual({ path: "/me/keywords", body: { keywords: ["budget", "Q4 plan", "launch"] } })
      if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/keywords-settings-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}
