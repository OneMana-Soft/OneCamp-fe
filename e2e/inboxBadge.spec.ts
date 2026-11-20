import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, brokerOn, expectEveryCallAnswered, liveClockNow, mqttConfig, reviewShot, stubBackend } from "./stubbedApp"

// The Inbox badge (owner's bug, 5 Nov 2026): it stayed on, even on clicking
// Inbox, and nothing in the Inbox said which item it counted. Now the badge is
// the server's count of what the Inbox marks unread: the rows drawn with a dot
// are the number on the badge; opening the Inbox clears it once the server has
// said so, and an answer asked before that (the nav's, as it remounted on the
// click) can't put the old number back (C1); it stays cleared after a reload;
// an item read in its channel lowers it (C7); the Inbox opened in another tab
// clears it here (C6); a live item while the Inbox is open is listed, then
// seen, never left as a 1 beside it (C3); and one that came while the Inbox was
// away keeps its dot, since the Inbox reads its first page before the seen
// write (CR-B11 M2).
//
// The server here keeps the one rule (business/Activity unreadInInbox): an item
// is unread when it is newer than the last look and not read where it is.

const OWN = `user/${SAM.user_uuid}`
// services/mqttService MqttMessageType: Activity, ReadMoved.
const ACTIVITY = 17
const READ_MOVED = 46
// The real clock, ahead of it: a pin behind it starves the live connection (liveClockNow).
const NOW = liveClockNow()
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const ENG = "c-eng"
const JONAS = { user_uuid: "u-jonas", user_full_name: "Jonas Weber", user_name: "jonas" }
const MAYA = { user_uuid: "u-maya", user_full_name: "Maya Chen", user_name: "maya" }

type Item = { id: string; at: string; by: typeof JONAS; text: string; channel: string; readThere?: boolean; notice?: boolean }

/** A server that marks and counts its feed by the one rule, and answers when the test lets it. */
function inboxServer() {
  const s = {
    lastLook: minutesAgo(60),
    /** The server's clock: a seen write moves the last look to it. */
    now: NOW.toISOString(),
    items: [
      { id: "p-1", at: minutesAgo(10), by: JONAS, text: "Can you check the rollback steps?", channel: ENG },
      { id: "n-1", at: minutesAgo(20), by: MAYA, text: "", channel: "", notice: true },
      { id: "p-2", at: minutesAgo(30), by: MAYA, text: "The pilot moved to Thursday", channel: "c-ops" },
      { id: "p-0", at: minutesAgo(90), by: JONAS, text: "Last week's notes are up", channel: ENG },
    ] as Item[],
    seenWrites: 0,
    /** While set, the feed answers this many ms after it's asked, with what it knows then. */
    feedDelay: 0,
    /** While set, the seen write waits for it. */
    holdSeen: null as Promise<void> | null,
    /** Set when a seen write answered: answers asked before it wait for it, then answer what they knew. */
    seenAnswered: null as Promise<void> | null,
    lateAnswers: 0,
  }
  const unread = (i: Item) => i.at > s.lastLook && !i.readThere
  // The server counts to 100 (cheap on every sidebar load); past 99 the app shows 99+.
  const count = () => Math.min(100, s.items.filter(unread).length)
  const row = (i: Item) =>
    i.notice
      ? {
          activity_type: "NOTICE",
          time: i.at,
          priority: "normal",
          unread: unread(i),
          actor_kind: "person",
          notice: { id: i.id, kind: "doc.shared", resource_kind: "doc", resource_uuid: "d-plan", title: "Q4 launch plan", can_open: true, reason: "subject", actor: i.by, data: { level: "edit" }, created_at: i.at },
        }
      : {
          activity_type: "MENTION",
          time: i.at,
          priority: "high",
          unread: unread(i),
          actor_kind: "person",
          mention: { mention_created_at: i.at, mention_post: { post_uuid: i.id, post_text: i.text, post_channel: { ch_uuid: i.channel, ch_name: i.channel === ENG ? "engineering" : "ops" }, post_by: i.by } },
        }
  /** An answer asked now with what the server knows now, held past a seen write on its way. */
  const asOfNow = async <T,>(answer: () => T): Promise<T> => {
    const known = answer()
    const pending = s.seenAnswered
    if (pending) {
      await pending
      s.lateAnswers++
    }
    return known
  }
  const answers = {
    "/config/mqttConfig": mqttConfig([OWN]),
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/activity/unified": async () => {
      if (s.feedDelay) await new Promise((resolve) => setTimeout(resolve, s.feedDelay))
      return { msg: "ok", data: { has_more: false, activities: s.items.map(row) } }
    },
    "/activity/unread": () => asOfNow(() => ({ msg: "ok", data: { count: count() } })),
    // Home's other reads, answered empty, so no stub toast lands in a shot.
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/work/changes": { msg: "ok", data: { entries: [], cursor: "" } },
    // The sidenav still carries the old number: the app never takes it (C1).
    "/user/sidebarNav": () => asOfNow(() => ({ msg: "ok", data: { user_total_unread_activity_count: count() } })),
    "/activity/seen": async () => {
      s.seenWrites++
      let answered = () => {}
      if (s.holdSeen) s.seenAnswered = new Promise<void>((resolve) => (answered = resolve))
      await s.holdSeen
      s.lastLook = s.now
      const out = { msg: "Marked your Inbox read.", data: { count: count() } }
      // The answers held behind it go once it has landed.
      setTimeout(() => {
        answered()
        s.seenAnswered = null
      }, 150)
      return out
    },
  }
  return { s, count, answers }
}

async function open(page: Page, testInfo: TestInfo, server: ReturnType<typeof inboxServer>) {
  await page.clock.setFixedTime(new Date(NOW.getTime() + 5 * 60_000))
  // Home's orbits turn for minutes on a computer, and a review shot waits for a still page (homeGreeting).
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubBackend(page, testInfo, server.answers)
  const { broker } = await brokerOn(page)
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect.poll(() => broker.subscriptions(), { timeout: 60_000 }).toContain(OWN)
  return broker
}

/** The nav's Inbox: the phone's tab bar, or the sidebar's row. */
const inboxTab = (page: Page, phone: boolean) =>
  phone ? page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Inbox", exact: true }) : page.getByRole("link", { name: /^Inbox(\s*,\s*\S+)?$/ }).first()

async function expectBadge(page: Page, phone: boolean, n: number) {
  const tab = inboxTab(page, phone)
  const shown = n > 99 ? "99+" : String(n)
  if (phone) {
    const mark = tab.locator("[data-tab-badge]")
    if (n > 0) await expect(mark).toHaveText(shown, { timeout: 15_000 })
    else await expect(mark).toHaveCount(0, { timeout: 15_000 })
  } else {
    // The row says its count to a screen reader: "Inbox, 3".
    await expect(tab).toHaveAccessibleName(n > 0 ? new RegExp(`^Inbox\\s*,\\s*${shown.replace("+", "\\+")}$`) : "Inbox", { timeout: 15_000 })
  }
  // The tab's title and the favicon read the same number (nothing else is unread here).
  if (n > 0) await expect(page).toHaveTitle(new RegExp(`^\\(${shown.replace("+", "\\+")}\\) `))
  else await expect(page).not.toHaveTitle(/^\(\d/)
  await expect(page.locator("link[data-favicon-dot]")).toHaveCount(n > 0 ? 1 : 0)
}

const rows = (page: Page) => page.locator("[data-feed-row]")
const dotted = (page: Page) => page.locator("[data-feed-row][data-unread]")

/** A row marked read here, as opening it does: its tools show on hover, or in the drawer its Actions opens on a phone. */
async function markRowRead(row: ReturnType<typeof rows>, phone: boolean) {
  if (phone) {
    await row.getByRole("button", { name: "Actions" }).tap()
    await row.page().getByRole("menuitem", { name: "Mark read", exact: true }).tap()
  } else {
    await row.hover()
    await row.getByRole("button", { name: "Mark read" }).click()
  }
}

/** The nav's Home: the phone's tab bar, or the sidebar's row. */
const homeTab = (page: Page, phone: boolean) =>
  phone ? page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }) : page.getByRole("link", { name: "Home", exact: true }).first()

/** The header's Mark all read on a wide Inbox, or the options menu's (a sheet on a phone). */
async function markAllRead(page: Page, phone: boolean) {
  const press = (l: ReturnType<Page["getByRole"]>) => (phone ? l.tap() : l.click())
  // The options button is always there, shown only where the header is narrow;
  // Mark all read itself comes once the list has said what's unread. Whichever
  // this header shows is waited for: asked at once, a header still drawing read
  // as neither (390, 12:36).
  const options = page.getByRole("button", { name: "Inbox options" })
  const direct = page.getByRole("button", { name: "Mark all read" })
  await expect(options.or(direct).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 })
  if (!(await options.isVisible())) return press(direct)
  await press(options)
  await press(page.getByRole("menuitem", { name: "Mark all read" }))
}

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("the badge is the rows the Inbox marks, clears on opening it, and an answer from before can't bring it back", async ({ page }, testInfo) => {
        const server = inboxServer()
        const broker = await open(page, testInfo, server)
        await expectBadge(page, phone, 3)
        await reviewShot(page, "inbox-badge-count", theme)

        // Opening the Inbox, with its seen write held: the nav's answers from
        // around the click wait behind it, then answer the old number (C1).
        let release = () => {}
        server.s.holdSeen = new Promise<void>((resolve) => (release = resolve))
        if (phone) await inboxTab(page, phone).tap()
        else await inboxTab(page, phone).click()
        await expect(page).toHaveURL(/\/app\/inbox/)
        await expect(rows(page)).toHaveCount(4, { timeout: 30_000 })
        // The rows with a dot are the badge's number, and which ones: never the one from before the last look.
        await expect(dotted(page)).toHaveCount(3)
        await expect(rows(page).filter({ hasText: "Last week's notes are up" })).not.toHaveAttribute("data-unread", /.*/)
        await expect.poll(() => server.s.seenWrites).toBe(1)
        // Never a 0 the server didn't confirm.
        await expectBadge(page, phone, 3)

        // A read of the badge asked while the write is on its way (a conversation read in another tab).
        broker.publish(OWN, { type: READ_MOVED, data: { kind: "channel", id: "c-other", unread: 0 } })
        await page.waitForTimeout(300)
        release()
        await expectBadge(page, phone, 0)
        // The old number arrived after the write, and didn't set it.
        await expect.poll(() => server.s.lateAnswers, { timeout: 15_000 }).toBeGreaterThan(0)
        await page.waitForTimeout(500)
        await expectBadge(page, phone, 0)
        await reviewShot(page, "inbox-badge-opened", theme)

        // One of them read here, as opening it does: its dot goes, the others stay.
        server.s.holdSeen = null
        const opened = rows(page).filter({ hasText: "Can you check the rollback steps?" })
        await markRowRead(opened, phone)
        await expect(opened).not.toHaveAttribute("data-unread", /.*/)
        await expect(dotted(page)).toHaveCount(2)

        // The seen write moved the last look, so the server marks nothing unread
        // now. A phone's back to the Inbox and a reload read the first page
        // again: the rows the badge counted and nobody opened keep their dots
        // (CR-B10 M1), and the badge stays cleared.
        if (phone) {
          await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).tap()
          await expect(page).toHaveURL(/\/app\/home/)
          await page.goBack()
          await expect(rows(page)).toHaveCount(4, { timeout: 30_000 })
          await expect(dotted(page)).toHaveCount(2)
        }
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(rows(page)).toHaveCount(4, { timeout: 30_000 })
        await expect(dotted(page)).toHaveCount(2)
        await expect(opened).not.toHaveAttribute("data-unread", /.*/)
        await expect(rows(page).filter({ hasText: "Last week's notes are up" })).not.toHaveAttribute("data-unread", /.*/)
        await expectBadge(page, phone, 0)
        await expectEveryCallAnswered(page)
      })

      test("a read elsewhere lowers it, the Inbox opened in another tab clears it, and a live item while it's open is listed, then seen", async ({ page }, testInfo) => {
        const server = inboxServer()
        const broker = await open(page, testInfo, server)
        await expectBadge(page, phone, 3)

        // Jonas's mention read in #engineering, here or on another device (C7).
        server.s.items[0].readThere = true
        broker.publish(OWN, { type: READ_MOVED, data: { kind: "channel", id: ENG, unread: 0 } })
        await expectBadge(page, phone, 2)

        // The Inbox opened in another tab (C6).
        server.s.lastLook = NOW.toISOString()
        broker.publish(OWN, { type: READ_MOVED, data: { kind: "inbox", seen: NOW.toISOString(), unread: 0 } })
        await expectBadge(page, phone, 0)

        // A mention arrives while the Inbox is open (C3): listed with its dot, then seen.
        if (phone) await inboxTab(page, phone).tap()
        else await inboxTab(page, phone).click()
        await expect(rows(page)).toHaveCount(4, { timeout: 30_000 })
        await expect.poll(() => server.s.seenWrites).toBe(1)
        server.s.items.unshift({ id: "p-3", at: new Date(NOW.getTime() + 60_000).toISOString(), by: MAYA, text: "Ship it today?", channel: "c-ops" })
        server.s.now = new Date(NOW.getTime() + 120_000).toISOString()
        broker.publish(OWN, { type: ACTIVITY, data: { user_uuid: SAM.user_uuid, activity: { activity_type: "MENTION" } } })
        const fresh = rows(page).filter({ hasText: "Ship it today?" })
        await expect(fresh).toHaveCount(1, { timeout: 15_000 })
        await expect(fresh).toHaveAttribute("data-unread", /.*/)
        await expect.poll(() => server.s.seenWrites, { timeout: 15_000 }).toBe(2)
        await expectBadge(page, phone, 0)
        await reviewShot(page, "inbox-badge-live", theme)

        // Away from the Inbox, a mention comes with no live message. Back at the
        // Inbox, its first page is read before the seen write, so the mention
        // keeps its dot (CR-B11 M2). The read answers late here: a seen write
        // sent beside it, or with no read at all, would mark the mention read.
        if (phone) await homeTab(page, phone).tap()
        else await homeTab(page, phone).click()
        await expect(page).toHaveURL(/\/app\/home/)
        server.s.items.unshift({ id: "p-4", at: new Date(NOW.getTime() + 180_000).toISOString(), by: JONAS, text: "Is the deck final?", channel: ENG })
        server.s.now = new Date(NOW.getTime() + 240_000).toISOString()
        server.s.feedDelay = 400
        if (phone) await inboxTab(page, phone).tap()
        else await inboxTab(page, phone).click()
        const away = rows(page).filter({ hasText: "Is the deck final?" })
        await expect(away).toHaveAttribute("data-unread", /.*/, { timeout: 15_000 })
        await expect.poll(() => server.s.seenWrites, { timeout: 15_000 }).toBe(3)
        await expect(away).toHaveAttribute("data-unread", /.*/)
        await expectBadge(page, phone, 0)
        await expectEveryCallAnswered(page)
      })

      test("a long Inbox reads 99+ everywhere, and Mark all read takes the dots off what it counted", async ({ page }, testInfo) => {
        const server = inboxServer()
        // 120 mentions since the last look: the server counts to 100.
        server.s.items = Array.from({ length: 120 }, (_, i) => ({
          id: `p-${100 + i}`,
          at: minutesAgo(1 + i / 4),
          by: i % 2 ? MAYA : JONAS,
          text: `Status check ${i + 1}`,
          channel: i % 3 ? ENG : "c-ops",
        }))
        await open(page, testInfo, server)
        await expectBadge(page, phone, 100)
        await reviewShot(page, "inbox-badge-99", theme)

        if (phone) await inboxTab(page, phone).tap()
        else await inboxTab(page, phone).click()
        await expect(dotted(page).first()).toBeVisible({ timeout: 30_000 })
        await expect.poll(() => server.s.seenWrites).toBe(1)
        await expectBadge(page, phone, 0)

        // Mark all read is the Inbox seen too: the dots go, a seen write goes
        // with it, and the badge stays on the server's 0. (Every newer first
        // page is seen as well, so the write is counted by its request.)
        const write = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/activity/seen"))
        await markAllRead(page, phone)
        await expect(dotted(page)).toHaveCount(0)
        await write
        await expectBadge(page, phone, 0)
        await reviewShot(page, "inbox-badge-mark-all", theme)
        // And it holds when the first page is read again.
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(rows(page).first()).toBeVisible({ timeout: 30_000 })
        await expect(dotted(page)).toHaveCount(0)
        await expectBadge(page, phone, 0)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
