import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { SAM, stubBackend, withStatus } from "./stubbedApp"
import { expectSeen } from "./sheetLayout"
import { overlapping, reachesIn } from "./touchReach"

// A DM says what the other person's calendar says now (calendar head 5c, gcal-9b), from GET /event/status/{uuid}
// in the server's words on the reader's clock, never a title: on the bar above its message box, where a hold on
// their notifications is said, as a sentence ("Maya is in a meeting until 3:00 PM."). The bar wraps, so a long
// time is never cut on a phone. Away outranks a hold, a hold outranks a meeting. A status the workspace keeps
// private, and a failed read, say nothing and toast nothing; the header keeps presence alone. With SHOTS_DIR each
// state is saved at 1280 and 390 (touch), light and dark.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen", user_email_id: "maya@example.com", user_status: "online", user_device_connected: 1 }
const HELLO = "0c4a0000-0000-4000-8000-000000000021"
const chats = [{
  chat_uuid: HELLO, chat_from: MAYA, chat_to: SAM, chat_created_at: new Date(Date.now() - 600_000).toISOString(), chat_comment_count: 0,
  chat_body_text: "<p>Back after the review.</p>", chat_reactions: [], chat_attachments: [],
}]
const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
  [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats, has_more: false } },
  "/dm/": { msg: "ok", data: [] },
  "/user/dm-ai-suggestions": { msg: "ok", data: [] },
}
const STATUS = `/event/status/${MAYA.user_uuid}`
const until = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()
const says = (kind: string, words: string, hours = 1) => ({ msg: "ok", data: { kind, until: until(hours), words, private: false } })
const MEETING = says("busy", "In a meeting until 3:00 PM")

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
type View = (typeof views)[number]

/** Sam's DM with Maya at a width and scheme, the backend answering `answers` over the quiet rest. */
async function openDm(browser: Browser, testInfo: TestInfo, view: View, scheme: "light" | "dark", answers: Record<string, unknown>) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, { ...QUIET, ...answers })
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`#msg-${HELLO}`).getByText("Back after the review.")).toBeVisible({ timeout: 60_000 })
  return { context, page }
}

/** The sentence on the bar above the message box, as it says it (beside its Notify anyway): exact, in its case. */
const bar = (page: Page, words: string | RegExp) => page.getByRole("status").getByText(words, { exact: typeof words === "string" })

/** Where they are, as the header says it: presence alone, never the calendar's words. */
async function headerKeepsPresence(page: Page, view: View) {
  const header = view.phone ? page.locator("[data-conversation-subtitle]").first() : page.locator("[data-header-meta]").first()
  await expect(header).toHaveText(/^(Active|Away|Offline)$/)
}

async function shot(page: Page, name: string, view: View, scheme: string) {
  const dir = process.env.SHOTS_DIR || process.env.SHOTS
  if (dir) await page.screenshot({ path: `${dir}/dm-calendar-${name}-${view.name}-${scheme}.png` })
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a DM's bar says what the other person's calendar says now`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const { context, page } = await openDm(browser, testInfo, view, scheme, { [STATUS]: MEETING })
      await expectSeen(bar(page, "Maya is in a meeting until 3:00 PM."))
      // Nothing to notify: their notifications aren't held.
      await expect(page.getByRole("button", { name: "Notify anyway" })).toHaveCount(0)
      await headerKeepsPresence(page, view)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.viewport.width)
      await shot(page, "meeting", view, scheme)
      await context.close()
    })
  }

  test(`at ${view.name}: away outranks a hold, and Notify anyway stays while their notifications are held`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const held = { "/user/notificationStatus": { msg: "ok", data: { reason: "quiet_hours", until: until(8) } } }
    const { context, page } = await openDm(browser, testInfo, view, "light", { ...held, [STATUS]: says("away", "Away until Monday", 96) })
    await expectSeen(bar(page, "Maya is away until Monday."))
    await expectSeen(page.getByRole("button", { name: "Notify anyway" }))
    await expect(page.getByText(/quiet hours/)).toHaveCount(0)
    await shot(page, "away-held", view, "light")
    await context.close()
  })

  test(`at ${view.name}: a hold outranks a meeting`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const held = { "/user/notificationStatus": { msg: "ok", data: { reason: "paused", until: until(2) } } }
    const { context, page } = await openDm(browser, testInfo, view, "dark", { ...held, [STATUS]: MEETING })
    await expectSeen(bar(page, /^Maya paused notifications until .+\. They'll see your messages then\./))
    await expect(page.getByText(/in a meeting/)).toHaveCount(0)
    await shot(page, "held-meeting", view, "dark")
    await context.close()
  })

  for (const [state, answer] of [
    ["private", { msg: "ok", data: { words: "", private: true } }],
    ["empty", { msg: "ok", data: { kind: "", words: "", private: false } }],
    ["error", withStatus(503, { msg: "Couldn't check. Try again." })],
  ] as const) {
    test(`at ${view.name}: a status that is ${state} says nothing, and toasts nothing`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const { context, page } = await openDm(browser, testInfo, view, "light", { [STATUS]: answer })
      await page.waitForResponse((r) => r.url().includes(STATUS), { timeout: 30_000 }).catch(() => undefined)
      // Past the beat a failed read's toast would wait (lib/http/loadFailure).
      await expect(page.locator(".toast-tile")).toHaveCount(0)
      await page.waitForTimeout(1_500)
      await expect(page.locator(".toast-tile")).toHaveCount(0)
      await expect(bar(page, /^Maya /)).toHaveCount(0)
      await headerKeepsPresence(page, view)
      await shot(page, state, view, "light")
      await context.close()
    })
  }

  test(`at ${view.name}: while the calendar's read is out, the DM shows no bar, and the bar comes when it answers`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    let answer: (v: unknown) => void = () => undefined
    const late = new Promise((r) => (answer = r))
    const { context, page } = await openDm(browser, testInfo, view, "dark", { [STATUS]: () => late })
    await expect(bar(page, /^Maya /)).toHaveCount(0)
    await shot(page, "loading", view, "dark")
    answer(MEETING)
    await expectSeen(bar(page, "Maya is in a meeting until 3:00 PM."))
    await context.close()
  })
}

test("on a phone the longest words wrap whole, never cut inside the time", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const view = views[1]
  const { context, page } = await openDm(browser, testInfo, view, "light", { [STATUS]: says("busy", "In a meeting until tomorrow 12:30 PM", 20) })
  const said = bar(page, "Maya is in a meeting until tomorrow 12:30 PM.")
  await expectSeen(said)
  const cut = await said.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(cut, "the bar's words are cut").toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.viewport.width)
  await shot(page, "long", view, "light")
  await context.close()
})

// Notify anyway on a phone (V-125, from DESIGN-BUILD-48's read of head 5c): phones see the bar since 5c, so its one
// control takes a finger's tap across 44px over nothing beside it, and the tap says who was notified.
test("at 390: Notify anyway takes a finger's tap across 44px, and says who was notified", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const held = { "/user/notificationStatus": { msg: "ok", data: { reason: "quiet_hours", until: until(8) } }, "/user/notifyAnyway": { msg: "ok" } }
  const { context, page } = await openDm(browser, testInfo, views[1], "light", { ...held, [STATUS]: MEETING })
  const notify = page.getByRole("button", { name: "Notify anyway" })
  await expectSeen(notify)
  const reaches = await reachesIn(page, "[data-composer-sheet]")
  expect(reaches.map((r) => r.name)).toContain("Notify anyway")
  expect(overlapping(reaches)).toEqual([])
  await notify.tap()
  await expect(page.getByText(/^Maya( Chen)? was notified$/)).toBeVisible()
  await expect(notify).toHaveCount(0)
  await context.close()
})
