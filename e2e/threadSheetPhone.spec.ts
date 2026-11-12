import { expect, test, type Locator, type Page, type Request } from "@playwright/test"
import { reviewShot, SAM, stubBackend, tidy, untilStill } from "./stubbedApp"

// A PHONE THREAD'S SHEETS ASK BEFORE DELETING (UX-CHAT-H1: the audit's
// CHAT-05, CHAT-04 step 1; the chat lane's V-724), in a real browser with no
// backend, at 390 with touch, light and dark. On a thread's own page a long
// press opened an older drawer whose Delete deleted at once, for everyone;
// now it is the list's sheet: Delete asks "Delete for everyone?" in place,
// Cancel keeps the message, and Delete removes it. The root's sheet offers
// Follow thread. With SHOTS_DIR=<dir> the sheet and its question are saved.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 23, h, m)).toISOString()
const uuid = (n: number) => `0c4a0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const reply = (i: number, by: typeof SAM | typeof MAYA, text: string) => ({
  comment_uuid: uuid(100 + i), comment_created_at: at(11, i), comment_by: by,
  comment_text: `<p>${text}</p>`, comment_reactions: [], comment_attachments: [],
})
// Sam's own message and reply, so the sheet offers Delete.
const ROOT = {
  post_uuid: uuid(99), post_text: "<p>Launch moved to 10:30.</p>", post_by: SAM, post_created_at: at(10, 59),
  post_attachments: [], post_reactions: [], post_comment_count: 2,
  post_comments: [reply(0, MAYA, "Banner copy is ready."), reply(1, SAM, "Rollout window confirmed.")],
}
const channel = {
  ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 0, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [],
}

type Deleted = { path: string; body: Record<string, unknown> }

async function stubbed(page: Page, testInfo: Parameters<typeof stubBackend>[1]) {
  const deleted: Deleted[] = []
  const took = (path: string) => (_url: URL, request: Request) => {
    deleted.push({ path, body: request.postDataJSON() as Record<string, unknown> })
    return { msg: "ok" }
  }
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
    [`/po/oldPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [], has_more: false } },
    [`/po/newPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [], has_more: false } },
    [`/chat-threads/${ROOT.post_uuid}/follow`]: { msg: "ok", data: { root: ROOT.post_uuid, follow: "auto", following: false } },
    [`/chat-threads/${ROOT.post_uuid}/read`]: { msg: "ok", data: { root: ROOT.post_uuid, read: true } },
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/chat-threads": { msg: "ok", data: { threads: [], unread: 0 } },
    "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
    "/me/keywords": { msg: "ok", data: [] },
    "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
    "/later": { msg: "ok", data: [] },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    "/dm/": { msg: "ok", data: [] },
    "/po/deletePost": took("/po/deletePost"),
    "/po/removeComment": took("/po/removeComment"),
  })
  return deleted
}

/** A finger held on a message of the thread's page until its sheet opens; the settled sheet. */
async function longPress(page: Page, text: string): Promise<Locator> {
  const row = page.locator("[data-message-row]").filter({ hasText: text }).first()
  await page.waitForTimeout(1500) // the page's own settling scroll would cancel a press (useLongPress)
  const b = (await row.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2))
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  const sheet = page.getByRole("dialog").filter({ hasText: "Message actions" }).first()
  await expect(sheet).toBeVisible({ timeout: 10_000 })
  await untilStill(page)
  return sheet
}

for (const scheme of ["light", "dark"] as const) {
  test(`at 390 with touch, ${scheme}: Delete on a thread page's root asks first; Cancel keeps it; Delete removes it for everyone`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme })
    const page = await context.newPage()
    const deleted = await stubbed(page, testInfo)
    await page.goto(`/app/channel/${LAUNCH}/${ROOT.post_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByText("Rollout window confirmed.")).toBeVisible({ timeout: 60_000 })
    await tidy(page)

    // A reply's sheet asks too.
    let sheet = await longPress(page, "Rollout window confirmed.")
    await expect(sheet.getByRole("button", { name: "Thread", exact: true })).toHaveCount(0)
    await sheet.getByRole("button", { name: "Delete message" }).tap()
    await expect(sheet.getByText("Delete for everyone?")).toBeVisible()
    await sheet.getByRole("button", { name: "Cancel" }).tap()
    await expect(sheet.getByText("Delete for everyone?")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden({ timeout: 10_000 })
    expect(deleted).toEqual([])

    // The root's: the list's sheet, with Follow thread (V-724) and no tile for the thread it is on.
    sheet = await longPress(page, "Launch moved to 10:30.")
    await expect(sheet.getByRole("button", { name: "Follow thread", exact: true })).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Thread", exact: true })).toHaveCount(0)
    await reviewShot(page, "thread-root-sheet", scheme)
    const remove = sheet.getByRole("button", { name: "Delete message" })
    await remove.scrollIntoViewIfNeeded()
    await remove.tap()
    const ask = sheet.getByRole("group", { name: "Delete this message?" })
    await expect(ask).toContainText("Delete for everyone?")
    await expect(ask).toBeInViewport({ ratio: 1 })
    await reviewShot(page, "thread-root-delete-ask", scheme)
    await page.waitForTimeout(500)
    expect(deleted).toEqual([])
    await ask.getByRole("button", { name: "Cancel" }).tap()
    await expect(ask).toHaveCount(0)
    expect(deleted).toEqual([])

    await sheet.getByRole("button", { name: "Delete message" }).tap()
    await sheet.getByRole("group", { name: "Delete this message?" }).getByRole("button", { name: "Delete", exact: true }).tap()
    await expect.poll(() => deleted, { timeout: 15_000 }).toEqual([{ path: "/po/deletePost", body: { post_id: ROOT.post_uuid } }])
    await context.close()
  })
}
