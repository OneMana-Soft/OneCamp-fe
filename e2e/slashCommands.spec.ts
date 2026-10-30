import { expect, test, type Browser, type Page, type Request, type TestInfo } from "@playwright/test"
import { SAM, reviewShot, stubBackend, tidy } from "./stubbedApp"
import { expectReachable } from "./menuReach"
import { GIF, giphyCard, serveGif } from "./giphyCard"

// From 12 Oct to 23 Oct no message box's "/" menu offered a single command,
// only formatting (the owner: "the slash command dont give giphy option ...
// it only give text formatting option"). In a real browser with no backend:
// in a channel, a DM and a group, and in a thread's reply, on a computer and
// a phone, "/" offers the conversation's commands (built-ins, Giphy, and an
// installed app's own), and one typed or picked there runs in that
// conversation, a reply's in its thread. A thread's reply box has its own
// commands: a phone's thread is its own page, and a computer's can be open
// beside the Inbox, each with no conversation view under it. Giphy's card
// Send posts the GIF from the box it was asked in, through that box's own send
// path, and the card goes (it only filled the box until 23 Oct); with words
// already in the box, the GIF joins them there. With SHOTS_DIR=<dir> the menu,
// the card, a sent GIF and a joined one are saved at 1280 and 390, light and dark.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const JONAS = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const CREW = "0c4a0000-0000-4000-8000-0000000000f2"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 23, h, m)).toISOString()
const id = (n: number) => `0c4a0000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`

// The conversation's catalog: built-ins, Giphy, and an installed app's own command.
// Where each box's own send path creates its message.
const CREATED = ["/po/createPost", "/dm/createChat", "/groupChat/createChat", "/po/createComment", "/dm/createComment"]

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
const DM_ROOT = chat(21, MAYA, "Can you check the banner?", 10)
const GROUP_ROOT = chat(31, JONAS, "Standup at 9:30 tomorrow.", 20)
// Sam's DM with Maya, as the app groups it (getGroupingId).
const DM = [SAM.user_uuid, MAYA.user_uuid].sort().join(" ")
// The #launch thread Sam follows, as the Inbox's Threads tab lists it.
const FOLLOWED = {
  root: ROOT.post_uuid, conversation: { kind: "channel", id: LAUNCH }, place: { name: "launch" },
  message: { html: ROOT.post_text, by: MAYA, created_at: at(9, 0) },
  replies: 1, new: 1, latest: [], last_reply_at: at(9, 5), unread: true, follow: "on",
}

/** Giphy in Admin › Apps' marketplace, as the server lists it before an admin sets its key. */
const GIPHY_APP = {
  slug: "giphy", name: "Giphy", description: "Search and send GIFs right from the composer with /giphy.", category: "Fun", kind: "builtin", featured: true,
  commands: ["giphy"], setup: [{ key: "api_key", label: "Giphy API key", type: "secret", required: true }],
  installed: false, enabled: false, needs_setup: true, is_connected: false,
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

type Ran = { command: string; text: string; channel_id?: string; dm_group_id?: string; thread_ts?: string }

/** What the stubbed backend answers for these conversations; each command run goes into `ran`. */
const answers = (ran: Ran[]) => ({
  "/command/catalog": { msg: "ok", data: { commands: CATALOG } },
  "/command/execute": (_url: URL, request: Request) => {
    const req = request.postDataJSON() as Ran & { trigger_id: string }
    ran.push(req)
    if (req.command === "giphy") return { msg: "ok", data: giphyCard(req.trigger_id) }
    return { msg: "ok", data: { response_type: "ephemeral", text: `Ran /${req.command} here` } }
  },
  // The card's Send: the GIF, to post as the person's message in the card's place.
  "/command/interact": (_url: URL, request: Request) => {
    const { trigger_id } = request.postDataJSON() as { trigger_id: string }
    const post = { type: "post_message", payload: { html: `<p><img src="${GIF}" alt="launch"/></p>` } }
    return { msg: "ok", data: { response_type: "ephemeral", replace_original: true, trigger_id, client_action: post } }
  },
  "/po/createPost": { msg: "ok", data: { post_uuid: id(41), post_created_at: at(10, 0) } },
  "/dm/createChat": { msg: "ok", data: { chat_uuid: id(42), chat_created_at: at(10, 0) } },
  "/groupChat/createChat": { msg: "ok", data: { chat_uuid: id(43), chat_created_at: at(10, 0) } },
  "/po/createComment": { msg: "ok", data: { comment_id: id(44), comment_created_at: at(10, 0) } },
  "/dm/createComment": { msg: "ok", data: { comment_id: id(45), comment_created_at: at(10, 0) } },
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
  [`/chat-threads/${ROOT.post_uuid}/follow`]: { msg: "ok", data: { root: ROOT.post_uuid, following: true, follow: "on" } },
  [`/chat-threads/${ROOT.post_uuid}/read`]: { msg: "ok", data: { root: ROOT.post_uuid, read: true } },
  "/chat-threads/unread": { msg: "ok", data: { unread: 1 } },
  "/chat-threads": { msg: "ok", data: { threads: [FOLLOWED], unread: 1 } },
  "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/me/keywords": { msg: "ok", data: [] },
  "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
  [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { has_more: false, chats: [DM_ROOT] } },
  "/dm/": { msg: "ok", data: [] },
  "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  [`/groupChat/getDmParticipants/${CREW}`]: { msg: "ok", data: { dm_grouping_id: CREW, dm_participants: [SAM, MAYA, JONAS], dm_unread: 0, dm_notification_type: "all" } },
  [`/groupChat/latestChat/${CREW}`]: { msg: "ok", data: { has_more: false, chats: [GROUP_ROOT] } },
  "/groupChat/": { msg: "ok", data: [] },
  // A phone's thread pages: the message with what followed it, and its replies.
  [`/po/newPostsIncludingCurrent/${LAUNCH}/${ROOT.post_uuid}`]: { msg: "ok", data: { posts: [ROOT], has_more: false } },
  [`/dm/newChatsIncludingCurrentChat/${MAYA.user_uuid}/${DM_ROOT.chat_uuid}`]: { msg: "ok", data: { chats: [DM_ROOT], has_more: false } },
  [`/dm/chatWithAllComments/${DM_ROOT.chat_uuid}`]: { msg: "ok", data: DM_ROOT },
  [`/groupChat/newChatsIncludingCurrentChat/${CREW}/${GROUP_ROOT.chat_uuid}`]: { msg: "ok", data: { chats: [GROUP_ROOT], has_more: false } },
  [`/dm/chatWithAllComments/${GROUP_ROOT.chat_uuid}`]: { msg: "ok", data: GROUP_ROOT },
})

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: "/" offers the conversation's commands, and they run there`, async ({ browser }, testInfo) => {
      test.setTimeout(360_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() === 404 && new URL(r.url()).pathname !== "/") console.log(`PROBE 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      const ran: Ran[] = []
      const created: Array<{ path: string; body: unknown }> = []
      tab.on("request", (r) => {
        const path = new URL(r.url()).pathname
        if (r.method() === "POST" && CREATED.some((c) => path.endsWith(c))) created.push({ path, body: r.postDataJSON() })
      })
      await stubBackend(tab, testInfo, answers(ran))
      await serveGif(tab)

      // "/" in the box: the commands lead, the installed app's among them. A
      // conversation's commands can come after its box draws, and the menu
      // already open takes them in, so "/" is typed once: typing it again hid
      // a menu that never did (the owner, 23 Oct).
      const offers = async (box: ReturnType<Page["locator"]>, shot: string) => {
        await box.click()
        await box.pressSequentially("/")
        const menu = tab.locator("[data-slash-menu]").last()
        await expect(menu.getByRole("listbox")).toHaveAttribute("aria-label", "Commands", { timeout: 30_000 })
        for (const c of ["/giphy", "/poll", "/remind", "/standup"]) await expect(menu.getByText(c, { exact: false }).first()).toBeVisible()
        await expect(menu.getByText("Standup", { exact: false }).first()).toBeVisible()
        // Above the typed "/", clear of the box's own row. Placed while a phone's
        // box slid into place, it stayed about 21px low, over the "/", the emoji
        // and half of Send, on three of six phone thread pages (DESIGN-BUILD-10's WM1).
        const typed = box.locator("[data-decoration-id]").first()
        await expect.poll(async () => {
          const [m, t] = [await menu.boundingBox(), await typed.boundingBox()]
          return !!m && !!t && m.y + m.height <= t.y + 0.5
        }, { message: `the "/" menu sits above the typed "/" (${shot})` }).toBe(true)
        await tidy(tab)
        await reviewShot(tab, shot, scheme)
        await box.press("Escape")
        await box.press("Backspace")
        return menu
      }
      // A command typed and sent: it runs in this conversation (a reply's in its
      // thread, a conversation's in none), and its answer shows in `answered`.
      // Typed where the caret is, as a person goes on typing, never after another click:
      // ProseMirror counts clicks itself (within 500 ms, at one spot; a click in the menu
      // between them doesn't reset it), so a third quick click selected the box's line
      // and the arguments replaced the picked "/poll ", which posted as a plain message.
      const runs = async (box: ReturnType<Page["locator"]>, typed: string, command: string, where: Partial<Ran>, answered: Page | ReturnType<Page["locator"]> = tab) => {
        const before = ran.length
        await box.pressSequentially(typed)
        if (view.phone) await tab.getByRole("button", { name: "Send" }).last().click()
        else await box.press("Enter")
        await expect.poll(() => ran.length, { timeout: 30_000 }).toBe(before + 1)
        expect(ran[before]).toMatchObject({ command, ...where })
        expect(ran[before].thread_ts ?? "").toBe(where.thread_ts ?? "")
        const answer = answered.getByText(`Ran /${command} here`).first()
        await expect(answer).toBeVisible({ timeout: 30_000 })
        // In view as it comes, as a person reads it: on a phone the answers sat
        // scrolled out above the box (M1), where toBeVisible still passed.
        await expectReachable(answer)
      }
      // Giphy's card, then its Send: the GIF goes out from this box as the
      // person's message (through the box's own send path, at `endpoint`), and
      // the card goes.
      const sendsGif = async (box: ReturnType<Page["locator"]>, endpoint: string, where: Partial<Ran>, shot: string, answered: Page | ReturnType<Page["locator"]> = tab) => {
        const [runsBefore, createdBefore] = [ran.length, created.length]
        // Typed where the caret is, as runs() types.
        await box.pressSequentially("/giphy launch")
        if (view.phone) await tab.getByRole("button", { name: "Send" }).last().click()
        else await box.press("Enter")
        await expect.poll(() => ran.length, { timeout: 30_000 }).toBe(runsBefore + 1)
        expect(ran[runsBefore]).toMatchObject({ command: "giphy", ...where })
        // The card's Send has its word; the box's own Send is an icon.
        const send = answered.getByRole("button", { name: "Send", exact: true }).filter({ hasText: "Send" })
        await expect(send).toBeVisible({ timeout: 30_000 })
        await tidy(tab)
        // On screen as it comes, without scrolling: on a phone the card sat
        // scrolled out of sight above the box (DESIGN-BUILD-10's M1), while
        // toBeVisible passed and click() scrolled to it.
        await expectReachable(send)
        await reviewShot(tab, shot, scheme)
        await send.click()
        await expect.poll(() => created.length, { timeout: 30_000 }).toBe(createdBefore + 1)
        expect(created[createdBefore].path.endsWith(endpoint)).toBe(true)
        expect(JSON.stringify(created[createdBefore].body)).toContain(GIF)
        await expect(send).toHaveCount(0)
      }
      // Words already in the box: the card's Send puts the GIF with them there,
      // so nothing written is lost and nothing goes out unseen.
      const joinsGif = async (box: ReturnType<Page["locator"]>, shot: string) => {
        const createdBefore = created.length
        await box.pressSequentially("/giphy launch")
        if (view.phone) await tab.getByRole("button", { name: "Send" }).last().click()
        else await box.press("Enter")
        const send = tab.getByRole("button", { name: "Send", exact: true }).filter({ hasText: "Send" })
        await expect(send).toBeVisible({ timeout: 30_000 })
        await box.pressSequentially("Look at this")
        await send.click()
        await expect(send).toHaveCount(0)
        await expect(box.locator(`img[src^="${GIF}"]`)).toBeVisible()
        await expect(box).toContainText("Look at this")
        // The words and the whole GIF show in the box before anything goes:
        // a phone's box showed half the GIF, the words scrolled out above it.
        await expect(box.getByText("Look at this")).toBeInViewport({ ratio: 1 })
        await expect(box.locator(`img[src^="${GIF}"]`)).toBeInViewport({ ratio: 1 })
        expect(created.length).toBe(createdBefore)
        await tidy(tab)
        await reviewShot(tab, shot, scheme)
      }

      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // Each conversation's message itself: the list's row for a DM or group it
      // lacked repeats the newest message (fe3f22606), so a page-wide lookup finds two.
      await expect(tab.locator(`#msg-${ROOT.post_uuid}`).getByText("Launch moved to 10:30.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      let box = tab.locator('[contenteditable="true"]').last()
      const menu = await offers(box, "slash-channel")
      // Picked from the menu: /poll waits for its question, then runs here.
      await box.pressSequentially("/pol")
      await menu.getByRole("option", { name: /\/poll/ }).first().click()
      await expect(box).toContainText("/poll")
      // The pick hands the caret back to the box, so the question is typed straight on.
      await expect(box).toBeFocused()
      await runs(box, '"Lunch?" "Yes" "No"', "poll", { channel_id: LAUNCH })
      await sendsGif(box, "/po/createPost", { channel_id: LAUNCH }, "giphy-channel")
      // The GIF in the conversation, as Sam's message.
      const sent = tab.locator(`[data-message-viewport] img[src^="${GIF}"]`).first()
      await expect(sent).toBeVisible({ timeout: 30_000 })
      // Whole, and not drawn selected, once the card has gone and the picture
      // loaded: a sent GIF wore the box's orange selection outline, its foot
      // cut off, on a phone and a computer alike (DESIGN-BUILD-10's M3). And
      // what a finger meets just inside its foot is the picture, not the sheet.
      // Asked only once the picture has loaded: until then its frame holds a
      // shorter placeholder.
      await expect.poll(() => sent.evaluate((img: HTMLImageElement) => {
        if (!img.complete || !img.naturalWidth) return "still loading"
        const view = img.closest("[data-node-view-wrapper]") ?? img.parentElement!
        for (let el: HTMLElement | null = img; el && el !== view.parentElement; el = el.parentElement) {
          if (getComputedStyle(el).outlineStyle !== "none") return `drawn selected: ${el.outerHTML.slice(0, 80)}`
        }
        const r = img.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2)
        return hit && view.contains(hit) ? "the picture, whole" : `${hit?.outerHTML.slice(0, 60) ?? "nothing"} at the picture's foot (${Math.round(r.bottom)}px)`
      }), { timeout: 10_000 }).toBe("the picture, whole")
      await tidy(tab)
      await reviewShot(tab, "giphy-sent-channel", scheme)
      await joinsGif(box, "giphy-joined-channel")

      await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.locator(`#msg-${DM_ROOT.chat_uuid}`).getByText("Can you check the banner?")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      box = tab.locator('[contenteditable="true"]').last()
      await offers(box, "slash-dm")
      await runs(box, "/remind me to stretch in 10 minutes", "remind", { dm_group_id: DM })
      await sendsGif(box, "/dm/createChat", { dm_group_id: DM }, "giphy-dm")

      await tab.goto(`/app/chat/group/${CREW}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.locator(`#msg-${GROUP_ROOT.chat_uuid}`).getByText("Standup at 9:30 tomorrow.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      box = tab.locator('[contenteditable="true"]').last()
      await offers(box, "slash-group")
      await runs(box, "/standup shipped the banner", "standup", { dm_group_id: CREW })
      await sendsGif(box, "/groupChat/createChat", { dm_group_id: CREW }, "giphy-group")

      if (view.phone) {
        // A phone's thread is its own page, with no conversation view under it.
        const threads = [
          { url: `/app/channel/${LAUNCH}/${ROOT.post_uuid}`, shows: "Banner updated.", shot: "slash-thread-channel", created: "/po/createComment",
            typed: "/remind me to check the banner in 10 minutes", command: "remind", where: { channel_id: LAUNCH, thread_ts: ROOT.post_uuid } },
          { url: `/app/chat/${MAYA.user_uuid}/${DM_ROOT.chat_uuid}`, shows: "Can you check the banner?", shot: "slash-thread-dm", created: "/dm/createComment",
            typed: "/remind me to answer Maya in 10 minutes", command: "remind", where: { dm_group_id: DM, thread_ts: DM_ROOT.chat_uuid } },
          { url: `/app/chat/group/${CREW}/${GROUP_ROOT.chat_uuid}`, shows: "Standup at 9:30 tomorrow.", shot: "slash-thread-group", created: "/dm/createComment",
            typed: "/standup moved to 9:30", command: "standup", where: { dm_group_id: CREW, thread_ts: GROUP_ROOT.chat_uuid } },
        ]
        for (const thread of threads) {
          await tab.goto(thread.url, { waitUntil: "domcontentloaded", timeout: 120_000 })
          await expect(tab.getByText(thread.shows).first()).toBeVisible({ timeout: 60_000 })
          await tidy(tab)
          box = tab.locator('[contenteditable="true"]').last()
          await offers(box, thread.shot)
          await runs(box, thread.typed, thread.command, thread.where)
          await sendsGif(box, thread.created, thread.where, `giphy-${thread.shot.replace("slash-", "")}`)
        }
      } else {
        const panel = tab.locator("[data-right-panel]")
        // A thread's reply beside its channel: the channel's commands, run in the thread and answered there.
        await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await tab.getByText("1 reply").first().click()
        await expect(panel.getByText("Banner updated.")).toBeVisible({ timeout: 30_000 })
        box = panel.locator('[contenteditable="true"]').last()
        await offers(box, "slash-thread")
        await runs(box, "/remind me to check the banner in 10 minutes", "remind", { channel_id: LAUNCH, thread_ts: ROOT.post_uuid }, panel)
        await sendsGif(box, "/po/createComment", { channel_id: LAUNCH, thread_ts: ROOT.post_uuid }, "giphy-thread", panel)

        // The same thread open beside the Inbox, with no channel view under it.
        await tab.goto("/app/inbox?tab=threads", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const followed = tab.getByRole("link", { name: /^Maya Chen in #launch\./ })
        await expect(followed).toBeVisible({ timeout: 60_000 })
        await tidy(tab)
        await followed.click()
        await expect(panel.getByText("Banner updated.")).toBeVisible({ timeout: 30_000 })
        box = panel.locator('[contenteditable="true"]').last()
        await offers(box, "slash-thread-inbox")
        await runs(box, "/standup moved to 9:30", "standup", { channel_id: LAUNCH, thread_ts: ROOT.post_uuid }, panel)
        await sendsGif(box, "/po/createComment", { channel_id: LAUNCH, thread_ts: ROOT.post_uuid }, "giphy-thread-inbox", panel)
      }
      await context.close()
    })

    // An admin's "/" in a workspace where Giphy isn't set up offers to set it
    // up, where members see no /giphy, and the row opens Giphy in Admin › Apps
    // (CR-22's SF1).
    test(`at ${view.name}, ${scheme}: an admin's "/" offers to set up Giphy, and opens it in Admin › Apps`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      await stubBackend(tab, testInfo, {
        ...answers([]),
        // The admin layout lets in only a workspace admin.
        "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
        "/command/catalog": { msg: "ok", data: { commands: CATALOG.map((c) => (c.command === "giphy" ? { ...c, setup: { slug: "giphy", name: "Giphy" } } : c)) } },
        "/admin/marketplace": { msg: "ok", data: { apps: [GIPHY_APP] } },
        "/admin/apps": { msg: "ok", data: { apps: [] } },
      })
      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.locator(`#msg-${ROOT.post_uuid}`).getByText("Launch moved to 10:30.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      const box = tab.locator('[contenteditable="true"]').last()
      await box.click()
      await box.pressSequentially("/")
      const menu = tab.locator("[data-slash-menu]").last()
      const setUp = menu.getByRole("option", { name: /Set up Giphy/ })
      await expect(setUp).toBeVisible({ timeout: 30_000 })
      // Its words sit in the menu's footer while it's the lit row.
      for (let i = await menu.getByRole("option").count(); i > 0 && (await setUp.getAttribute("aria-selected")) !== "true"; i--) await box.press("ArrowDown")
      await expect(setUp).toHaveAttribute("aria-selected", "true")
      await expect(menu).toContainText("/giphy · members see it once it's set up")
      await expectReachable(setUp)
      await reviewShot(tab, "slash-setup-giphy", scheme)
      await setUp.click()
      await expect(tab).toHaveURL(/\/app\/admin\?tab=apps&app=giphy$/, { timeout: 30_000 })
      await expect(tab.getByRole("dialog", { name: "Giphy" })).toBeVisible({ timeout: 30_000 })
      await reviewShot(tab, "slash-setup-giphy-opened", scheme)
      await context.close()
    })
  }
}

// A channel's "/" menu, open while the channel's catalog is held, as a slow
// network holds it; release() lets the catalog through.
async function slashBeforeCatalog(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: views[0].viewport })
  const tab = await context.newPage()
  await stubBackend(tab, testInfo, answers([]))
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  // Registered after the stub, so it's asked first; the stub answers once it lets go.
  await tab.route(/\/command\/catalog/, async (route) => {
    await held
    await route.fallback()
  })
  await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.locator(`#msg-${ROOT.post_uuid}`).getByText("Launch moved to 10:30.")).toBeVisible({ timeout: 60_000 })
  await tidy(tab)
  const box = tab.locator('[contenteditable="true"]').last()
  await box.click()
  await box.pressSequentially("/")
  const menu = tab.locator("[data-slash-menu]").last()
  await expect(menu.getByRole("option").first()).toBeVisible()
  await expect(menu.getByText("/standup", { exact: false })).toHaveCount(0)
  return { context, tab, menu, release }
}

// The owner's report (23 Oct): a "/" typed before a conversation's commands
// came offered formatting alone, and stayed so. The open menu takes them in
// when they come.
test(`"/" typed before the conversation's commands come takes them in when they do`, async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const { context, menu, release } = await slashBeforeCatalog(browser, testInfo)
  release()
  await expect(menu.getByText("/standup", { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  await expect(menu.getByRole("listbox")).toHaveAttribute("aria-label", "Commands")
  await context.close()
})

// CR-17's SF3: the row the person arrowed to stays highlighted when the
// commands come in under the same "/", so Enter takes the row they see.
test(`the highlighted "/" row stays put when the conversation's commands come`, async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const { context, tab, menu, release } = await slashBeforeCatalog(browser, testInfo)
  await tab.keyboard.press("ArrowDown")
  await tab.keyboard.press("ArrowDown")
  const chosen = await menu.getByRole("option", { selected: true }).innerText()
  release()
  await expect(menu.getByText("/standup", { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  await expect(menu.getByRole("option", { selected: true })).toHaveText(chosen)
  await context.close()
})
