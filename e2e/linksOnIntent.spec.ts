import { expect, test, type Page } from "@playwright/test"
import { SAM, docInfo, stubBackend } from "./stubbedApp"

// The cards under a message (a doc, a task, a project) fetched the page each
// one opens as soon as they were on screen: a plain next/link prefetches on
// sight, so a phone scrolling a channel of doc links paid for every doc's page
// before anyone tapped one (DOCS-LEAD-2, 21 Oct). On a production build (no
// prefetch happens in dev), nothing the cards open is fetched while they are
// only on screen; a finger landing on a card, or a pointer coming over one,
// fetches its page. Red on beta c5ce78ab1, where all three were fetched on
// sight at both widths.

const CHANNEL = "0c4a0000-0000-4000-8000-0000000002e1"
const DOC = "0c4a0000-0000-4000-8000-0000000002d1"
const TASK = "0c4a0000-0000-4000-8000-0000000002a1"
const PROJECT = "0c4a0000-0000-4000-8000-0000000002b1"
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const at = new Date(Date.UTC(2026, 9, 21, 9, 30)).toISOString()

const channel = {
  ch_uuid: CHANNEL, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
  unread_post_count: 0, ch_created_at: at, ch_is_member: true, ch_posts: [], ch_created_by: MAYA, ch_member_count: 4, ch_recording: [],
}
const post = {
  post_uuid: "0c4a0000-0000-4000-8000-0000000002f1", post_by: MAYA, post_created_at: at, post_attachments: [], post_reactions: [],
  post_comment_count: 0, post_comments: [],
  post_text: `<p>The plan is in /app/doc/${DOC}, the import is /app/task/${TASK}, and it all sits in /app/project/${PROJECT}</p>`,
}

const ANSWERS = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/ch/getFile": { msg: "ok", data: [] },
  "/ch/markSeen": { msg: "ok" },
  "/activity/seen": { msg: "ok" },
  "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
  [`/ch/channelBasicInfo/${CHANNEL}`]: { msg: "ok", channel_info: channel },
  [`/po/latestPosts/${CHANNEL}`]: { msg: "ok", data: { posts: [post], has_more: false } },
  [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Q4 launch plan" }),
  [`/task/info/${TASK}`]: { msg: "ok", data: { task_uuid: TASK, task_name: "Bring the Slack history across", task_status: "inProgress" } },
  [`/project/info/${PROJECT}`]: { msg: "ok", data: { project_uuid: PROJECT, project_name: "Website relaunch" } },
}

/** Every request for a page a card opens: the route's prefetch or its load. */
function cardRoutes(tab: Page, origin: string): string[] {
  const seen: string[] = []
  tab.on("request", (r) => {
    const u = new URL(r.url())
    if (u.origin === origin && /^\/app\/(doc|task|project)\//.test(u.pathname)) seen.push(u.pathname)
  })
  return seen
}

const views = [
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
] as const

for (const view of views) {
  test(`at ${view.name}: a message's cards fetch nothing they open until someone means to open one`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const origin = new URL(String(testInfo.project.use.baseURL)).origin
    const context = await browser.newContext({
      baseURL: origin, viewport: view.viewport, colorScheme: "light",
      ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
    })
    const tab = await context.newPage()
    await stubBackend(tab, testInfo, ANSWERS)
    const fetched = cardRoutes(tab, origin)

    await tab.goto(`/app/channel/${CHANNEL}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const cards = tab.locator("[data-work-cards] a")
    await expect(cards).toHaveCount(3, { timeout: 60_000 })
    await expect(tab.getByText("Q4 launch plan")).toBeVisible()
    await expect(tab.getByText("Bring the Slack history across")).toBeVisible()
    await expect(tab.getByText("Website relaunch")).toBeVisible()
    // On sight: a prefetch starts as a link enters the screen, well inside this.
    await tab.waitForTimeout(2_500)
    expect(fetched, "pages fetched while the cards were only on screen").toEqual([])

    const doc = cards.filter({ hasText: "Q4 launch plan" })
    const task = cards.filter({ hasText: "Bring the Slack history across" })
    if (view.phone) {
      // A finger landing on the card, before the tap ends.
      await doc.dispatchEvent("touchstart")
      await expect.poll(() => fetched, { timeout: 15_000 }).toContain(`/app/doc/${DOC}`)
    } else {
      await task.hover()
      await expect.poll(() => fetched, { timeout: 15_000 }).toContain(`/app/task/${TASK}`)
      await doc.hover()
      await expect.poll(() => fetched, { timeout: 15_000 }).toContain(`/app/doc/${DOC}`)
    }
    // Only what was meant: the project's page is still not fetched.
    expect(fetched.filter((p) => p.startsWith(`/app/project/`))).toEqual([])
    await context.close()
  })
}
