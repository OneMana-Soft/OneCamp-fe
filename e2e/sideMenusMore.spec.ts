import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { hoverWhenReachable, openSideMenu, radioChecks } from "./menuReach"
import { SAM, docInfo, stubBackend, type Answers } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { PRIYA } from "./docs/twoPeople"

// The side menus the sweep of 18 Oct 2026 found invisible, each opened on
// its own page from fixtures (UI-REGRESS finding 2; fixed by 623c3b993, which
// portals every side menu): a message's Remind me…, the channel header's
// Notifications, the doc's Notifications and the share dialog's Access ends
// (the AI edition also checks Save to memory and a memory item's Create task in…). Each opens beside
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
  await hoverWhenReachable(row)
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

// A keyboard user with a resting mouse (CHAT-LEAD-25, 24 Oct 2026): the side menu opened by → and closed 30 ms
// later. Opening it made Chrome send the row under the still pointer a pointerout, which a row took for the mouse
// leaving; its menu took the focus back, and the side menu closed (lib/ui/stillPointer).
test("a message's Remind me… opened by keyboard stays open while the mouse rests on another row", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await openChannel(page, testInfo)
  const menu = await messageMenu(page)
  const follow = menu.getByRole("menuitem", { name: /Follow thread/ })
  // The menu settles first (it slides in); then the mouse moves onto the row and rests there.
  await follow.hover()
  await expect(follow).toBeFocused()
  const box = (await follow.boundingBox())!
  const rest = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  await page.mouse.move(rest.x, rest.y)
  const remind = menu.getByRole("menuitem", { name: /Remind me/ })
  // From the row under the mouse to Remind me… by the keys alone; the mouse stays where it is.
  const key = (await remind.boundingBox())!.y < box.y ? "ArrowUp" : "ArrowDown"
  await expect(async () => {
    await page.keyboard.press(key)
    await expect(remind).toBeFocused({ timeout: 200 })
  }).toPass({ timeout: 10_000 })
  // Every time the side menu closes, counted from here on.
  await remind.evaluate((row) => {
    const w = window as unknown as { sideMenuCloses: number }
    w.sideMenuCloses = 0
    new MutationObserver(() => {
      if (row.getAttribute("aria-expanded") === "false") w.sideMenuCloses++
    }).observe(row, { attributes: true, attributeFilter: ["aria-expanded"] })
  })
  await page.keyboard.press("ArrowRight")
  await expect(remind).toHaveAttribute("aria-expanded", "true")
  const side = page.locator(`[id="${await remind.getAttribute("aria-controls")}"]`)
  const rows = side.locator('[role="menuitem"]')
  await expect(rows.first()).toBeFocused()
  // Chrome sends the row under a resting mouse a trusted pointer event when the page changes under it, the
  // mouse unmoved (the probe's trace: a pointerout as the side menu opened). Sent here at the very same place.
  await page.mouse.move(rest.x, rest.y)
  // The next key lands in the side menu, still open.
  await page.keyboard.press("ArrowDown")
  await expect(rows.nth(1)).toBeFocused()
  await expect(remind).toHaveAttribute("aria-expanded", "true")
  expect(await page.evaluate(() => (window as unknown as { sideMenuCloses: number }).sideMenuCloses)).toBe(0)
})

// The other side of lib/ui/stillPointer (CR-31): a mouse that moves is still followed. Its boundary events come
// before the pointermove at its new place, so a real leave never looks still.
// The message menu can still move after it shows (it grows as its rows fill in, and it opens above its button, so it
// rises): a row that slides under a resting mouse rightly takes no highlight, so the mouse moves only once it's at rest.
async function menuAtRest(menu: ReturnType<Page["locator"]>) {
  let was = ""
  await expect
    .poll(async () => {
      const box = JSON.stringify(await menu.boundingBox())
      const rest = box === was
      was = box
      return rest
    }, { intervals: [100] })
    .toBe(true)
}

// Remind me's side menu follows the clock (lib/utils/later reminderChoices): "This evening" only before 16:00, and
// no "Next week" when tomorrow is Monday. The legs that move through it pin the clock, so its rows don't change
// with the day the suite runs. Under four rows (a weekday before 16:00) the unpinned leave below failed here, on the
// AI-free line, where More has no Save to memory row; the pinned clock keeps it off that path.
// Instants on the same day and part of the day in UTC and in Asia/Kolkata.
const SUNDAY_MORNING = "2026-10-25T04:00:00Z" // In 1 hour, This evening, Tomorrow morning
const MONDAY_MORNING = "2026-10-26T04:00:00Z" // and Next week: four rows

/** Maya's More menu at rest under a pinned clock, and Remind me's side menu open by pointer. */
async function remindOpen(page: Page, testInfo: TestInfo, at: string) {
  await page.clock.setFixedTime(new Date(at))
  await openChannel(page, testInfo)
  const menu = await messageMenu(page)
  await menuAtRest(menu)
  // The AI-free edition's More has no Save to memory row, so Follow thread sits a row nearer Remind me.
  await expect(menu.getByRole("menuitem", { name: /Save to memory/ })).toHaveCount(0)
  const remind = menu.getByRole("menuitem", { name: /Remind me/ })
  await remind.hover()
  await expect(remind).toHaveAttribute("aria-expanded", "true")
  return { remind, follow: menu.getByRole("menuitem", { name: /Follow thread/ }) }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a message's menu under a moving mouse, ${theme}`, () => {
    test.use({ colorScheme: theme })

    test("the highlight follows the mouse from row to row", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await openChannel(page, testInfo)
      const menu = await messageMenu(page)
      await menuAtRest(menu)
      const follow = menu.getByRole("menuitem", { name: /Follow thread/ })
      const copy = menu.getByRole("menuitem", { name: /Copy text/ })
      await follow.hover()
      await expect(follow).toBeFocused()
      await expect(follow).toHaveAttribute("data-highlighted", "")
      await copy.hover()
      await expect(copy).toBeFocused()
      await expect(copy).toHaveAttribute("data-highlighted", "")
      await expect(follow).not.toHaveAttribute("data-highlighted", "")
    })

    test("leaving Remind me… for another row closes its side menu", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const { remind, follow } = await remindOpen(page, testInfo, SUNDAY_MORNING)
      // Down to the menu's left edge, in steps.
      const to = (await follow.boundingBox())!
      await page.mouse.move(to.x + 12, to.y + to.height / 2, { steps: 8 })
      await expect(follow).toBeFocused()
      await expect(remind).toHaveAttribute("aria-expanded", "false")
    })

    // With four rows, the path above ends inside the side menu's grace area (Radix keeps the highlight off rows
    // while the mouse heads for an open side menu), and a mouse at rest sends nothing after. Leaving away from the
    // side menu, on whichever side it opened, is a leave at once.
    test("leaving Remind me… away from its four-row side menu closes it", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const { remind, follow } = await remindOpen(page, testInfo, MONDAY_MORNING)
      const side = page.locator(`[id="${await remind.getAttribute("aria-controls")}"]`)
      await expect(side.getByRole("menuitem")).toHaveCount(4)
      const [from, to] = [(await remind.boundingBox())!, (await follow.boundingBox())!]
      const x = (await side.getAttribute("data-side")) === "left" ? from.x + from.width - 12 : from.x + 12
      await page.mouse.move(x, from.y + from.height / 2, { steps: 4 })
      await page.mouse.move(x, to.y + to.height / 2, { steps: 8 })
      await expect(follow).toBeFocused()
      await expect(remind).toHaveAttribute("aria-expanded", "false")
    })
  })
}

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
  await radioChecks(side)
  await side.getByRole("menuitemradio", { name: /Mentions and threads/ }).click()
  await expect.poll(() => requests.find((r) => r.path.endsWith("/user/updateUserChannelNotification"))?.body).toMatchObject({ notification_type: "mention" })
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
  const keyed = await openSideMenu(page, menu, /Access ends/, "keyboard")
  // One layer a press, the innermost first (interaction spec, rule 7): Esc closes
  // the side menu alone and gives Access ends the focus back, the next closes the
  // level menu, and the dialog stays. Radix's Esc closed both menus at once, and
  // the second press closed the dialog unless it came while they faded out.
  await page.keyboard.press("Escape")
  await expect(keyed).toBeHidden()
  await expect(menu).toHaveAttribute("data-state", "open")
  await expect(menu.getByRole("menuitem", { name: /Access ends/ })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: /^priya.*: Can edit$/i }).click()
  menu = await openMenu(page)
  const side = await openSideMenu(page, menu, /Access ends/, "pointer")
  await side.getByRole("menuitem", { name: "In 7 days" }).click()
  await expect.poll(() => (requests.find((r) => r.path.endsWith("/doc/access/update"))?.body as { adds?: { uuid: string; until?: string }[] } | undefined)?.adds?.[0]).toMatchObject({ uuid: PRIYA.user_uuid, until: expect.any(String) })
})
