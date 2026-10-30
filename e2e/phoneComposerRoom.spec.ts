import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"
import { expectReachable } from "./menuReach"
import { giphyCard, serveGif } from "./giphyCard"
import { RUNNING_TASK, RUNNING_TIMER } from "./runningTimer"
import { openKeyboard } from "./keyboard"
import { settled } from "./sheetLayout"

// A command's answer (a Giphy card, "Ran /x here") shows above a phone's
// message box, in the box's sheet. The sheet was sized without it, so the
// answer sat scrolled out of sight above the box, and a phone never showed a
// Giphy card (DESIGN-BUILD-10's M1, 24 Oct 2026). The sheet grows by its
// answers, the room a conversation leaves under its last message follows the
// sheet, and "Jump to latest" hangs above the answers. A phone's thread page
// left no room at all: its last reply sat under the box.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f1"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 23, h, m)).toISOString()
const uuid = (n: number) => `0c4a0000-0000-4000-8000-${String(n).padStart(12, "0")}`

// Forty messages with Maya: more than a screenful.
const chat = (i: number) => ({
  chat_uuid: uuid(i + 1), chat_from: i % 2 ? SAM : MAYA, chat_to: i % 2 ? MAYA : SAM, chat_created_at: at(9, i),
  chat_body_text: `<p>Message ${i + 1}: the rollback steps, the load test and the launch notes, in order.</p>`,
  chat_attachments: [], chat_comment_count: 0,
})
// A #launch thread of twenty replies, longer than its page.
const reply = (i: number) => ({
  comment_uuid: uuid(100 + i), comment_created_at: at(11, i), comment_by: i % 2 ? SAM : MAYA,
  comment_text: `<p>Reply ${i + 1}: the banner, the copy and the rollout window.</p>`, comment_reactions: [], comment_attachments: [],
})
const ROOT = {
  post_uuid: uuid(99), post_text: "<p>Launch moved to 10:30.</p>", post_by: MAYA, post_created_at: at(10, 59),
  post_attachments: [], post_reactions: [], post_comment_count: 20, post_comments: Array.from({ length: 20 }, (_, i) => reply(i)),
}
const channel = {
  ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [],
}

async function stubbed(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/command/catalog": { msg: "ok", data: { commands: [
      { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
    ] } },
    "/command/execute": (_url: URL, request: Request) => {
      const { trigger_id } = request.postDataJSON() as { trigger_id: string }
      return { msg: "ok", data: giphyCard(trigger_id) }
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
    "/user/allUsers": { msg: "ok", users: [SAM, MAYA] },
    [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
    [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
    [`/po/allComments/${ROOT.post_uuid}`]: { msg: "ok", data: { ...ROOT, post_channel: { ch_uuid: LAUNCH, ch_name: "launch" } } },
    [`/po/newPostsIncludingCurrent/${LAUNCH}/${ROOT.post_uuid}`]: { msg: "ok", data: { posts: [ROOT], has_more: false } },
    [`/chat-threads/${ROOT.post_uuid}/follow`]: { msg: "ok", data: { root: ROOT.post_uuid, following: true, follow: "on" } },
    [`/chat-threads/${ROOT.post_uuid}/read`]: { msg: "ok", data: { root: ROOT.post_uuid, read: true } },
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/chat-threads": { msg: "ok", data: { threads: [], unread: 0 } },
    "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
    "/me/keywords": { msg: "ok", data: [] },
    "/conversations/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: Array.from({ length: 40 }, (_, i) => chat(i)), has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  })
  await serveGif(page)
}

// "/giphy launch" sent from the phone's box, as a person sends it, and Giphy's
// card over the box: its Send, which has its word (the box's own is an icon).
async function giphy(page: Page) {
  const box = page.locator('[contenteditable="true"]').last()
  await box.click()
  await box.pressSequentially("/giphy launch")
  await page.getByRole("button", { name: "Send" }).last().click()
  const send = page.getByRole("button", { name: "Send", exact: true }).filter({ hasText: "Send" })
  await expect(send).toBeVisible({ timeout: 30_000 })
  return send
}

// A reader's own flick through the conversation, up (negative) or down, from
// a point in the page's upper half: over the messages, clear of the box.
async function flick(page: Page, dy: number) {
  await page.mouse.move(195, 300)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, dy)
}

// V-68 (29 Oct): a running timer's card (the shell's left corner stack) sat 200 px up whatever the box's sheet held,
// so a Giphy card that grew the sheet ran under the timer. The sheet publishes its top (--mobile-drawer-h), and the
// card keeps 8 px over it as it grows, clear of the card's Send.
test("a running timer's card rises over the box's sheet as Giphy's card grows it", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubbed(page, testInfo)
  await page.route(/\/task\/time\/running$/, (route) => route.fulfill({ json: RUNNING_TIMER }))
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Message 40:")).toBeVisible({ timeout: 60_000 })
  const card = page.getByRole("status", { name: `Timer running on ${RUNNING_TASK}` })
  await expect(card).toBeVisible({ timeout: 15_000 })
  const send = await giphy(page)
  const sheetTop = () => page.evaluate(() => innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h") || "0"))
  const cardFoot = async () => {
    const b = (await card.boundingBox())!
    return b.y + b.height
  }
  await expect.poll(async () => (await sheetTop()) - (await cardFoot()), { message: "8 px or more between the timer's card and the sheet's top" }).toBeGreaterThanOrEqual(7.5)
  const s = (await send.boundingBox())!
  const c = (await card.boundingBox())!
  expect(c.y + c.height <= s.y || s.y + s.height <= c.y, "the timer's card clear of Giphy's Send").toBe(true)
  // The shot once both have come to rest: Giphy's card grows the sheet as its picture comes, and the timer's card
  // rises after it (DESIGN-BUILD-41).
  await settled(send)
  await settled(card)
  await page.screenshot({ path: testInfo.outputPath("390-chat-giphy-timer.png") })
})

// While the box is typed in, the keyboard up, the corner cards go under it as the tab bar does: over the box's sheet a
// card sat on the newest messages (V-68's reviews). The keyboard gone, the card is back.
test("a running timer's card goes under the keyboard while the box is typed in, and comes back after", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubbed(page, testInfo)
  await page.route(/\/task\/time\/running$/, (route) => route.fulfill({ json: RUNNING_TIMER }))
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Message 40:")).toBeVisible({ timeout: 60_000 })
  const card = page.getByRole("status", { name: `Timer running on ${RUNNING_TASK}` })
  await expect(card).toBeVisible({ timeout: 15_000 })
  const box = page.locator('[contenteditable="true"]').last()
  await box.click()
  const close = await openKeyboard(page, "visual")
  await box.pressSequentially("on my way")
  await expect(card).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath("390-chat-typing.png") })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await close()
  await expect(card).toBeVisible()
})

test("Giphy's card shows over the box, and the newest message stays above it", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubbed(page, testInfo)
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const newest = page.getByText("Message 40:")
  await expect(newest).toBeVisible({ timeout: 60_000 })
  // The card's Send, in view as it comes, without scrolling the sheet.
  await expectReachable(await giphy(page))
  // The list kept its reader at the bottom as its room grew with the sheet.
  await expect(async () => expectReachable(newest)).toPass({ timeout: 15_000 })
})

test("with Giphy's card over the box, Jump to latest hangs 12px above the card", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubbed(page, testInfo)
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Message 40:")).toBeVisible({ timeout: 60_000 })
  await giphy(page)
  await flick(page, -900)
  const pill = page.locator("[data-jump-pill]")
  await expect(pill).toBeVisible({ timeout: 15_000 })
  // Settled, as jumpPillPhone measures it: placed by the measure, its pill-in over.
  await expect(page.locator("[data-jump-row]")).toHaveAttribute("style", /bottom:/)
  await expect.poll(() => pill.evaluate((el) => el.getAnimations().some((a) => a.playState === "running"))).toBe(false)
  const answers = page.locator("[data-composer-sheet] [data-command-answers]")
  await expect.poll(async () => {
    const [p, a] = [await pill.boundingBox(), await answers.boundingBox()]
    const gap = a!.y - (p!.y + p!.height)
    return gap >= 8 && gap <= 16 ? "12px above the card" : `${Math.round(gap)}px`
  }, { timeout: 10_000 }).toBe("12px above the card")
})

test("a phone thread's last reply clears the box, with Giphy's card over it too", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubbed(page, testInfo)
  await page.goto(`/app/channel/${LAUNCH}/${ROOT.post_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const first = page.getByText("Reply 1:")
  await expect(first).toBeVisible({ timeout: 60_000 })
  const last = page.getByText("Reply 20:")
  // Scrolled to the end, the last reply sits above the box.
  await flick(page, 900)
  await expect(async () => expectReachable(last)).toPass({ timeout: 15_000 })
  await expectReachable(await giphy(page))
  // And with the card over the box, the end of the thread is above it.
  await flick(page, 900)
  await expect(async () => expectReachable(last)).toPass({ timeout: 15_000 })
})
