import { expect, test, type Page } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// The shared demo's banner and the first-run tip, closed so the shots show the screen.
async function tidy(tab: import("@playwright/test").Page) {
  for (let i = 0; i < 2; i++) {
    const gotIt = tab.getByRole("button", { name: "Got it" }).first()
    if (!(await gotIt.isVisible().catch(() => false))) break
    await gotIt.click().catch(() => {})
  }
}

// A thread's faces on first load (chat P2; STEP5_PLAN #1, spec A), in a real
// browser with no backend. The pages answer as the server now does: up to
// three of a thread's people per message, each once, the last its latest
// reply, a guest's carrying only the label naming them. #engineering opens at
// its check-in card and a thread, #acme at a guest's reply, and a DM at a
// thread. With SHOTS=<dir> each is saved at 1280 and 390, light and dark.

const JONAS = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const ADA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e71", user_name: "Ada Okafor", user_full_name: "Ada Okafor" }
const CHECKINS = { user_uuid: "7c1d0000-0000-4000-8000-0000000000c1", user_name: "Check-ins", user_full_name: "Check-ins", is_bot: true }
const GUESTS = { user_uuid: "7c1d0000-0000-4000-8000-0000000000c2", user_name: "Guests", user_full_name: "Guests", is_bot: true }
const ENG = "0c4a0000-0000-4000-8000-0000000000e1"
const ACME = "0c4a0000-0000-4000-8000-0000000000e2"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 18, h, m)).toISOString()
const id = (n: number) => `0c4a0000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`

// A reply as a page carries it: who, when; a guest's with the label naming them.
const face = (n: number, by: object, h: number, m: number, label?: string) => ({
  comment_uuid: id(n), comment_created_at: at(h, m), comment_by: by, ...(label ? { comment_text: label } : {}),
})
const post = (n: number, by: object, text: string, h: number, m: number, replies: object[] = [], count = replies.length) => ({
  post_uuid: id(n), post_text: `<p>${text}</p>`, post_by: by, post_created_at: at(h, m), post_attachments: [], post_reactions: [],
  post_comment_count: count, post_comments: replies,
})
const channel = (uuid: string, name: string, guests = false) => ({
  ch_uuid: uuid, ch_name: name, ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_posts: [], ch_created_by: JONAS, ch_member_count: 5,
  ch_recording: [], ...(guests ? { has_guest_access: true } : {}),
})
const page = (posts: object[]) => ({ msg: "ok", data: { posts: [...posts].reverse(), has_more: false } })

const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/ch/getFile": { msg: "ok", data: [] },
  "/ch/markSeen": { msg: "ok" },
  "/activity/seen": { msg: "ok" },
  "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/user/botKinds": { msg: "ok", data: { [CHECKINS.user_uuid]: "checkin", [GUESTS.user_uuid]: "guest" } },
  // The sidebar names the channels, as Sam's would.
  "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel(ENG, "engineering"), channel(ACME, "acme", true)] } },
}

const ENGINEERING = [
  post(1, CHECKINS, "What did you get done yesterday, and what's next?", 9, 0, [face(11, JONAS, 9, 12), face(12, MAYA, 9, 20)], 2),
  post(2, JONAS, "Rollback plan for Friday: cache flush first, then the migration.", 9, 30, [face(21, ADA, 9, 41), face(22, MAYA, 9, 52), face(23, JONAS, 10, 2)], 6),
  post(3, MAYA, "Staging is green again.", 10, 15),
]
const ACME_POSTS = [
  post(4, MAYA, "Here's the launch checklist for Acme. Does this match your rollout?", 9, 10, [
    face(41, MAYA, 9, 25),
    face(42, GUESTS, 9, 40, "<p><strong>[Priya (Acme) (guest)]</strong></p>"),
  ], 3),
]

async function open(tab: Page, path: string) {
  await tab.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: threads show their people on first load`, async ({ browser }, testInfo) => {
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
        ...QUIET,
        [`/ch/channelBasicInfo/${ENG}`]: { msg: "ok", channel_info: channel(ENG, "engineering") },
        [`/po/latestPosts/${ENG}`]: page(ENGINEERING),
        [`/ch/channelBasicInfo/${ACME}`]: { msg: "ok", channel_info: channel(ACME, "acme", true) },
        [`/po/latestPosts/${ACME}`]: page(ACME_POSTS),
      })

      // #engineering: the check-in's two answers and the thread's three people.
      await open(tab, `/app/channel/${ENG}`)
      await expect(tab.getByText("Rollback plan for Friday")).toBeVisible({ timeout: 60_000 })
      await expect(tab.getByText("2 answered")).toBeVisible()
      await expect(tab.getByText("6 replies")).toBeVisible()
      // Two who answered the check-in, and the thread's three people.
      await expect(tab.locator("[data-participant]")).toHaveCount(5)
      await tidy(tab)
      await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/faces-engineering-${view.name}-${scheme}.png` })

      // #acme: the guest's face is hers, never the Guests bot's square.
      await open(tab, `/app/channel/${ACME}`)
      await expect(tab.getByText("launch checklist for Acme")).toBeVisible({ timeout: 60_000 })
      const faces = tab.locator("[data-participant]")
      await expect(faces).toHaveCount(2)
      // Newest first: Priya, then Maya.
      await expect(faces.first()).toContainText("P")
      await tidy(tab)
      await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/faces-acme-guest-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}

// A DM's thread: Sam's reply and Maya's, the last Maya's.
const chat = (n: number, by: object, text: string, m: number, replies: object[] = []) => ({
  chat_uuid: id(n), chat_from: by, chat_to: by === SAM ? MAYA : SAM, chat_created_at: at(9, m), chat_attachments: [],
  chat_comment_count: replies.length, chat_comments: replies, chat_body_text: `<p>${text}</p>`, chat_reactions: [],
})
for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a DM's thread shows its people on first load`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      await stubBackend(tab, testInfo, {
        ...QUIET,
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: {
          msg: "ok",
          data: { has_more: false, chats: [
            chat(6, SAM, "Pushed the fix for the login loop.", 30),
            chat(5, MAYA, "Can you look at the login loop on staging?", 10, [face(51, SAM, 9, 14), face(52, MAYA, 9, 22)]),
          ] },
        },
        "/dm/": { msg: "ok", data: [] },
        "/user/dm-ai-suggestions": { msg: "ok", data: [] },
      })
      await open(tab, `/app/chat/${MAYA.user_uuid}`)
      await expect(tab.getByText("Can you look at the login loop on staging?")).toBeVisible({ timeout: 60_000 })
      await expect(tab.locator("[data-participant]")).toHaveCount(2)
      await tidy(tab)
      await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/faces-dm-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}

// A reply written now joins the faces once: Sam answers the rollback thread
// from its panel, and the bar under the message says so at once, Sam first,
// with no reload.
for (const scheme of ["light", "dark"] as const) {
  test(`at 1280, ${scheme}: a reply written now joins the thread's faces once`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 }, colorScheme: scheme })
    const tab = await context.newPage()
    const thread = id(2)
    await stubBackend(tab, testInfo, {
      ...QUIET,
      [`/ch/channelBasicInfo/${ENG}`]: { msg: "ok", channel_info: channel(ENG, "engineering") },
      [`/po/latestPosts/${ENG}`]: page(ENGINEERING),
      [`/po/allComments/${thread}`]: {
        msg: "ok",
        data: {
          ...ENGINEERING[1],
          post_channel: { ch_uuid: ENG, ch_name: "engineering" },
          post_comments: [
            { ...face(21, ADA, 9, 41), comment_text: "<p>Flush first, agreed.</p>", comment_reactions: [], comment_attachments: [] },
            { ...face(22, MAYA, 9, 52), comment_text: "<p>Migration is ready.</p>", comment_reactions: [], comment_attachments: [] },
            { ...face(23, JONAS, 10, 2), comment_text: "<p>Then Friday it is.</p>", comment_reactions: [], comment_attachments: [] },
          ],
        },
      },
      [`/chat-threads/${thread}/follow`]: { msg: "ok", data: { root: thread, following: false, follow: "auto" } },
      [`/chat-threads/${thread}/read`]: { msg: "ok", data: { root: thread, read: true } },
      "/po/createComment": { msg: "ok", data: { comment_id: id(24), comment_created_at: new Date().toISOString() } },
    })
    await open(tab, `/app/channel/${ENG}`)
    await expect(tab.getByText("6 replies")).toBeVisible({ timeout: 60_000 })
    await tab.getByText("6 replies").click()
    const panel = tab.locator("[data-right-panel]")
    await expect(panel.getByText("Then Friday it is.")).toBeVisible({ timeout: 30_000 })
    const box = panel.locator('[contenteditable="true"]').last()
    await box.click()
    await tab.keyboard.type("On it, flushing the cache now.")
    await tab.keyboard.press("Enter")
    // Under the message: 7 replies, three faces, Sam's first; Ada's makes room.
    // The bar under the message (the panel's divider says it too).
    await expect(tab.getByText("7 replies").first()).toBeVisible({ timeout: 20_000 })
    const bar = tab.locator("[data-participants]").nth(1)
    await expect(bar.locator("[data-participant]")).toHaveCount(3)
    await expect(bar.locator("[data-participant]").first()).toContainText("S")
    // Replying follows the thread: the bell fills at once.
    await expect(panel.getByRole("button", { name: "Unfollow thread" })).toHaveAttribute("aria-pressed", "true")
    await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/faces-live-reply-1280-${scheme}.png` })
    await context.close()
  })
}
