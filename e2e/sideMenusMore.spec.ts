import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { openSideMenu } from "./menuReach"
import { SAM, docInfo, stubBackend, type Answers } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { PRIYA } from "./docs/twoPeople"

// The six side menus the sweep of 18 Oct 2026 found invisible, each opened on
// its own page from fixtures (UI-REGRESS finding 2; fixed by 623c3b993, which
// portals every side menu): a message's Remind me… and Save to memory, a
// memory item's Create task in…, the channel header's Notifications, the
// doc's Notifications and the share dialog's Access ends. Each opens beside
// its menu by pointer and by keyboard, every row in view and under the
// pointer (e2e/menuReach), and a row does what it says (its request).

test.use({ viewport: { width: 1280, height: 860 } })

const ok = (data: unknown) => ({ msg: "ok", data })
const AI = { "/config/client": ok({ upload_limit_mb: 10, upload_limit_bytes: 10485760, transcription_mode: "off", email_enabled: false, features: { ai: true } }) }

/** The requests a page sends with a body, by path. */
function sent(page: Page) {
  const out: { method: string; path: string; body: unknown }[] = []
  page.on("request", (r) => {
    if (r.method() === "GET" || r.method() === "OPTIONS") return
    let body: unknown = null
    try {
      body = r.postDataJSON()
    } catch {
      body = r.postData()
    }
    out.push({ method: r.method(), path: new URL(r.url()).pathname, body })
  })
  return out
}

/**
 * The menu open last, pinned by its id: a side menu that opens later is
 * "last" too, and a row looked up through a bare .last() would be sought in it.
 */
async function openMenu(page: Page) {
  const last = page.locator('[role="menu"][data-state="open"]').last()
  await expect(last).toBeVisible()
  return page.locator(`[id="${await last.getAttribute("id")}"]`)
}

/** Presses a menu's button until its menu is open (a press as the last one closes can be lost), and pins the menu. */
async function pressFor(page: Page, button: ReturnType<Page["getByRole"]>) {
  await expect(async () => {
    if ((await page.locator('[role="menu"][data-state="open"]').count()) === 0) await button.click()
    await expect(page.locator('[role="menu"][data-state="open"]').first()).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  return openMenu(page)
}

async function firstVisit(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
  })
}

// ---- a channel with two messages ----
const CH = "c4a70000-0000-4000-8000-000000000002"
const MAYA = { user_uuid: "5a7a1c11-0000-4000-8000-000000000101", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.test" }
const post = (i: number, by: typeof SAM | typeof MAYA, text: string) => ({
  post_uuid: `c4a70000-0000-4000-8000-1000000000${i}0`,
  post_text: `<p>${text}</p>`,
  post_by: by,
  post_created_at: new Date(Date.UTC(2026, 9, 17, 9, 0) - i * 7 * 60_000).toISOString(),
  post_comment_count: 0,
  post_comments: [],
  post_reactions: [],
  post_attachments: [],
})
const channel = {
  ch_uuid: CH,
  ch_name: "engineering",
  ch_icon: "",
  ch_private: false,
  ch_is_user_fav: false,
  ch_about: "Where the team talks about engineering.",
  ch_call_active: false,
  unread_post_count: 0,
  ch_created_at: "2026-09-01T09:00:00Z",
  ch_is_member: true,
  ch_posts: [],
  ch_created_by: SAM,
  ch_member_count: 2,
  ch_recording: [],
  notification_type: "all",
}

async function openChannel(page: Page, testInfo: TestInfo, extra: Answers = {}) {
  await firstVisit(page)
  await stubBackend(page, testInfo, {
    ...AI,
    "/user/sidebarNav": ok({ ...SAM, user_channels: [channel], user_dms: [], user_projects: [] }),
    [`/ch/channelBasicInfo/${CH}`]: { msg: "ok", channel_info: channel },
    "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: [channel] },
    [`/po/latestPosts/${CH}`]: ok({ posts: [post(0, MAYA, "We ship the launch on Thursday, after the load test."), post(1, SAM, "Rollback steps are in the notes.")], has_more: false }),
    "/later": ok({ items: [] }),
    "/ai/memory/capture": ok({ id: "m1" }),
    "/user/updateUserChannelNotification": ok({ ch_uuid: CH, notification_type: "mention" }),
    // The channel page's other reads and writes, answered empty, so no "Not
    // found" toast lands over a menu row.
    "/agent-card/channel": ok([]),
    "/ai/memory/channel-exclusion": ok({ excluded: false }),
    "/ai/voice-input": ok({ enabled: false }),
    "/ai/nudges": ok([]),
    "/ai/agent-note": ok({}),
    "/command/catalog": ok({ commands: [] }),
    "/message/scheduled": ok([]),
    "/ch/markSeen": ok({}),
    ...extra,
  })
  const requests = sent(page)
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("We ship the launch on Thursday").first()).toBeVisible({ timeout: 60_000 })
  return requests
}

/** Maya's message's More menu, from its hover toolbar. */
async function messageMenu(page: Page) {
  const row = page.locator("[data-message-row]").filter({ hasText: "We ship the launch on Thursday" }).first()
  await row.hover()
  const more = row.getByRole("button", { name: "More actions" })
  await more.click()
  await expect(page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: /Copy text/ }) })).toBeVisible()
  return openMenu(page)
}

test("a message's Remind me… opens beside its menu, and a time saves the reminder", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const requests = await openChannel(page, testInfo)
  let menu = await messageMenu(page)
  await openSideMenu(page, menu, /Remind me/, "keyboard")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  menu = await messageMenu(page)
  const side = await openSideMenu(page, menu, /Remind me/, "pointer")
  await side.locator('[role="menuitem"]').first().click()
  await expect.poll(() => requests.find((r) => r.path.includes("/later"))?.body).toMatchObject({ item_type: "post", item_id: post(0, MAYA, "").post_uuid })
})

test("a message's Save to memory opens beside its menu, and a kind saves it", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const requests = await openChannel(page, testInfo)
  const menu = await messageMenu(page)
  const side = await openSideMenu(page, menu, /Save to memory/, "pointer")
  await side.getByRole("menuitem", { name: /Decision/ }).click()
  await expect.poll(() => requests.find((r) => r.path.endsWith("/ai/memory/capture"))?.body).toMatchObject({ kind: "decision", channel_uuid: CH })
})

test("the channel header's Notifications opens beside More, by pointer and keyboard, and a choice is sent", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const requests = await openChannel(page, testInfo)
  const more = page.getByRole("button", { name: "More channel actions" })
  let menu = await pressFor(page, more)
  await openSideMenu(page, menu, /^Notifications/, "keyboard")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  menu = await pressFor(page, more)
  const side = await openSideMenu(page, menu, /^Notifications/, "pointer")
  await side.getByRole("menuitemradio", { name: /Mentions and threads/ }).click()
  await expect.poll(() => requests.find((r) => r.path.endsWith("/user/updateUserChannelNotification"))?.body).toMatchObject({ notification_type: "mention" })
})

// ---- the memory page: an item, and two projects to make a task in ----
test("a memory item's Create task in… opens beside its menu, and a project makes the task", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await firstVisit(page)
  const project = (n: number, name: string) => ({ project_uuid: `5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6${n}`, project_name: name, project_is_admin: 1, project_is_member: 1 })
  const projects = [project(1, "Website relaunch"), project(2, "Mobile app")]
  const item = { id: "7d1f2a3b-0000-4000-8000-000000000001", kind: "commitment", content: "Maya writes the rollback steps", status: "open", source_type: "post", confidence: 0.9, created_at: "2026-10-17T09:00:00Z", updated_at: "2026-10-17T09:00:00Z" }
  await stubBackend(page, testInfo, {
    ...AI,
    "/user/sidebarNav": ok({ ...SAM, user_channels: [], user_dms: [], user_projects: projects }),
    "/ai/memory": (url: URL) => (url.pathname.endsWith("/create-task") ? ok({ task_uuid: "t1" }) : ok({ items: [item], counts: { commitment: 1 } })),
  })
  const requests = sent(page)
  await page.goto("/app/ai/memory", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const row = page.getByText("Maya writes the rollback steps").first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.hover()
  await page.getByRole("button", { name: "More actions" }).first().click()
  const menu = await openMenu(page)
  await openSideMenu(page, menu, /Create task in/, "pointer")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await row.hover()
  await page.getByRole("button", { name: "More actions" }).first().click()
  const again = await openSideMenu(page, await openMenu(page), /Create task in/, "keyboard")
  await again.getByRole("menuitem", { name: "Mobile app" }).click()
  await expect.poll(() => requests.find((r) => r.path.endsWith(`/ai/memory/${item.id}/create-task`))?.body).toMatchObject({ project_uuid: projects[1].project_uuid })
})

// ---- a doc, with Priya on it ----
const DOC = "0b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e60"
async function openDoc(page: Page, testInfo: TestInfo) {
  await firstVisit(page)
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch notes", doc_body: "<p>The plan.</p>", edit: true }),
    "/auth/token": { data: { token: "e2e-sam" } },
    [`/doc/access/${DOC}`]: {
      data: {
        doc_uuid: DOC,
        level: "full",
        owner: true,
        lock: "",
        locked: false,
        can_share: true,
        can_lock_soft: true,
        can_lock_hard: true,
        sharing: { owner: SAM, people: [{ ...PRIYA, level: "edit" }], teams: [], general: { private: true, level: "view" }, everyone: "none" },
      },
    },
    "/doc/access/update": { data: { effects: [], pages: 1, lose: 0, gain: 0, change: 1, summary: "" } },
    // The share dialog's other reads, answered empty (a "Not found" toast covered a row).
    "/doc/access/requests": { data: { incoming: [], outgoing: [] } },
    "/team/teamListByUserUID": { data: [], has_more: false },
    "/guest/links": { data: [] },
    "/follows": ok({ resource_kind: "doc", resource_uuid: DOC, mode: "all", chosen: false, default: "all" }),
  })
  const requests = sent(page)
  await new CollabRelay().attach(page, SAM.user_full_name)
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(".doc-editor .ProseMirror")).toBeVisible({ timeout: 60_000 })
  return requests
}

test("the doc's Notifications opens beside More, and a mode is followed", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const requests = await openDoc(page, testInfo)
  // The page's actions register as their chunk loads: open More until it has them.
  const menu = page.locator("[data-doc-more-menu]")
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole("button", { name: "More doc actions" }).click()
    const found = await menu.getByRole("menuitem", { name: /^Notifications/ }).isVisible()
    if (!found) await page.keyboard.press("Escape")
    expect(found).toBe(true)
  }).toPass({ timeout: 30_000 })
  const side = await openSideMenu(page, menu, /^Notifications/, "pointer")
  await side.getByRole("menuitemradio", { name: /Replies and mentions/ }).click()
  await expect.poll(() => requests.find((r) => r.method === "PUT" && r.path.endsWith("/follows"))?.body).toMatchObject({ resource_uuid: DOC, mode: "mentions" })
})

test("the share dialog's Access ends opens beside a person's level, and a time ends the grant", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const requests = await openDoc(page, testInfo)
  await page.locator("[data-doc-share]").click()
  const dialog = page.locator("[data-share-dialog]")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: /^priya.*: Can edit$/i }).click()
  let menu = await openMenu(page)
  await openSideMenu(page, menu, /Access ends/, "keyboard")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: /^priya.*: Can edit$/i }).click()
  menu = await openMenu(page)
  const side = await openSideMenu(page, menu, /Access ends/, "pointer")
  await side.getByRole("menuitem", { name: "In 7 days" }).click()
  await expect.poll(() => (requests.find((r) => r.path.endsWith("/doc/access/update"))?.body as { adds?: { uuid: string; until?: string }[] } | undefined)?.adds?.[0]).toMatchObject({ uuid: PRIYA.user_uuid, until: expect.any(String) })
})
