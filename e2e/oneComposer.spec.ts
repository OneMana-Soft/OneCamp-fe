import { expect, test, type Page } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// One message box for a channel, a DM and a group (chat A1 step 2c), in a
// real browser with no backend, at 1280 and at 390 with touch, light and
// dark. In each, what's typed stays in the box, and a file picked with
// Attach goes up for that conversation and sits in its box. With SHOTS=<dir>
// each box is saved holding its words and its file.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const JONAS = { user_uuid: "6c2e8d3f-9a4b-4e7c-8f1d-2b3c4d5e6f70", user_name: "jonas", user_full_name: "Jonas Berg", user_email_id: "jonas@example.com" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000002c1"
const GROUP = "0c4a0000-0000-4000-8000-0000000002c2"
const at = (m: number) => new Date(Date.UTC(2026, 9, 23, 9, m)).toISOString()
const channel = {
  ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "Ship on Friday", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [],
}
const post = { post_uuid: "0c4a0000-0000-4000-8000-0000000002d1", post_text: "<p>The launch checklist is pinned.</p>", post_by: MAYA, post_created_at: at(1),
  post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [] }
const chat = (n: number, by: typeof MAYA, text: string) => ({
  chat_uuid: `0c4a0000-0000-4000-8000-0000000002e${n}`, chat_from: by, chat_to: SAM, chat_created_at: at(n), chat_attachments: [], chat_comment_count: 0,
  chat_body_text: `<p>${text}</p>`, chat_reactions: [],
})
const page = (chats: ReturnType<typeof chat>[]) => ({ msg: "ok", data: { chats, has_more: false } })

const conversations = [
  { kind: "channel", url: `/app/channel/${LAUNCH}`, seen: "The launch checklist is pinned." },
  { kind: "DM", url: `/app/chat/${MAYA.user_uuid}`, seen: "Is the checklist done?" },
  { kind: "group", url: `/app/chat/group/${GROUP}`, seen: "Friday at 10 works for us." },
] as const

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

async function answer(tab: Page, testInfo: Parameters<typeof stubBackend>[1], uploads: string[]) {
  await stubBackend(tab, testInfo, {
    "/command/catalog": { msg: "ok", data: { commands: [] } },
    "/message/scheduled": { msg: "ok", data: [] },
    "/user/notificationStatus": { msg: "ok", data: {} },
    "/ai/voice-input": { msg: "ok", data: {} },
    "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
    "/activity/seen": { msg: "ok" },
    "/ch/markSeen": { msg: "ok" },
    "/ch/publishChannelTyping": { msg: "ok" },
    "/dm/publishChatTyping": { msg: "ok" },
    "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
    "/user/allUsers": { msg: "ok", users: [SAM, MAYA, JONAS] },
    [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
    [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
    [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [post], has_more: false } },
    "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: page([chat(2, MAYA, "Is the checklist done?")]),
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    [`/groupChat/getDmParticipants/${GROUP}`]: { msg: "ok", data: { dm_grouping_id: GROUP, dm_participants: [SAM, MAYA, JONAS], dm_unread: 0, dm_notification_type: "all", dm_recording: [] } },
    [`/groupChat/latestChat/${GROUP}`]: page([chat(3, JONAS, "Friday at 10 works for us.")]),
    "/uploadFile": (_url: URL, request: { postData: () => string | null }) => {
      uploads.push(request.postData() ?? "")
      return { msg: "ok", object_uuid: "0c4a0000-0000-4000-8000-0000000002f1" }
    },
  })
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    for (const c of conversations) {
      test(`at ${view.name}, ${scheme}: a ${c.kind}'s box keeps its words and takes a file for its conversation`, async ({ browser }, testInfo) => {
        test.setTimeout(150_000)
        const context = await browser.newContext({
          baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
          ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
        })
        const tab = await context.newPage()
        const uploads: string[] = []
        await answer(tab, testInfo, uploads)
        await tab.goto(c.url, { waitUntil: "domcontentloaded", timeout: 120_000 })
        // In its message: at 1280 the conversation list beside it shows the same words as its preview.
        await expect(tab.locator("[data-message-row]").getByText(c.seen)).toBeVisible({ timeout: 60_000 })

        const box = view.phone ? tab.locator("[data-phone-composer] [contenteditable='true']") : tab.locator("[contenteditable='true']").last()
        await expect(box).toBeVisible()
        await box.click()
        await tab.keyboard.type("Shipping notes attached")
        await expect(box).toContainText("Shipping notes attached")

        // The box's own picker: there is exactly one on the page, and what it takes goes up for this conversation.
        const pickers = tab.locator('input[type="file"][multiple]')
        await expect(pickers).toHaveCount(1)
        await pickers.setInputFiles({ name: "release-notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 notes") })
        await expect.poll(() => uploads.length).toBe(1)
        const pair = [SAM.user_uuid, MAYA.user_uuid].sort().join(" ")
        const key = c.kind === "channel" ? `"src_key":"channel","src_value":"${LAUNCH}"` : c.kind === "DM" ? `"src_key":"chat","src_value":"${pair}"` : `"src_key":"grpChat","src_value":"${GROUP}"`
        expect(uploads[0]).toContain(key)
        await expect(tab.getByText("release-notes.pdf")).toBeVisible()
        await expect(box).toContainText("Shipping notes attached")

        if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/composer-${c.kind}-${view.name}-${scheme}.png` })
        await context.close()
      })
    }
  }
}
