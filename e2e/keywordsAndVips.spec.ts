import { expect, test } from "@playwright/test"
import { SAM, reviewShot, stubBackend, tidy } from "./stubbedApp"
import { busySpinnerBox } from "./controlLook"
import { expectTouchSize } from "./touchTarget"

// Keywords and VIPs (chat P3 stage 3), in a real browser with no backend: a
// channel post from someone else marks the reader's keyword (and only as a
// whole word), their own post marks nothing; Settings, Notifications keeps the
// keywords as chips and the VIPs as people, each saving at once. A word the
// server refuses blocks no later word and offers only letting it go (CR-345).
// With SHOTS=<dir> (SHOTS_DIR for the review shots) each is saved at 1280 and
// 390, light and dark.

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

/** The server's words for a keyword it refuses (business/PersonalAlert). */
const REFUSED = "A keyword is 2 to 64 characters."

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
          email_task_assigned: true, email_task_status: true, email_comments: true, email_calls: true,
          email_calendar_invites: true, email_calendar_changes: true, email_calendar_answers: true, email_channel_invites: true,
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
      // V-703: the PUT is held, so the new word's chip says Saving until the
      // server answers, then reads as any other kept word.
      let answer!: () => void
      const answered = new Promise<void>((r) => (answer = r))
      await tab.route("**/me/keywords", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback()
        await answered
        await route.fulfill({ json: { msg: "ok", data: ["budget", "Q4 plan", "launch"] } })
      })
      await card.getByLabel("Keywords", { exact: true }).fill("launch")
      await card.getByLabel("Keywords", { exact: true }).press("Enter")
      const chip = card.getByRole("listitem").filter({ has: tab.getByRole("button", { name: "Remove keyword launch" }) })
      await expect(chip).toContainText("Saving")
      await expect.poll(() => puts.length).toBeGreaterThan(0)
      await reviewShot(tab, "keywords-saving", scheme)
      answer()
      await expect(chip).not.toContainText("Saving")
      await expect(chip).not.toContainText("Not saved")
      expect(puts).toContainEqual({ path: "/me/keywords", body: { keywords: ["budget", "Q4 plan", "launch"] } })
      if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/keywords-settings-${view.name}-${scheme}.png` })
      await context.close()
    })

    // CR-345: a refused word (a 4xx) would be refused again, so it offers no
    // Try again: its reason stays beside it, a later word saves without it,
    // and its X, the only way to let it go, is a finger's 44 px on a phone.
    // A one-letter word, under the server's floor, never leaves the page.
    test(`at ${view.name}, ${scheme}: a refused keyword blocks no later word and offers only letting it go`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      await stubBackend(tab, testInfo, COMMON)
      const puts: unknown[] = []
      await tab.route("**/me/keywords", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback()
        const body = route.request().postDataJSON() as { keywords: string[] }
        puts.push(body)
        if (puts.length === 1) return route.fulfill({ status: 400, json: { msg: REFUSED } })
        await route.fulfill({ json: { msg: "ok", data: body.keywords } })
      })
      await tab.goto("/app/settings/notifications#notifications-keywords", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const card = tab.locator("#notifications-keywords")
      await expect(card.getByText("Maya Chen")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await card.scrollIntoViewIfNeeded()
      const field = card.getByLabel("Keywords", { exact: true })
      const chipOf = (word: string) => card.getByRole("listitem").filter({ has: tab.getByRole("button", { name: `Remove keyword ${word}` }) })

      await field.fill("a")
      await expect(card.getByRole("button", { name: "Add keyword" })).toBeDisabled()
      await field.press("Enter")
      await field.fill("launch")
      await field.press("Enter")
      await expect(chipOf("launch")).toContainText("Not saved")
      await expect(card.getByText(REFUSED, { exact: true })).toBeVisible()
      await expect(card.getByRole("button", { name: "Try again" })).toHaveCount(0)

      await field.fill("sprint")
      await field.press("Enter")
      await expect.poll(() => puts.length).toBe(2)
      expect(puts[1]).toEqual({ keywords: ["budget", "Q4 plan", "sprint"] })
      await expect(chipOf("sprint")).not.toContainText(/Saving|Not saved/)
      await expect(chipOf("launch")).toContainText("Not saved")
      await expect(card.getByText(REFUSED, { exact: true })).toBeVisible()
      await expect(card.getByRole("button", { name: "Try again" })).toHaveCount(0)
      await reviewShot(tab, "keywords-refused", scheme)

      const letGo = card.getByRole("button", { name: "Remove keyword launch" })
      if (view.phone) {
        // The X draws 20 px; its reach is extend-touch-target's ::after.
        const reach = (await busySpinnerBox(letGo))?.spinner
        expectTouchSize(reach?.width, "a Not saved chip's remove, across")
        expectTouchSize(reach?.height, "a Not saved chip's remove, down")
        await letGo.tap()
      } else {
        await letGo.click()
      }
      await expect(chipOf("launch")).toHaveCount(0)
      await expect(card.getByText(REFUSED, { exact: true })).toHaveCount(0)
      expect(puts).toHaveLength(2)
      await context.close()
    })
  }
}
