import { expect, test, type Browser, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { reviewShot, SAM, sendOnceReplies, stubBackend, tidy, untilStill, type Answers } from "./stubbedApp"

// V-699: on a phone nobody could follow or unfollow a thread. The thread
// page's bar had only Back and "Thread", and a message's long-press sheet had
// no Follow. Now the page's bar carries the thread's bell (the panel's own,
// FollowThreadButton) and the sheet offers Follow thread / Unfollow thread, on
// the one standing (/chat-threads/{root}/follow), as the bell does at 1280.
// The standing lives in the stub's "server" below, so a reload reads it back.
// With SHOTS_DIR=<dir> the bar (off and on) and the settled sheet (Follow and
// Unfollow) are saved at 390 and the panel at 1280, each light and dark.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 23, h, m)).toISOString()
const uuid = (n: number) => `0c4a0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const reply = (i: number, text: string) => ({
  comment_uuid: uuid(100 + i), comment_created_at: at(11, i), comment_by: i % 2 ? SAM : MAYA,
  comment_text: `<p>${text}</p>`, comment_reactions: [], comment_attachments: [],
})
const ROOT = {
  post_uuid: uuid(99), post_text: "<p>Launch moved to 10:30.</p>", post_by: MAYA, post_created_at: at(10, 59),
  post_attachments: [], post_reactions: [], post_comment_count: 2,
  post_comments: [reply(0, "Banner copy is ready."), reply(1, "Rollout window confirmed.")],
}
const channel = {
  ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [],
}
const FOLLOW = `/chat-threads/${ROOT.post_uuid}/follow`

/** The app on stubs, with a server that keeps the thread's standing; answers the PUTs it took. */
async function stubbed(page: Page, testInfo: TestInfo, server: { follow: string; following: boolean }, more: Answers = {}) {
  const writes: string[] = []
  await stubBackend(page, testInfo, {
    "/command/catalog": { msg: "ok", data: { commands: [] } },
    "/message/scheduled": { msg: "ok", data: [] },
    "/user/notificationStatus": { msg: "ok", data: {} },
    "/ai/voice-input": { msg: "ok", data: {} },
    "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
    "/ch/getFile": { msg: "ok", data: [] },
    "/ch/markSeen": { msg: "ok" },
    "/activity/seen": { msg: "ok" },
    "/user/botKinds": { msg: "ok", data: {} },
    "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
    "/user/allUsers": { msg: "ok", users: [SAM, MAYA] },
    [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
    [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
    [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [ROOT], has_more: false } },
    [`/po/allComments/${ROOT.post_uuid}`]: { msg: "ok", data: { ...ROOT, post_channel: { ch_uuid: LAUNCH, ch_name: "launch" } } },
    [`/po/newPostsIncludingCurrent/${LAUNCH}/${ROOT.post_uuid}`]: { msg: "ok", data: { posts: [ROOT], has_more: false } },
    // Nothing older than the thread's root: the list's top shows the channel's start, not "Couldn't load older messages".
    [`/po/oldPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [], has_more: false } },
    // Nor anything newer than the last reply: the 1280 list reads past its anchor once it stands.
    [`/po/newPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [], has_more: false } },
    [FOLLOW]: (_url: URL, request: Request) => {
      if (request.method() === "PUT") {
        const { follow } = request.postDataJSON() as { follow: string }
        writes.push(follow)
        server.follow = follow
        server.following = follow === "on"
      }
      return { msg: "ok", data: { root: ROOT.post_uuid, ...server } }
    },
    [`/chat-threads/${ROOT.post_uuid}/read`]: { msg: "ok", data: { root: ROOT.post_uuid, read: true } },
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/chat-threads": { msg: "ok", data: { threads: [], unread: 0 } },
    "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
    "/me/keywords": { msg: "ok", data: [] },
    "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    "/dm/": { msg: "ok", data: [] },
    ...more,
  })
  return writes
}

async function phone(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  return { context, page: await context.newPage() }
}

const threadPage = `/app/channel/${LAUNCH}/${ROOT.post_uuid}`
// The bell in the phone's top bar: the page's own tool, in the bar's trailing slot.
const barBell = (page: Page, name: "Follow thread" | "Unfollow thread") => page.locator("[data-phone-bar-end]").getByRole("button", { name, exact: true })

async function openThread(page: Page) {
  await page.goto(threadPage, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Rollout window confirmed.")).toBeVisible({ timeout: 60_000 })
}

/**
 * With SHOTS_DIR, the page as it stands, light and then dark (the app follows
 * the system's scheme), each through the stub's reviewShot; back in light after.
 */
async function shoot(page: Page, name: string) {
  if (!process.env.SHOTS_DIR) return
  await tidy(page)
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(scheme === "dark")
    await reviewShot(page, name, scheme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

/** A finger held on the thread's message until its sheet opens. */
async function longPress(page: Page): Promise<Locator> {
  const row = page.locator("[data-message-row]").filter({ hasText: "Launch moved to 10:30." }).first()
  await page.waitForTimeout(1500) // the list's own settling scroll would cancel a press (useLongPress)
  const b = (await row.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2))
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  const sheet = page.getByRole("dialog").filter({ hasText: "Message actions" }).first()
  await expect(sheet).toBeVisible({ timeout: 10_000 })
  // Settled: a row seen in it is where a finger finds it, not where the opening sheet passed it.
  await untilStill(page)
  return sheet
}

test("at 390 with touch: the thread page's bar follows the thread and unfollows it, and a reload keeps each", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const { context, page } = await phone(browser, testInfo)
  const writes = await stubbed(page, testInfo, { follow: "auto", following: false })
  await openThread(page)
  const bell = barBell(page, "Follow thread")
  await expect(bell).toBeVisible({ timeout: 20_000 })
  await expect(bell).toHaveAttribute("aria-pressed", "false")
  // The bar's 40px tool; a finger's reach is 44px (app/phone.css F3).
  const box = (await bell.boundingBox())!
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(40)
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(40)
  await shoot(page, "follow-bar-off")
  await bell.tap()
  await expect(barBell(page, "Unfollow thread")).toHaveAttribute("aria-pressed", "true")
  await expect.poll(() => writes).toEqual(["on"])
  await shoot(page, "follow-bar-on")
  await openThread(page)
  await expect(barBell(page, "Unfollow thread")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
  await barBell(page, "Unfollow thread").tap()
  await expect(barBell(page, "Follow thread")).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => writes).toEqual(["on", "off"])
  await openThread(page)
  await expect(barBell(page, "Follow thread")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 })
  await context.close()
})

test("at 390 with touch: a message's long-press sheet follows its thread and unfollows it", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const { context, page } = await phone(browser, testInfo)
  const writes = await stubbed(page, testInfo, { follow: "auto", following: false })
  // The sheet a message in the channel opens (the thread page's own bar has the bell).
  const openChannel = async () => {
    await page.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByText("Launch moved to 10:30.")).toBeVisible({ timeout: 60_000 })
  }
  await openChannel()
  let sheet = await longPress(page)
  const follow = sheet.getByRole("button", { name: "Follow thread", exact: true })
  // In the settled sheet, on the screen whole: toBeVisible alone passes for a row below the screen's edge.
  await expect(follow).toBeInViewport({ ratio: 1 })
  await shoot(page, "follow-sheet-follow")
  await follow.tap()
  // The sheet closes as it follows, and the thread's page says so after a reload.
  await expect(sheet).toBeHidden({ timeout: 10_000 })
  await expect.poll(() => writes).toEqual(["on"])
  await openThread(page)
  await expect(barBell(page, "Unfollow thread")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
  await openChannel()
  sheet = await longPress(page)
  const unfollow = sheet.getByRole("button", { name: "Unfollow thread", exact: true })
  await expect(unfollow).toBeInViewport({ ratio: 1 })
  await shoot(page, "follow-sheet-unfollow")
  await unfollow.tap()
  await expect(sheet).toBeHidden({ timeout: 10_000 })
  await expect.poll(() => writes).toEqual(["on", "off"])
  await openThread(page)
  await expect(barBell(page, "Follow thread")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 })
  await context.close()
})

test("at 1280: the thread panel's bell follows the thread and unfollows it, and a reload keeps each", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 } })
  const page = await context.newPage()
  const writes = await stubbed(page, testInfo, { follow: "auto", following: false })
  const panel = page.locator("[data-right-panel]")
  const bell = (name: "Follow thread" | "Unfollow thread") => panel.getByRole("button", { name, exact: true })
  const open = async () => {
    // The phone's thread address opens the channel with the thread beside it.
    await page.goto(threadPage, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(panel.getByText("Rollout window confirmed.")).toBeVisible({ timeout: 60_000 })
  }
  await open()
  await expect(bell("Follow thread")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 })
  await bell("Follow thread").click()
  await expect(bell("Unfollow thread")).toHaveAttribute("aria-pressed", "true")
  await expect.poll(() => writes).toEqual(["on"])
  await expect(panel.getByText("Couldn't load older messages")).toHaveCount(0)
  await expect(page.locator("[data-older-failed]")).toHaveCount(0)
  await shoot(page, "follow-panel-on")
  await open()
  await expect(bell("Unfollow thread")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
  await bell("Unfollow thread").click()
  await expect(bell("Follow thread")).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => writes).toEqual(["on", "off"])
  await open()
  await expect(bell("Follow thread")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 })
  await context.close()
})

// A reply sent again from the phone's thread page is the same reply (V-1088):
// the first send fails, the words stay, and Send again carries the same
// client_msg_id; the thread shows the reply once.
test("at 390 with touch: a reply sent again from the thread page after a failed send is the same reply", async ({ browser }, testInfo) => {
  const { context, page } = await phone(browser, testInfo)
  const server = sendOnceReplies("500", (n) => uuid(200 + n))
  await stubbed(page, testInfo, { follow: "auto", following: false }, { "/po/createComment": server.answer })
  await openThread(page)
  const box = page.locator('[contenteditable="true"]').last()
  await box.tap()
  await page.keyboard.type("Copy is live.")
  const send = page.getByRole("button", { name: "Send", exact: true }).last()
  await send.tap()
  await expect.poll(() => server.sent.length, { timeout: 20_000 }).toBe(1)
  await expect(box).toContainText("Copy is live.")
  await send.tap()
  await expect.poll(() => server.sent.length, { timeout: 20_000 }).toBe(2)
  expect(server.sent[0].client_msg_id, "the first send carries an id").toMatch(/^local-/)
  expect(server.sent[1].client_msg_id, "Send again carries the same id").toBe(server.sent[0].client_msg_id)
  await expect(box).not.toContainText("Copy is live.", { timeout: 20_000 })
  await expect(page.getByText("Copy is live.")).toHaveCount(1)
  await context.close()
})
