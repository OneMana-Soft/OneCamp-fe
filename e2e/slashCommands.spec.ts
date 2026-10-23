import { expect, test, type Page, type Request } from "@playwright/test"
import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// From 12 Oct to 23 Oct no message box's "/" menu offered a single command,
// only formatting (the owner: "the slash command dont give giphy option ...
// it only give text formatting option"). In a real browser with no backend:
// in a channel, a DM and a group, on a computer and a phone, and in a
// thread's reply on a computer, "/" offers the conversation's commands
// (built-ins, Giphy, and an installed app's own), and one typed or picked
// there runs in that conversation. With SHOTS_DIR=<dir> the menu is saved at
// 1280 and 390, light and dark.

async function tidy(tab: Page) {
  for (let i = 0; i < 2; i++) {
    const gotIt = tab.getByRole("button", { name: "Got it" }).first()
    if (!(await gotIt.isVisible().catch(() => false))) break
    await gotIt.click().catch(() => {})
  }
}

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const JONAS = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const CREW = "0c4a0000-0000-4000-8000-0000000000f2"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 23, h, m)).toISOString()
const id = (n: number) => `0c4a0000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`

// The conversation's catalog: built-ins, Giphy, and an installed app's own command.
const CATALOG = [
  { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
  { command: "poll", description: "Create a quick poll", usage_hint: '"Question?" "Option 1" "Option 2"', is_builtin: true },
  { command: "remind", description: "Set a reminder for yourself, a person, or a channel", usage_hint: "[me|@who|#channel] <what> <when>", is_builtin: true },
  { command: "standup", description: "Post your standup", usage_hint: "<notes>", app_name: "Standup", app_slug: "standup", is_builtin: false },
]

const channel = {
  ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [],
}
const reply = (n: number, by: object, text: string, m: number) => ({
  comment_uuid: id(n), comment_created_at: at(9, m), comment_by: by, comment_text: `<p>${text}</p>`, comment_reactions: [], comment_attachments: [],
})
const ROOT = {
  post_uuid: id(1), post_text: "<p>Launch moved to 10:30.</p>", post_by: MAYA, post_created_at: at(9, 0),
  post_attachments: [], post_reactions: [], post_comment_count: 1, post_comments: [reply(11, JONAS, "Banner updated.", 5)],
}
const chat = (n: number, by: object, text: string, m: number) => ({
  chat_uuid: id(n), chat_from: by, chat_to: SAM, chat_created_at: at(9, m), chat_attachments: [],
  chat_comment_count: 0, chat_comments: [], chat_body_text: `<p>${text}</p>`, chat_reactions: [],
})

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

type Ran = { command: string; text: string; channel_id?: string; dm_group_id?: string }

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: "/" offers the conversation's commands, and they run there`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() === 404 && new URL(r.url()).pathname !== "/") console.log(`PROBE 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      const ran: Ran[] = []
      await stubBackend(tab, testInfo, {
        "/command/catalog": { msg: "ok", data: { commands: CATALOG } },
        "/command/execute": (_url: URL, request: Request) => {
          const req = request.postDataJSON() as Ran
          ran.push(req)
          return { msg: "ok", data: { response_type: "ephemeral", text: `Ran /${req.command} here` } }
        },
        "/message/scheduled": { msg: "ok", data: [] },
        "/user/notificationStatus": { msg: "ok", data: {} },
        "/ai/voice-input": { msg: "ok", data: {} },
        "/ch/getFile": { msg: "ok", data: [] },
        "/ch/markSeen": { msg: "ok" },
        "/activity/seen": { msg: "ok" },
        "/user/botKinds": { msg: "ok", data: {} },
        "/ch/publishChannelTyping": { msg: "ok" },
        "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
        "/user/allUsers": { msg: "ok", users: [SAM, MAYA, JONAS] },
        [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
        [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [ROOT], has_more: false } },
        [`/po/allComments/${ROOT.post_uuid}`]: { msg: "ok", data: { ...ROOT, post_channel: { ch_uuid: LAUNCH, ch_name: "launch" } } },
        [`/chat-threads/${ROOT.post_uuid}/follow`]: { msg: "ok", data: { root: ROOT.post_uuid, following: false, follow: "auto" } },
        [`/chat-threads/${ROOT.post_uuid}/read`]: { msg: "ok", data: { root: ROOT.post_uuid, read: true } },
        "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { has_more: false, chats: [chat(21, MAYA, "Can you check the banner?", 10)] } },
        "/dm/": { msg: "ok", data: [] },
        "/user/dm-ai-suggestions": { msg: "ok", data: [] },
        [`/groupChat/getDmParticipants/${CREW}`]: { msg: "ok", data: { dm_grouping_id: CREW, dm_participants: [SAM, MAYA, JONAS], dm_unread: 0, dm_notification_type: "all" } },
        [`/groupChat/latestChat/${CREW}`]: { msg: "ok", data: { has_more: false, chats: [chat(31, JONAS, "Standup at 9:30 tomorrow.", 20)] } },
        "/groupChat/": { msg: "ok", data: [] },
      })

      // "/" in the box: the commands lead, the installed app's among them.
      const offers = async (box: ReturnType<Page["locator"]>, shot: string) => {
        await box.click()
        await box.pressSequentially("/")
        const menu = tab.locator("[data-slash-menu]").last()
        await expect(menu.getByRole("listbox")).toHaveAttribute("aria-label", "Commands", { timeout: 30_000 })
        for (const c of ["/giphy", "/poll", "/remind", "/standup"]) await expect(menu.getByText(c, { exact: false }).first()).toBeVisible()
        await expect(menu.getByText("Standup", { exact: false }).first()).toBeVisible()
        await tidy(tab)
        await reviewShot(tab, shot, scheme)
        await box.press("Escape")
        await box.press("Backspace")
        return menu
      }
      // A command typed and sent: it runs in this conversation, and its answer shows here.
      const runs = async (box: ReturnType<Page["locator"]>, typed: string, command: string, where: Partial<Ran>) => {
        await box.click()
        await box.pressSequentially(typed)
        if (view.phone) await tab.getByRole("button", { name: "Send" }).last().click()
        else await box.press("Enter")
        await expect.poll(() => ran.filter((r) => r.command === command).length, { timeout: 30_000 }).toBe(1)
        expect(ran.find((r) => r.command === command)).toMatchObject(where)
        await expect(tab.getByText(`Ran /${command} here`).first()).toBeVisible({ timeout: 30_000 })
      }

      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Launch moved to 10:30.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      let box = tab.locator('[contenteditable="true"]').last()
      const menu = await offers(box, "slash-channel")
      // Picked from the menu: /poll waits for its question, then runs here.
      await box.click()
      await box.pressSequentially("/pol")
      await menu.getByRole("option", { name: /\/poll/ }).first().click()
      await expect(box).toContainText("/poll")
      await runs(box, '"Lunch?" "Yes" "No"', "poll", { channel_id: LAUNCH })

      await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Can you check the banner?")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      box = tab.locator('[contenteditable="true"]').last()
      await offers(box, "slash-dm")
      await runs(box, "/remind me to stretch in 10 minutes", "remind", {})
      expect(ran.find((r) => r.command === "remind")?.dm_group_id).toContain(MAYA.user_uuid)

      await tab.goto(`/app/chat/group/${CREW}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Standup at 9:30 tomorrow.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      box = tab.locator('[contenteditable="true"]').last()
      await offers(box, "slash-group")
      await runs(box, "/standup shipped the banner", "standup", { dm_group_id: CREW })

      if (!view.phone) {
        // A thread's reply, beside its channel: its commands are the channel's.
        await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await tab.getByText("1 reply").first().click()
        const panel = tab.locator("[data-right-panel]")
        await expect(panel.getByText("Banner updated.")).toBeVisible({ timeout: 30_000 })
        box = panel.locator('[contenteditable="true"]').last()
        await offers(box, "slash-thread")
        await runs(box, "/giphy launch", "giphy", { channel_id: LAUNCH })
      }
      await context.close()
    })
  }
}
