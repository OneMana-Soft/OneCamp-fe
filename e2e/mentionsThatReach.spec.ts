import { expect, test, type Page } from "@playwright/test"
import { expectReachable } from "./menuReach"
import { SAM, stubBackend } from "./stubbedApp"

// Mentions that reach (chat P3), in a real browser with no backend: the "@"
// list in #launch in D-M9's order (this channel's people, recent first; your
// team; someone not in it; the broadcasts; you last), inside the window with
// every row in reach, a message with a room's
// and a team's chips, the question a broadcast asks first, and the channel's
// "Allow @here and @channel". With SHOTS=<dir> each is saved at 1280 and 390,
// light and dark.

async function tidy(tab: Page) {
  for (let i = 0; i < 2; i++) {
    const gotIt = tab.getByRole("button", { name: "Got it" }).first()
    if (!(await gotIt.isVisible().catch(() => false))) break
    await gotIt.click().catch(() => {})
  }
}

const person = (n: string, user_name: string, extra: object = {}) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "", ...extra })
const MAYA = person("6f", "Maya Chen")
const JONAS = person("70", "Jonas Weber")
const ADA = person("71", "Ada Okafor")
const PRIYA = person("72", "Priya Shah")
const ME = { ...SAM, uid: "0x99", user_name: "Sam Rivera" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const DESIGN = "7e000000-0000-4000-8000-0000000000d1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 18, h, m)).toISOString()
const channel = { ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 42, ch_recording: [] }
const chip = (id: string, label: string) => `<span class="mention" data-id="${id}" data-label="${label}" data-type="mention">@${label}</span>`
const post = (n: number, by: object, html: string, h: number, m: number) => ({
  post_uuid: `0c4a0000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`, post_text: html, post_by: by, post_created_at: at(h, m),
  post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [],
})
const POSTS = [
  post(1, MAYA, `<p>${chip("broadcast:channel", "channel")} the launch moved to 10:30. ${chip(`group:${DESIGN}`, "design")} the banner needs the new date.</p>`, 9, 0),
  post(2, JONAS, "<p>On it. Staging is green.</p>", 9, 5),
]
const MENTIONABLES = {
  me: SAM.user_uuid, name: "launch", count: 4, members: [SAM.user_uuid, MAYA.user_uuid, JONAS.user_uuid, ADA.user_uuid],
  recent: [JONAS.user_uuid, MAYA.user_uuid], teams: [{ team_uuid: DESIGN, name: "design", members: 5, here: 2 }],
  broadcasts: [{ name: "here", count: 0 }, { name: "channel", count: 41 }], zones: { [ADA.user_uuid]: "Pacific/Auckland" },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: the @ list reaches rooms and teams, and a broadcast asks first`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() === 404 && new URL(r.url()).pathname !== "/") console.log(`PROBE 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      await stubBackend(tab, testInfo, {
        "/command/catalog": { msg: "ok", data: { commands: [] } },
        "/message/scheduled": { msg: "ok", data: [] },
        "/user/notificationStatus": { msg: "ok", data: {} },
        "/ai/voice-input": { msg: "ok", data: {} },
        "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
        "/ch/getFile": { msg: "ok", data: [] },
        "/ch/markSeen": { msg: "ok" },
        "/activity/seen": { msg: "ok" },
        "/user/botKinds": { msg: "ok", data: {} },
        "/ch/publishChannelTyping": { msg: "ok" },
        "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
        "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS, ADA, PRIYA] },
        [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
        [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [...POSTS].reverse(), has_more: false } },
        "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
        [`/conversations/channel/${LAUNCH}/mentionables`]: { msg: "ok", data: MENTIONABLES },
        [`/conversations/channel/${LAUNCH}/broadcasts`]: { msg: "ok", data: { may: true, members: 42, confirm_at: 6, reach: { channel: 41, here: 3 }, members_may: true, own: false, manages: true } },
      })
      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("the launch moved to 10:30")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      // The room's chip and the team's are their own.
      await expect(tab.locator(".mention-room").first()).toBeVisible()
      await expect(tab.locator(".mention-team").first()).toBeVisible()
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/reach-chips-${view.name}-${scheme}.png` })

      // The @ list: Jonas and Maya (recent), Ada, your team, Priya "Not in #launch", the broadcasts.
      const box = tab.locator('[contenteditable="true"]').last()
      await box.click()
      await box.pressSequentially("@")
      const list = tab.locator("[data-mention-list]")
      await expect(list.getByText("Not in #launch")).toBeVisible({ timeout: 30_000 })
      await expect(list.getByText("design")).toBeVisible()
      await expect(list.getByText("@channel")).toBeVisible()
      // All of it in the window: on 19 Oct it flipped above the composer. From
      // 21 Oct it opened below the "@", off the window with only People's first
      // row in sight, while toBeVisible passed: it was placed before its rows
      // had loaded, and never again.
      await expect(list, "the @ list sits inside the window").toBeInViewport({ ratio: 1 })
      await tab.waitForTimeout(500)
      // It opens on its first row, lit, so Enter picks it.
      await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
      console.log(`CURSOR ${await list.locator("[data-menu-cursor]").count()} ${await list.locator("[data-menu-cursor]").first().getAttribute("style").catch(() => "none")}`)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/reach-list-${view.name}-${scheme}.png` })
      // Every group's rows can be seen and pressed, each scrolled to in the list.
      for (const row of await list.getByRole("option").all()) {
        await row.scrollIntoViewIfNeeded()
        await expectReachable(row)
      }

      // @channel, then Send: the question names how many it notifies.
      await box.pressSequentially("chan")
      await list.getByText("@channel").click()
      await box.pressSequentially(" ship it")
      await box.press("Enter")
      if (view.phone) await tab.getByRole("button", { name: "Send" }).last().click().catch(() => {})
      await expect(tab.getByText("Notify 41 people?")).toBeVisible({ timeout: 30_000 })
      await tab.waitForTimeout(400)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/reach-confirm-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}
