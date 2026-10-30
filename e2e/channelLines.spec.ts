import { expect, test } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// A channel's history says what happened to it (chat B28), in a real browser
// with no backend: three joins within minutes read as one line, a rename and a
// topic as their own, and the messages between them as messages. With
// SHOTS=<dir> each view is saved at 1280 and 390, light and dark.

const person = (n: string, user_name: string) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "" })
const MAYA = person("6f", "Maya Chen")
const JONAS = person("70", "Jonas Weber")
const ADA = person("71", "Ada Okafor")
const ME = { ...SAM, uid: "0x99", user_name: "Sam Rivera" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f2"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 19, h, m)).toISOString()
const channel = { ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "Ship on Friday", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 8, ch_recording: [] }
let n = 0
const id = () => `0c4a0000-0000-4000-8000-0000000003${String(++n).padStart(2, "0")}`
const base = { post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [] }
const message = (by: object, html: string, h: number, m: number) => ({ ...base, post_uuid: id(), post_text: html, post_by: by, post_created_at: at(h, m) })
const line = (by: { user_uuid: string }, kind: string, text: string, h: number, m: number, facts: object = {}) => ({
  ...base, post_uuid: id(), post_text: `<p>${text}</p>`, post_by: by, post_created_at: at(h, m),
  post_kind: "system", post_system: JSON.stringify({ kind, actor: by.user_uuid, ...facts }),
})
const POSTS = [
  message(MAYA, "<p>Morning all, the launch channel is open.</p>", 9, 0),
  line(JONAS, "channel.joined", "Jonas Weber joined.", 9, 2),
  line(ADA, "channel.joined", "Ada Okafor joined.", 9, 4),
  line(ME, "channel.joined", "Sam Rivera joined.", 9, 9),
  line(MAYA, "channel.renamed", "Maya Chen renamed the channel to #launch (was #q4-launch).", 9, 20, { name: "launch", from: "q4-launch" }),
  line(MAYA, "channel.topic", "Maya Chen set the topic: Ship on Friday", 9, 21, { name: "Ship on Friday" }),
  message(JONAS, "<p>Staging is green.</p>", 9, 30),
]

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a channel's history says who joined and what changed`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() >= 400 && new URL(r.url()).pathname !== "/") console.log(`PROBE ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      tab.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`))
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
        "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS, ADA] },
        [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
        [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [...POSTS].reverse(), has_more: false } },
        "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
      })
      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Staging is green.")).toBeVisible({ timeout: 150_000 })
      await tidy(tab)
      // The three joins, minutes apart, are one line; the rename and the topic their own.
      await expect(tab.getByText("Jonas Weber, Ada Okafor and Sam Rivera joined.")).toBeVisible()
      await expect(tab.getByText("Ada Okafor joined.", { exact: true })).toHaveCount(0)
      await expect(tab.getByText("Maya Chen renamed the channel to #launch (was #q4-launch).")).toBeVisible()
      await expect(tab.getByText("Maya Chen set the topic: Ship on Friday")).toBeVisible()
      await tab.waitForTimeout(400)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/lines-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}
