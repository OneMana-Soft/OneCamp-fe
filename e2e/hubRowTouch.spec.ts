import { expect, test, type Locator, type Page } from "@playwright/test"

import { DOC, inboxWithANotice } from "./inboxNotice"
import { SAM, reviewShotInThemes, stubBackend } from "./stubbedApp"
import { expectTouchSize } from "./touchTarget"

// Interaction audit SH-31, SH-32 (15 Oct 2026) and V-704 (A4 H5, 13 Nov 2026):
// where nothing can hover, a row's tools stay out of sight, out of the tab
// order and out of the accessibility tree, and the row's Actions opens ONE
// drawer of them, each row worded from the tool's own label, which presses the
// tool itself. Every hub list with tools at a phone's width is here: the
// Inbox, Threads, Recordings and Search. Later's tools are pressed from
// the drawer in remindInWords; Home's only tool, Open in split, is a
// computer's (no split view on a phone).

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

/** The row's own tools, named as the drawer words them. */
function toolNames(row: Locator): Promise<string[]> {
  return row
    .locator(".hub-row-tools")
    .evaluate((bar) => [...bar.querySelectorAll<HTMLElement>("a[href], button")].map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim()))
}

/**
 * The row's tools are there but unseen, unreachable by Tab and absent from the
 * accessibility tree; its Actions opens one drawer listing them in their own
 * words, each row a finger tall. Returns their names.
 */
async function openDrawer(page: Page, row: Locator): Promise<string[]> {
  const names = await toolNames(row)
  expect(names.length, "the row has tools").toBeGreaterThan(0)
  const tools = row.locator(".hub-row-tools")
  await expect(tools).toBeHidden()
  await expect(tools.getByRole("button")).toHaveCount(0)
  await expect(tools.getByRole("link")).toHaveCount(0)
  const there = (await tools.getByRole("button", { includeHidden: true }).count()) + (await tools.getByRole("link", { includeHidden: true }).count())
  expect(there, "the tools are in the page, out of the accessibility tree").toBe(names.length)
  const focusable = await tools.evaluate((bar) =>
    [...bar.querySelectorAll<HTMLElement>("a[href], button")].filter((el) => {
      el.focus()
      const took = document.activeElement === el
      el.blur()
      return took
    }).length,
  )
  expect(focusable, "no hidden tool takes the focus").toBe(0)

  await row.getByRole("button", { name: "Actions" }).tap()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  const items = menu.getByRole("menuitem")
  await expect(items).toHaveText(names)
  for (let i = 0; i < names.length; i++) expectTouchSize((await items.nth(i).boundingBox())!.height, `${names[i]}'s height`)
  return names
}

/** Presses a drawer row by its tool's name. */
async function press(page: Page, name: string) {
  await page.getByRole("menu").getByRole("menuitem", { name, exact: true }).tap()
}

test("the Inbox: Actions opens one drawer of the row's tools in their words, and Open opens the doc", async ({ page }, testInfo) => {
  const row = await inboxWithANotice(page, testInfo)
  const names = await openDrawer(page, row)
  expect(names).toContain("Open")
  await press(page, "Open")
  await expect(page).toHaveURL(new RegExp(`/app/doc/${DOC}`), { timeout: 30_000 })
})

test("the Inbox by keyboard on a touch screen: Tab reaches Actions, never a hidden tool, and Enter opens the same drawer", async ({ page }, testInfo) => {
  const row = await inboxWithANotice(page, testInfo)
  const names = await toolNames(row)
  const tools = row.locator(".hub-row-tools")
  const more = row.getByRole("button", { name: "Actions" })
  for (let i = 0; i < 80 && !(await more.evaluate((m) => m === document.activeElement)); i++) {
    await page.keyboard.press("Tab")
    expect(await tools.evaluate((t) => t.contains(document.activeElement)), "Tab never lands on a hidden tool").toBe(false)
  }
  await expect(more).toBeFocused()
  await expect(tools).toBeHidden()
  await page.keyboard.press("Enter")
  const items = page.getByRole("menu").getByRole("menuitem")
  await expect(items).toHaveText(names)
  await expect(items.first()).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(more).toBeFocused()
})

test("Threads: Mark read from the drawer marks the thread read, and the drawer then offers Mark unread", async ({ page }, testInfo) => {
  const ROOT = "0c4a0000-0000-4000-8000-0000000000a1"
  const CHANNEL = "0c4a0000-0000-4000-8000-0000000000c1"
  const thread = (unread: boolean) => ({
    root: ROOT,
    conversation: { kind: "channel", id: CHANNEL },
    place: { name: "engineering" },
    message: { html: "<p>Rollback plan for Friday's release</p>", by: SAM, created_at: ago(180) },
    replies: 2,
    new: unread ? 1 : 0,
    latest: [],
    last_reply_at: ago(4),
    unread,
    follow: "on",
  })
  let read = false
  await stubBackend(page, testInfo, {
    "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
    [`/chat-threads/${ROOT}/read`]: () => {
      read = true
      return { msg: "ok", data: { root: ROOT, read: true } }
    },
    "/chat-threads/unread": () => ({ msg: "ok", data: { unread: read ? 0 : 1 } }),
    "/chat-threads": () => ({ msg: "ok", data: { threads: [thread(!read)], unread: read ? 0 : 1 } }),
  })
  await page.goto("/app/inbox?tab=threads", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const row = page.locator(".hub-row[data-has-tools]").filter({ hasText: "Rollback plan" })
  await expect(row).toBeVisible({ timeout: 60_000 })
  expect(await openDrawer(page, row)).toContain("Mark read")
  await press(page, "Mark read")
  await expect.poll(() => read, { timeout: 20_000 }).toBe(true)
  await expect.poll(() => toolNames(row), { timeout: 20_000 }).toContain("Mark unread")
  expect(await openDrawer(page, row)).toContain("Mark unread")
})

// V-702: a thread lands here once someone replies (the server lists no
// thread without a reply), so the empty tab promises only that.
test("Threads with none to show: the tab says a thread you reply in or follow shows once someone replies", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/chat-threads": { msg: "ok", data: { threads: [], unread: 0 } },
  })
  await page.goto("/app/inbox?tab=threads", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("No threads you follow")).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("A thread you reply in or follow shows here once someone replies.")).toBeVisible()
  await expect(page.getByText(/and it lands here/)).toHaveCount(0)
  await reviewShotInThemes(page, "threads-empty")
})

test("Recordings: Play from the drawer opens the player", async ({ page }, testInfo) => {
  const at = new Date(Date.now() - 3 * 3_600_000)
  await stubBackend(page, testInfo, {
    "/user/recordingList": {
      msg: "ok",
      data: {
        has_more: false,
        recordings: [
          {
            recording_egress_id: "EG_1",
            recording_stared_at: at.toISOString(),
            recording_ended_at: new Date(at.getTime() + 734_000).toISOString(),
            recording_duration: 734,
            recording_size: 12_900_000,
            recording_obj_key: "",
            recording_transcript: [],
            recording_started_by: SAM,
            recording_channel: { ch_uuid: "c4a10000-0000-4000-8000-0000000000f1", ch_name: "engineering" },
          },
        ],
      },
    },
  })
  await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const row = page.locator(".hub-row[data-has-tools]").first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  expect(await openDrawer(page, row)).toContain("Play")
  await press(page, "Play")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 })
})

test("Search: Copy link from the drawer copies the result's link", async ({ page }, testInfo) => {
  const id = (n: number) => `${n.toString(16).padStart(8, "0")}-6b7c-4d8e-9f0a-1b2c3d4e5f60`
  await page.addInitScript(() => {
    const copied: string[] = []
    Object.assign(window, { __copied: copied })
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copied.push(t), readText: async () => copied.at(-1) ?? "" } })
  })
  await stubBackend(page, testInfo, {
    "/query/search": (_url: URL, request: { postDataJSON(): unknown }) => ({
      data: {
        page: [{ type: "doc", doc: { doc_uuid: id(1), doc_title: "Budget review", created_date: 1791614952 } }],
        totals: { doc: 1 },
        total: 1,
        has_more: false,
        notes: [],
        query: { runs: true, issues: [], text: (request.postDataJSON() as { q: string }).q },
      },
    }),
  })
  await page.goto("/app/search?query=budget", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const row = page.locator(".hub-row[data-has-tools]").filter({ has: page.locator(`[data-search-result][href="/app/doc/${id(1)}"]`) })
  await expect(row).toBeVisible({ timeout: 60_000 })
  expect(await openDrawer(page, row)).toContain("Copy link")
  await press(page, "Copy link")
  await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied), { timeout: 20_000 }).toEqual([expect.stringMatching(new RegExp(`/app/doc/${id(1)}$`))])
})
