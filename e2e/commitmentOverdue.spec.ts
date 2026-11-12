import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { AI_ON, AI_READS, SAM, SHOT_THEMES, expectEveryCallAnswered, mqttConfig, reviewShot, stubBackend, tidy } from "./stubbedApp"

// C11 (V-581, the owner's Home, 5 Nov 2026): Home said "1 task overdue" for a
// commitment the AI had captured, led it with a task's glyph, and its Done
// went to the task list and failed. The server lists a commitment on Home
// only while it needs its person now (commitmentNeedsMeNow: overdue for at
// most 14 days) and marks an older one `stale`, for the memory page to ask
// about. Here, on a computer and a phone with touch: Home's line says the
// commitment apart from the task, its row is a commitment's with its date and
// its memory item, and Done resolves that item; a June commitment is not on
// Home, and the memory page asks "Still relevant?" of it alone, Done
// resolving it and Drop deleting it (soft, on the server) after the Undo's while,
// and New date opening the row's own date picker (a sheet on a phone): a day
// ahead is no longer stale (DESIGN-BUILD-118 F2). The commitment's mark is a
// kind's, not a done task's check (F1), and G1's shots show the row, Done's
// Undo and the three answers.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const NOW = new Date()
const daysAgo = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
/** The chip's day, as the app says one (lib/utils/date/dateWords shortDate). */
const said = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === NOW.getFullYear() ? "" : ` ${d.getFullYear()}`}`

const TASK = "7a5c00e3-0000-4000-8000-0000000000c1"
const RECENT = { id: "6c0d0000-0000-4000-8000-000000000001", content: "Send the vendor shortlist to Priya", due: daysAgo(3) }
const JUNE = { id: "6c0d0000-0000-4000-8000-000000000002", content: "Send the June board pack", due: new Date(NOW.getFullYear(), 5, 8) }
const JUNE2 = { id: "6c0d0000-0000-4000-8000-000000000003", content: "Book the offsite venue", due: new Date(NOW.getFullYear(), 5, 12) }

/** "What needs me now" as the server answers it: the June ones are stale, so not here. */
const ATTENTION = {
  enabled: true,
  counts: {},
  items: [
    { source: "task", kind: "Overdue task", title: "Write the launch announcement", context: "Q4 launch", due_time: daysAgo(2).toISOString(), url: `/app/task/${TASK}`, priority: 1, ref_id: TASK },
    { source: "commitment", kind: "Overdue commitment", title: RECENT.content, subtitle: `Was due ${ymd(RECENT.due)} · #launch`, url: `/app/ai/memory?item=${RECENT.id}`, due_at: ymd(RECENT.due), priority: 2 },
  ],
}

const memory = (m: { id: string; content: string; due: Date }, stale: boolean) => ({
  id: m.id,
  kind: "commitment",
  content: m.content,
  status: "open",
  due_at: ymd(m.due),
  ...(stale ? { stale: true } : {}),
  source_type: "post",
  confidence: 0.9,
  created_at: "2026-06-01T09:00:00Z",
  updated_at: "2026-06-01T09:00:00Z",
})

type Sent = { method: string; path: string; body: unknown }

async function open(page: Page, testInfo: TestInfo, path: string) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await stubBackend(page, testInfo, {
    ...AI_ON,
    ...AI_READS,
    "/config/mqttConfig": mqttConfig([`user/${SAM.user_uuid}`]),
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
    "/activity/unified": { msg: "ok", data: { has_more: false, activities: [] } },
    "/user/sidebarNav": { msg: "ok", data: { user_total_unread_activity_count: 0 } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
    "/event/getEvents": { msg: "ok", data: [] },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/work/changes": { msg: "ok", data: { entries: [], cursor: "" } },
    "/ai/attention": { msg: "ok", data: ATTENTION },
    // The memory page's Open list, and its writes: a status, a delete.
    "/ai/memory": (_url: URL, request: { method(): string }) =>
      request.method() === "GET" ? { msg: "ok", data: { items: [memory(JUNE, true), memory(JUNE2, true), memory(RECENT, false)], counts: { commitment: 3 } } } : { msg: "ok", data: {} },
  })
  const sent: Sent[] = []
  page.on("request", (r) => {
    if (r.method() === "GET" || r.method() === "OPTIONS") return
    const url = new URL(r.url())
    let body: unknown = null
    try {
      body = r.postDataJSON()
    } catch {
      body = r.postData()
    }
    sent.push({ method: r.method(), path: url.pathname, body })
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return sent
}

const press = (l: Locator, phone: boolean) => (phone ? l.tap() : l.click())

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

/** Inside the page's width, and at least 44px under a finger (the touch target rule). */
async function withinReach(page: Page, l: Locator) {
  const box = (await l.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
}

/** On screen and on top: what a finger at its middle meets is it, not a bar over it. */
async function onTop(l: Locator) {
  expect(await l.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !!hit && el.contains(hit)
  }), "nothing over it").toBe(true)
}

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`an overdue commitment at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      test.setTimeout(180_000)

      test("Home says it apart from the task, as a commitment's row, and Done resolves its memory item", async ({ page }, testInfo) => {
        const sent = await open(page, testInfo, "/app/home")
        await tidy(page)
        const row = page.locator('[data-needs-kind="due"]').filter({ hasText: RECENT.content })
        await expect(row).toBeVisible({ timeout: 60_000 })
        const glance = page.locator("[data-glance]").first()
        await expect(glance).toContainText("1 task overdue")
        await expect(glance).toContainText("1 commitment overdue")
        await expect(glance.getByRole("link", { name: "1 commitment" })).toHaveAttribute("href", "#needs-due")
        await expect(row).toContainText(`Commitment · was due ${said(RECENT.due)}`)
        await expect(row.locator("[data-commitment]")).toHaveCount(1)
        await expect(row.locator("[data-status-glyph]")).toHaveCount(0)
        await expect(row.getByRole("link", { name: "Open" })).toHaveAttribute("href", `/app/ai/memory?item=${RECENT.id}`)
        // The stale ones are the memory page's, never Home's.
        await expect(page.getByText(JUNE.content)).toHaveCount(0)
        await noSideScroll(page)
        await reviewShot(page, "commitment-home", theme)

        // G1: the row itself in view (at 390 it sat under the bottom bar): its
        // kind's mark (not a status glyph), its chip, and Done in reach.
        await row.evaluate((el) => el.scrollIntoView({ block: "center" }))
        if (!phone) await row.hover()
        const done = row.getByRole("button", { name: "Done" })
        await withinReach(page, done)
        await onTop(done)
        await expect(row.locator("[data-commitment]")).toHaveClass(/lucide-handshake/)
        await reviewShot(page, "commitment-home-row", theme)
        await press(done, phone)
        await expect.poll(() => sent.find((s) => s.path.endsWith(`/ai/memory/${RECENT.id}/status`))?.body, { timeout: 15_000 }).toEqual({ status: "resolved" })
        await expect(row).toHaveCount(0)
        // G1: Done's Undo, the row gone and the shared toast holding Undo.
        await expect(page.getByRole("button", { name: "Undo" })).toBeVisible()
        await reviewShot(page, "commitment-home-undo", theme)
        await expect(glance).not.toContainText("commitment")
        await expect(glance).toContainText("1 task overdue")
        expect(sent.filter((s) => s.path.includes("/task/")), "never the task list's endpoint").toEqual([])
        await expectEveryCallAnswered(page)
      })

      test("the memory page asks Still relevant? of a stale one alone: Done resolves it, Drop deletes it", async ({ page }, testInfo) => {
        const sent = await open(page, testInfo, "/app/ai/memory")
        await tidy(page)
        const rowOf = (text: string) => page.locator("li").filter({ hasText: text })
        await expect(rowOf(JUNE.content)).toBeVisible({ timeout: 60_000 })
        await expect(page.getByText("Still relevant?")).toHaveCount(2)
        await expect(rowOf(RECENT.content).getByText("Still relevant?")).toHaveCount(0)
        const june = rowOf(JUNE.content)
        const drop = rowOf(JUNE2.content).getByRole("button", { name: "Drop" })
        await withinReach(page, june.getByRole("button", { name: "Done" }))
        await withinReach(page, drop)
        await withinReach(page, june.getByRole("button", { name: "New date" }))
        // Done, New date and Drop keep to one line (at 390, Drop alone once wrapped under Done).
        const [a, n, b] = await Promise.all(["Done", "New date", "Drop"].map((name) => june.getByRole("button", { name }).boundingBox()))
        expect(Math.abs(a!.y - n!.y), "Done and New date on one line").toBeLessThan(1)
        expect(Math.abs(a!.y - b!.y), "Done and Drop on one line").toBeLessThan(1)
        await noSideScroll(page)
        await reviewShot(page, "commitment-still-relevant", theme)

        await press(june.getByRole("button", { name: "Done" }), phone)
        await expect(june).toHaveCount(0)
        // A second action commits the first at once (one Undo at a time); the
        // Drop waits out its own Undo.
        await press(drop, phone)
        await expect(rowOf(JUNE2.content)).toHaveCount(0)
        await expect.poll(() => sent.find((s) => s.path.endsWith(`/ai/memory/${JUNE.id}/status`))?.body, { timeout: 15_000 }).toEqual({ status: "resolved" })
        await expect.poll(() => sent.find((s) => s.method === "DELETE" && s.path.endsWith(`/ai/memory/${JUNE2.id}`)), { timeout: 15_000 }).toBeTruthy()
        expect(sent.filter((s) => s.path.includes(RECENT.id)), "the recent one is left alone").toEqual([])
        await expectEveryCallAnswered(page)
      })

      test("New date opens the row's own date picker, and a day ahead stops the question", async ({ page }, testInfo) => {
        const sent = await open(page, testInfo, "/app/ai/memory")
        await tidy(page)
        const june = page.locator("li").filter({ hasText: JUNE.content })
        await expect(june.getByText("Still relevant?")).toBeVisible({ timeout: 60_000 })
        await press(june.getByRole("button", { name: "New date" }), phone)
        // The row's one DateProperty: its trigger says it is open (a popover here, a sheet on a phone).
        await expect(june.getByRole("button", { name: /^Due: / })).toHaveAttribute("aria-expanded", "true")
        const tomorrow = page.getByRole("button", { name: "Tomorrow" })
        await expect(tomorrow).toBeVisible()
        await withinReach(page, tomorrow)
        await reviewShot(page, "commitment-new-date", theme)
        await press(tomorrow, phone)
        await expect.poll(() => sent.find((s) => s.path.endsWith(`/ai/memory/${JUNE.id}/due`))?.body, { timeout: 15_000 }).toEqual({ due: ymd(daysAgo(-1)) })
        await expect(june.getByText("Still relevant?")).toHaveCount(0)
        await expect(june).toBeVisible()
        expect(sent.filter((s) => s.path.includes(`${JUNE.id}/status`) || s.method === "DELETE"), "neither resolved nor deleted").toEqual([])
        await noSideScroll(page)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
