import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { AI_ON, AI_READS, SAM, SHOT_THEMES, brokerOn, expectEveryCallAnswered, liveClockNow, mqttConfig, reviewShot, stubBackend } from "./stubbedApp"

// V-577 (the owner's Inbox badge, 5 Nov 2026): it stayed at 1 with nothing in
// the Inbox to explain it. The web added the open urgent OneCamp AI nudges to
// the server's count, outside its one rule: a five-month-old "Overdue
// commitment" counted after every look, it was listed only on Priority while
// the Inbox opens on All, and the phone bar, the title and the favicon said 0.
// The server counts them now by the one rule (raised since the last look), and
// every surface shows its number alone. Here: an urgent nudge raised since the
// last look is the badge's 1 everywhere, and one from June counts nothing; the
// Inbox opens on All with the "From OneCamp AI" group at its top, the counted
// nudge with its dot, each with its Dismiss; opening it clears the badge, one
// raised while it's open is listed, then seen, and a reload keeps the badge at
// 0 with the nudges still listed (until resolved or dismissed). One closed
// elsewhere is dropped by its id, and no other.

const OWN = `user/${SAM.user_uuid}`
// services/mqttService MqttMessageType.AI_Nudge.
const AI_NUDGE = 24
// The real clock, ahead of it: a pin behind it starves the live connection (liveClockNow).
const NOW = liveClockNow()
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

type Nudge = { id: string; title: string; body: string; priority: number; raised: string; open: boolean }

/** A server that counts the Inbox by the one rule: an open urgent nudge raised since the last look. */
function nudgeServer() {
  const s = {
    lastLook: minutesAgo(60),
    /** The server's clock: a seen write moves the last look to it. */
    now: NOW.toISOString(),
    nudges: [
      { id: "n-new", title: "Overdue commitment", body: "You said you'd send the launch checklist by Monday.", priority: 1, raised: minutesAgo(15), open: true },
      { id: "n-june", title: "Overdue since June", body: "The vendor review you took on.", priority: 1, raised: "2026-06-11T09:00:00Z", open: true },
      { id: "n-low", title: "Still waiting on an answer?", body: "Maya asked about the pilot date.", priority: 0, raised: minutesAgo(5), open: true },
    ] as Nudge[],
    seenWrites: 0,
    dismissed: [] as string[],
  }
  const open = () => s.nudges.filter((n) => n.open)
  const counted = (n: Nudge) => n.open && n.priority > 0 && n.raised > s.lastLook
  const count = () => s.nudges.filter(counted).length
  const listed = (n: Nudge) => ({ id: n.id, kind: "overdue_commitment", title: n.title, body: n.body, status: "open", priority: n.priority, created_at: n.raised, updated_at: n.raised, unread: counted(n) })
  // One mention, read before the last look: the feed has nothing unread of its own.
  const mention = {
    activity_type: "MENTION",
    time: minutesAgo(90),
    priority: "high",
    unread: false,
    actor_kind: "person",
    mention: { mention_created_at: minutesAgo(90), mention_post: { post_uuid: "p-0", post_text: "Last week's notes are up", post_channel: { ch_uuid: "c-eng", ch_name: "engineering" }, post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber", user_name: "jonas" } } },
  }
  const answers = {
    ...AI_ON,
    ...AI_READS,
    "/config/mqttConfig": mqttConfig([OWN]),
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/activity/unified": { msg: "ok", data: { has_more: false, activities: [mention] } },
    "/activity/unread": () => ({ msg: "ok", data: { count: count() } }),
    "/user/sidebarNav": () => ({ msg: "ok", data: { user_total_unread_activity_count: count() } }),
    "/activity/seen": () => {
      s.seenWrites++
      s.lastLook = s.now
      return { msg: "Marked your Inbox read.", data: { count: count() } }
    },
    // The list, each marked as the badge counts it, and Dismiss.
    "/ai/nudges": (url: URL, request: { method(): string }) => {
      const dismiss = url.pathname.match(/\/ai\/nudges\/([^/]+)\/dismiss$/)
      if (request.method() === "POST" && dismiss) {
        const n = s.nudges.find((x) => x.id === dismiss[1])
        if (n) n.open = false
        s.dismissed.push(dismiss[1])
        return { msg: "ok", data: { open_count: open().length } }
      }
      return { msg: "ok", data: { nudges: open().map(listed), open_count: open().length } }
    },
    // Home's other reads, answered empty, so no stub toast lands in a shot.
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/work/changes": { msg: "ok", data: { entries: [], cursor: "" } },
  }
  return { s, answers }
}

async function open(page: Page, testInfo: TestInfo, server: ReturnType<typeof nudgeServer>) {
  await page.clock.setFixedTime(new Date(NOW.getTime() + 5 * 60_000))
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

/** The badge on the nav's Inbox, the tab's title and the favicon: one number. */
async function expectBadge(page: Page, phone: boolean, n: number) {
  const tab = inboxTab(page, phone)
  if (phone) {
    const mark = tab.locator("[data-tab-badge]")
    if (n > 0) await expect(mark).toHaveText(String(n), { timeout: 15_000 })
    else await expect(mark).toHaveCount(0, { timeout: 15_000 })
  } else {
    // The row says its count to a screen reader: "Inbox, 1".
    await expect(tab).toHaveAccessibleName(n > 0 ? new RegExp(`^Inbox\\s*,\\s*${n}$`) : "Inbox", { timeout: 15_000 })
  }
  if (n > 0) await expect(page).toHaveTitle(new RegExp(`^\\(${n}\\) `))
  else await expect(page).not.toHaveTitle(/^\(\d/)
  await expect(page.locator("link[data-favicon-dot]")).toHaveCount(n > 0 ? 1 : 0)
}

const press = (l: Locator, phone: boolean) => (phone ? l.tap() : l.click())
const group = (page: Page) => page.getByRole("region", { name: "From OneCamp AI" })
const nudge = (page: Page, title: string) => group(page).locator("li").filter({ hasText: title })

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      // open() alone may take 120 s to load and 60 s for the live subscription; the 30 s
      // default ended the walk inside open() under load, before any badge assertion.
      test.setTimeout(180_000)

      test("an urgent nudge raised since the last look is the badge's 1 everywhere, shows at the top of All with its dot, and opening the Inbox clears it for good", async ({ page }, testInfo) => {
        const server = nudgeServer()
        const broker = await open(page, testInfo, server)
        // The server's number alone: the June nudge and the one at priority 0 count nothing.
        await expectBadge(page, phone, 1)
        await reviewShot(page, "inbox-nudge-badge", theme)

        await press(inboxTab(page, phone), phone)
        await expect(page).toHaveURL(/\/app\/inbox/)
        await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 })
        // What the badge counted is where the Inbox opens: the group, atop All.
        await expect(group(page)).toBeVisible({ timeout: 30_000 })
        await expect(group(page).locator("li")).toHaveCount(3)
        await expect(nudge(page, "Overdue commitment")).toHaveAttribute("data-unread", "")
        await expect(nudge(page, "Overdue since June")).not.toHaveAttribute("data-unread", /.*/)
        await expect(nudge(page, "Still waiting on an answer?")).not.toHaveAttribute("data-unread", /.*/)
        await expect(group(page).getByRole("button", { name: "Dismiss" })).toHaveCount(3)
        await expect.poll(() => server.s.seenWrites, { timeout: 15_000 }).toBe(1)
        await expectBadge(page, phone, 0)
        // Seen, it keeps its dot until it is opened, as the feed's rows do.
        await expect(nudge(page, "Overdue commitment")).toHaveAttribute("data-unread", "")
        await reviewShot(page, "inbox-nudge-all", theme)

        // The same group atop Priority, read again after the look: the dot stays.
        await press(page.getByRole("tab", { name: /^Priority/ }), phone)
        await expect(group(page).locator("li")).toHaveCount(3, { timeout: 15_000 })
        await expect(nudge(page, "Overdue commitment")).toHaveAttribute("data-unread", "")
        await press(page.getByRole("tab", { name: /^All/ }), phone)
        await expect(group(page).locator("li")).toHaveCount(3, { timeout: 15_000 })

        // One raised while the Inbox is open: listed with its dot, then seen, never a 1 beside it.
        server.s.nudges.unshift({ id: "n-live", title: "Reply to Maya's question", body: "She asked about the pilot date an hour ago.", priority: 1, raised: new Date(NOW.getTime() + 60_000).toISOString(), open: true })
        server.s.now = new Date(NOW.getTime() + 120_000).toISOString()
        broker.publish(OWN, { type: AI_NUDGE, data: { action: "new", nudge_id: "n-live", kind: "stale_question", title: "Reply to Maya's question", body: "She asked about the pilot date an hour ago.", priority: 1, open_count: 4, created_at: new Date(NOW.getTime() + 60_000).toISOString() } })
        await expect(nudge(page, "Reply to Maya's question")).toHaveAttribute("data-unread", "", { timeout: 15_000 })
        await expect.poll(() => server.s.seenWrites, { timeout: 15_000 }).toBe(2)
        await expectBadge(page, phone, 0)

        // A reload: the badge stays cleared, and the nudges stay listed until resolved or dismissed.
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(group(page).locator("li")).toHaveCount(4, { timeout: 30_000 })
        await expectBadge(page, phone, 0)

        // One closed elsewhere (the engine resolved it): dropped by its id, and no other.
        server.s.nudges.find((n) => n.id === "n-low")!.open = false
        broker.publish(OWN, { type: AI_NUDGE, data: { action: "cleared", nudge_ids: ["n-low"], open_count: 3 } })
        await expect(nudge(page, "Still waiting on an answer?")).toHaveCount(0, { timeout: 15_000 })
        await expect(group(page).locator("li")).toHaveCount(3)

        // Its Dismiss: gone here and on the server.
        const counted = nudge(page, "Overdue commitment")
        if (!phone) await counted.hover()
        await press(counted.getByRole("button", { name: "Dismiss" }), phone)
        await expect(counted).toHaveCount(0)
        await expect.poll(() => server.s.dismissed).toEqual(["n-new"])
        await expect(group(page).locator("li")).toHaveCount(2)
        await expectBadge(page, phone, 0)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
