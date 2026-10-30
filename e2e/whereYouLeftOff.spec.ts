import { expect, test, type Page } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// Where you left off (chat B27), in a real browser with no backend, each
// channel opened by its address (a reload, a notification, a link), before the
// sidebar has answered: a channel with a few unread opens at its newest
// messages with the "New" line above the first unread; one with more than a
// screen unread opens at the first unread, with a banner that says how many
// since when, and Jump and Mark as read. Neither ever shows a channel's empty
// state on its way: "This is the start of #…" never appears in a channel with
// messages. With SHOTS=<dir> each is saved at 1280 and 390, light and dark.
// DESIGN-BUILD-4 (22 Oct): the line sits clear of the banner, under the last
// read message; the phone's banner says it short on one line; its buttons take
// a finger; and every shot waits for the line to finish drawing.

const JONAS = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const FEW = "0c4a0000-0000-4000-8000-0000000002e1"
const MANY = "0c4a0000-0000-4000-8000-0000000002e2"
const at = (n: number) => new Date(Date.UTC(2026, 9, 21, 8, 0) + n * 4 * 60_000).toISOString()
const LINES = [
  "Morning! Standup moved to 10:30.",
  "The release notes draft is in the doc.",
  "Can someone look at the flaky search test?",
  "On it. It waits on the index refresh.",
  "Staging is green again.",
  "Design review at 2, same room.",
  "I pushed the copy fixes for the import dialog.",
  "Thanks, merging after lunch.",
]
const posts = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    post_uuid: `${prefix}${String(i).padStart(4, "0")}`,
    post_text: `<p>${LINES[i % LINES.length]}</p>`,
    post_by: i % 2 ? JONAS : MAYA,
    post_created_at: at(i),
    post_attachments: [],
    post_reactions: [],
    post_comment_count: 0,
    post_comments: [],
  }))
const channel = (uuid: string, name: string, unread: number) => ({
  ch_uuid: uuid, ch_name: name, ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: unread, ch_created_at: at(0), ch_is_member: true, ch_posts: [], ch_created_by: JONAS, ch_member_count: 6,
  ch_recording: [],
})
const page = (list: object[]) => ({ msg: "ok", data: { posts: [...list].reverse(), has_more: false } })

const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/ch/getFile": { msg: "ok", data: [] },
  "/ch/markSeen": { msg: "ok" },
  "/activity/seen": { msg: "ok" },
  "/read/": { msg: "ok" },
  "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/user/botKinds": { msg: "ok", data: {} },
  "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel(FEW, "release", 3), channel(MANY, "design", 30)] } },
}

// Motion ends before a check or a shot: the line draws itself 200 ms after the
// list settles and takes 320 ms, and the phone's pill fades in. Shots taken
// sooner showed "NEW" with no line.
async function settle(tab: Page) {
  await tab.evaluate(() =>
    Promise.all(
      document.getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target
          return target instanceof Element && target.closest("[data-unread-line], [data-unread-banner], [data-jump-pill]") !== null && a.effect?.getTiming().iterations !== Infinity
        })
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}

// The hairline is drawn whole, from the left to "NEW".
async function expectLineDrawn(tab: Page) {
  const drawn = await tab.locator("[data-unread-line]").first().evaluate((line) => {
    const bar = line.firstElementChild!.getBoundingClientRect()
    const label = line.lastElementChild!.getBoundingClientRect()
    const row = line.getBoundingClientRect()
    return { width: bar.width, fromLeft: bar.left - row.left, toLabel: label.left - bar.right }
  })
  expect(drawn.width).toBeGreaterThan(100)
  expect(drawn.fromLeft).toBeLessThanOrEqual(24)
  expect(drawn.toLabel).toBeLessThanOrEqual(12)
}

// The line and the first unread message sit clear of the banner, with the last
// read message showing above the line.
async function expectClearOfBanner(tab: Page) {
  const at = await tab.evaluate(() => {
    const pill = document.querySelector("[data-unread-banner] [role=status] > div")!.getBoundingClientRect()
    const line = document.querySelector("[data-unread-line]")!.getBoundingClientRect()
    const rows = Array.from(document.querySelectorAll("[role=listitem][aria-label]")).map((r) => r.getBoundingClientRect())
    return {
      pill: pill.bottom,
      line: line.top,
      read: rows.filter((r) => r.bottom <= line.top + 1).pop()?.bottom ?? -1,
      unread: rows.find((r) => r.top >= line.bottom - 1)?.top ?? -1,
    }
  })
  expect(at.line, "the line under the banner").toBeGreaterThanOrEqual(at.pill + 4)
  expect(at.read, "a read message above the line, below the banner").toBeGreaterThan(at.pill)
  expect(at.unread, "the first unread below the banner").toBeGreaterThan(at.pill)
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a channel opens where you left off`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      // Every frame's count of empty states, from the first paint: the empty
      // conversation, never the start of one drawn above its first message.
      await tab.addInitScript(() => {
        const w = window as unknown as { __emptyMax: number }
        w.__emptyMax = 0
        const count = () => {
          w.__emptyMax = Math.max(w.__emptyMax, document.querySelectorAll("[data-conversation-empty]").length)
        }
        new MutationObserver(count).observe(document, { subtree: true, childList: true, characterData: true })
      })
      // The sidebar answers late, as on a slow first load.
      const slowSidebar = async (route: import("@playwright/test").Route) => {
        await new Promise((r) => setTimeout(r, 1200))
        await route.fallback()
      }
      await stubBackend(tab, testInfo, {
        ...QUIET,
        [`/ch/channelBasicInfo/${FEW}`]: { msg: "ok", channel_info: channel(FEW, "release", 3) },
        [`/po/latestPosts/${FEW}`]: page(posts("0c4a0000-0000-4000-8000-00000003", 24)),
        [`/ch/channelBasicInfo/${MANY}`]: { msg: "ok", channel_info: channel(MANY, "design", 30) },
        [`/po/latestPosts/${MANY}`]: page(posts("0c4a0000-0000-4000-8000-00000004", 40)),
      })
      // Registered last, so it runs first: the stub answers it after the wait.
      await tab.route(/\/user\/sidebarNav/, slowSidebar)

      // A few unread: the newest messages, the line above the first of them.
      await tab.goto(`/app/channel/${FEW}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const line = tab.locator("[data-unread-line]")
      await expect(line).toBeVisible({ timeout: 60_000 })
      expect(await tab.evaluate(() => (window as unknown as { __emptyMax: number }).__emptyMax)).toBe(0)
      await tidy(tab)
      await settle(tab)
      await expectLineDrawn(tab)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/left-off-line-${view.name}-${scheme}.png` })

      // More than a screen unread: at the first unread, with the banner.
      await tab.goto(`/app/channel/${MANY}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // A phone says it short, on one line.
      await expect(tab.getByText(view.phone ? /^30 new since / : /^30 new messages since /)).toBeVisible({ timeout: 60_000 })
      await expect(tab.getByRole("button", { name: "Mark as read" })).toBeVisible()
      expect(await tab.evaluate(() => (window as unknown as { __emptyMax: number }).__emptyMax)).toBe(0)
      await tidy(tab)
      await settle(tab)
      await expectLineDrawn(tab)
      await expectClearOfBanner(tab)
      const pill = (await tab.locator("[data-unread-banner] [role=status] > div").boundingBox())!
      expect(pill.height, "one line").toBeLessThanOrEqual(36)
      for (const name of ["Jump", "Mark as read"]) {
        // Exact: the phone's "Jump to latest" pill is a button too.
        const b = (await tab.getByRole("button", { name, exact: true }).boundingBox())!
        expect(b.y + b.height, `${name} inside the pill`).toBeLessThanOrEqual(pill.y + pill.height + 0.5)
        expect(b.x + b.width, `${name} inside the pill`).toBeLessThanOrEqual(pill.x + pill.width + 0.5)
      }
      if (view.phone) {
        // Both take a finger across 44px, and neither takes the other's taps.
        const reaches = await reachesIn(tab, "[data-unread-banner]")
        expect(reaches).toHaveLength(2)
        for (const r of reaches) expect(Math.min(r.right - r.left, r.bottom - r.top), r.name).toBeGreaterThanOrEqual(44)
        expect(overlapping(reaches)).toEqual([])
      }
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/left-off-banner-${view.name}-${scheme}.png` })
      if (!view.phone) {
        // Jump brings the line back to the same place, clear of the banner.
        await tab.mouse.move(640, 500)
        await tab.mouse.wheel(0, 500)
        await expect.poll(() => tab.locator("[data-unread-line]").evaluate((l) => l.getBoundingClientRect().top), { timeout: 10_000 }).toBeLessThan(0)
        await tab.getByRole("button", { name: "Jump", exact: true }).click()
        await expect.poll(() => tab.locator("[data-unread-line]").evaluate((l) => l.getBoundingClientRect().top), { timeout: 10_000 }).toBeGreaterThan(40)
        await settle(tab)
        await expectClearOfBanner(tab)
      }
      await context.close()
    })
  }
}

// A reload: the sidebar kept from the last visit (lib/swrCache) is there at
// once and says none, as reading the channel then marked it read. Three more
// came while away, which only the sidebar asked for since knows: the line
// waits for it.
test("a reload opens where you left off, from the sidebar asked for since, not the one kept", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 } })
  const tab = await context.newPage()
  await stubBackend(tab, testInfo, {
    ...QUIET,
    [`/ch/channelBasicInfo/${FEW}`]: { msg: "ok", channel_info: channel(FEW, "release", 3) },
    [`/po/latestPosts/${FEW}`]: page(posts("0c4a0000-0000-4000-8000-00000003", 24)),
  })
  await tab.goto(`/app/channel/${FEW}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.locator("[data-unread-line]")).toBeVisible({ timeout: 60_000 })
  await tab.route(/\/user\/sidebarNav/, async (route) => {
    await new Promise((r) => setTimeout(r, 1200))
    await route.fallback()
  })
  await tab.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.locator("[data-unread-line]")).toBeVisible({ timeout: 60_000 })
  await context.close()
})

// A DM opened by its address: reading its latest page marks it read, and the
// sidebar, asked for at the same moment, can come after that mark and say
// none. The page says how many were unread itself, read just before its mark,
// and the line sits above the first of Maya's three.
test("a DM opened by its address counts from its latest page", async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 } })
  const tab = await context.newPage()
  const maya = { ...MAYA, user_email_id: "maya@example.com" }
  const sam = { user_uuid: SAM.user_uuid, user_name: SAM.user_name, user_full_name: SAM.user_full_name }
  const chats = Array.from({ length: 24 }, (_, i) => ({
    chat_uuid: `0c4a0000-0000-4000-8000-0000000005${String(i).padStart(2, "0")}`,
    chat_from: i % 2 ? sam : maya,
    chat_to: i % 2 ? maya : sam,
    chat_created_at: at(i),
    chat_body_text: `<p>Message ${i + 1}: ${LINES[i % LINES.length]}</p>`,
    chat_attachments: [],
    chat_comment_count: 0,
  }))
  const grouping = [SAM.user_uuid, MAYA.user_uuid].sort().join(" ")
  await stubBackend(tab, testInfo, {
    ...QUIET,
    "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [], user_dms: [{ dm_grouping_id: grouping, dm_unread: 0, dm_chats: [chats[23]], dm_participants: [maya, sam], dm_notification_type: "all" }] } },
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: maya },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: [...chats].reverse(), has_more: false, unread: 3 } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  })
  await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const line = tab.locator("[data-unread-line]")
  await expect(line).toBeVisible({ timeout: 60_000 })
  // Maya's three newest are messages 19, 21 and 23: the line is between 18 and 19.
  const y = async (text: string) => (await tab.getByText(text, { exact: false }).first().boundingBox())!.y
  const lineY = (await line.boundingBox())!.y
  expect(await y("Message 18:")).toBeLessThan(lineY)
  expect(await y("Message 19:")).toBeGreaterThan(lineY)
  await context.close()
})
