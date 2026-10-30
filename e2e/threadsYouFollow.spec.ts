import { expect, test, type Request } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// Any request the stubs don't answer, named in the log (a stray toast's cause).
function probe(tab: import("@playwright/test").Page) {
  tab.on("response", (r) => {
    if (r.status() === 404) console.log(`PROBE 404 ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
}

// Chat P2 in a real browser with no backend: the Inbox's Threads tab lists the
// threads Sam follows, unread first, and a row opens its thread beside the
// Inbox, reads it and shows the bell that follows or unfollows it. With
// SHOTS=<dir> each is saved at 1280 and 390, light and dark (the reading pane
// at 1280: a phone opens a thread as its page).

const JONAS = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", user_name: "Jonas Weber", user_full_name: "Jonas Weber" }
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const CHANNEL = "0c4a0000-0000-4000-8000-0000000000c1"
const PLAN = "0c4a0000-0000-4000-8000-0000000000a1"
const OFFSITE = "0c4a0000-0000-4000-8000-0000000000a2"
const LUNCH = "0c4a0000-0000-4000-8000-0000000000a3"
const GROUP = "3f2a9b7c41d84e5fa6b0c9d8e7f6a5b4"
const mention = (p: { user_uuid: string; user_full_name: string }) => `<span data-type="mention" data-id="${p.user_uuid}@0x1">@${p.user_full_name}</span>`

const THREADS = [
  {
    root: PLAN,
    conversation: { kind: "channel", id: CHANNEL },
    place: { name: "engineering" },
    message: { html: `<p>Rollback plan for Friday's release: ${mention(SAM)} can you check step 4?</p>`, by: JONAS, created_at: ago(180) },
    replies: 12,
    new: 3,
    latest: [{ id: "r1", html: "<p>Step 4 is fine.</p>", created_at: ago(4), by: MAYA }],
    last_reply_at: ago(4),
    unread: true,
    follow: "auto",
  },
  {
    root: OFFSITE,
    conversation: { kind: "group", id: GROUP },
    place: { name: "Launch crew", people: [MAYA, JONAS, SAM], count: 3 },
    message: { html: "<p>Venue options for the offsite: two in town, one by the lake.</p>", by: MAYA, created_at: ago(300) },
    replies: 5,
    new: 1,
    latest: [],
    last_reply_at: ago(45),
    unread: true,
    follow: "on",
  },
  {
    root: LUNCH,
    conversation: { kind: "dm", id: [SAM.user_uuid, MAYA.user_uuid].sort().join(" ") },
    place: { people: [MAYA, SAM], count: 2 },
    message: { html: "<p>Lunch Thursday?</p>", by: SAM, created_at: ago(1500) },
    replies: 1,
    new: 0,
    latest: [],
    last_reply_at: ago(1440),
    unread: false,
    follow: "auto",
  },
]

const reply = (id: string, by: typeof MAYA, text: string, m: number) => ({
  comment_uuid: id, comment_text: `<p>${text}</p>`, comment_by: by, comment_created_at: ago(m), comment_reactions: [], comment_attachments: [],
})

// The composer's and header's own reads, answered so no stray toast sits in the shots.
const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/activity/seen": { msg: "ok" },
  "/ch/markSeen": { msg: "ok" },
  "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
}

const answers = {
  ...QUIET,
  "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
  "/chat-threads/unread": { msg: "ok", data: { unread: 2 } },
  [`/chat-threads/${PLAN}/follow`]: { msg: "ok", data: { root: PLAN, following: true, follow: "auto" } },
  [`/chat-threads/${PLAN}/read`]: { msg: "ok", data: { root: PLAN, read: true } },
  "/chat-threads": { msg: "ok", data: { threads: THREADS, unread: 2 } },
  [`/po/allComments/${PLAN}`]: {
    msg: "ok",
    data: {
      post_uuid: PLAN,
      post_text: THREADS[0].message.html,
      post_by: JONAS,
      post_created_at: ago(180),
      post_channel: { ch_uuid: CHANNEL, ch_name: "engineering" },
      post_comment_count: 3,
      post_reactions: [],
      post_attachments: [],
      post_comments: [
        reply("r3", MAYA, "Step 4 needs the cache flushed first.", 30),
        reply("r2", JONAS, "Good catch, adding it.", 12),
        reply("r1", MAYA, "Step 4 is fine now.", 4),
      ],
    },
  },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: the Threads tab lists the threads Sam follows, unread first`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      probe(tab)
      await stubBackend(tab, testInfo, answers)
      await tab.goto("/app/inbox?tab=threads", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const plan = tab.getByRole("link", { name: /^Jonas Weber in #engineering\. 12 replies, 3 new$/ })
      await expect(plan).toBeVisible({ timeout: 60_000 })
      await expect(tab.getByRole("link", { name: /^Maya Chen in Launch crew\. 5 replies, 1 new$/ })).toBeVisible()
      await expect(tab.getByRole("link", { name: /^You in your DM with Maya Chen\. 1 reply$/ })).toBeVisible()
      // Threads is the fourth tab, chosen, with its plain count.
      const threads = tab.getByRole("tab", { name: /Threads/ })
      await expect(threads).toHaveAttribute("aria-selected", "true")
      await expect(threads).toContainText("2")
      // A phone offers no row size, so no toolbar row takes room over the rows.
      if (view.phone) await expect(tab.locator("[data-feed-toolbar]")).toHaveCount(0)
      await tidy(tab)
      await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/threads-list-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}

for (const scheme of ["light", "dark"] as const) {
  test(`at 1280, ${scheme}: a thread opens beside the Inbox, is read, and has its bell`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 }, colorScheme: scheme })
    const tab = await context.newPage()
    probe(tab)
    await stubBackend(tab, testInfo, answers)
    const reads: Request[] = []
    tab.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes(`/chat-threads/${PLAN}/read`)) reads.push(r)
    })
    await tab.goto("/app/inbox?tab=threads", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const plan = tab.getByRole("link", { name: /^Jonas Weber in #engineering\. 12 replies, 3 new$/ })
    await expect(plan).toBeVisible({ timeout: 60_000 })
    await tidy(tab)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/threads-pane-closed-1280-${scheme}.png` })
    await plan.click()
    // Beside the Inbox: the thread, its replies, and the bell (Sam follows it as its mention).
    await expect(tab.getByText("Good catch, adding it.")).toBeVisible({ timeout: 30_000 })
    await expect(tab.getByRole("button", { name: "Unfollow thread" })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => reads.length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(reads[0].postDataJSON()).toEqual({ read: true })
    // The Inbox stayed, and the row is read at once.
    await expect(tab.getByRole("link", { name: /^Jonas Weber in #engineering\. 12 replies$/ })).toBeVisible()
    await tidy(tab)
    await tab.waitForTimeout(700) // the panel's entrance settles before the shot
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/threads-pane-open-1280-${scheme}.png` })
    await context.close()
  })
}
