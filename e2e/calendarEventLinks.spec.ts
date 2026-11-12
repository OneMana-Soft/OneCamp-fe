import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { reviewShot, SAM, SHOT_THEMES, TASK_PANEL_READS, stubBackend, withStatus } from "./stubbedApp"
import { showsFocusRing, tabOnto } from "./focusRing"
import { animationsSettled } from "./settled"
import { demoBuild } from "./demoBuild"

// EVLINK head B (gcal-15: events, tasks, docs and calls linked in one place): an event's Linked row takes a doc, a
// board or a task through the one entity-link search; the chips are named by the reader's own read; a task's chip
// opens the task as the app does (the task panel on a computer, its own page on a phone); unlinking sends the soft
// delete. The server carries to each reader only what they may open, so there is no locked chip to draw. Its own
// states: a link the server refuses at Save, the adds while offline, and a chip reached by Tab (DESIGN-BUILD-141's F1).
// A result in the search is named by its title and its kind ("Book the venue task"), the word the relation picker
// writes (F2).

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number) => new Date(2026, 9, day, h).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
const DOC = "9d1c0000-0000-4000-8000-000000000001"
const TASK = "9d1c0000-0000-4000-8000-0000000000a1"
const PROJECT = "9d1c0000-0000-4000-8000-0000000000b1"

const listed = () => ({
  event_uuid: LAUNCH,
  event_title: "Launch review",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_created_by: ME,
  event_participants: [],
  event_reminders: [10],
  event_reminders_default: true,
  event_hue: "moss",
})

const apiEvent = (files: { kind: string; uuid: string }[]) => ({
  id: LAUNCH,
  kind: "event",
  title: "Launch review",
  notes: "",
  location: "",
  start: { at: at(21, 14), zone: "Europe/London" },
  end: { at: at(21, 15) },
  all_day: false,
  sequence: 3,
  organiser: { user_uuid: ME.user_uuid },
  attendees: [],
  hue: "moss",
  files,
  transparency: "opaque",
  visibility: "default",
})

const task = { task_uuid: TASK, task_name: "Book the venue", task_status: "todo", task_priority: "medium", task_project: { project_uuid: PROJECT, project_name: "Launch", project_is_admin: true } }
const taskInfo = {
  msg: "ok",
  data: {
    ...task,
    task_label: "",
    task_due_date: "0001-01-01T00:00:00Z",
    task_start_date: "0001-01-01T00:00:00Z",
    task_created_at: "2026-10-01T09:00:00Z",
    task_deleted_at: "0001-01-01T00:00:00Z",
    task_assignee: SAM,
    task_created_by: SAM,
    task_description: "",
    task_sub_tasks: [],
    task_comments: [],
    task_activities: [],
    task_attachments: [],
    task_collaborators: [],
    task_blocked_by: [],
    task_blocks: [],
    task_access: { edit: true, delete: true, comment: true, log_time: true, restrict: true },
  },
}

interface Seen {
  writes: { method: string; url: string; body: unknown }[]
}
const wrote = (seen: Seen, method: string, end: string) => seen.writes.find((w) => w.method === method && w.url.endsWith(end))

/** The server's words when it won't link a thing (business/Calendar ErrFileUnreadable, a 403). */
const UNREADABLE = "You can add only a doc, a board or a task you can open."

/**
 * The week of 21 Oct with one meeting, which links what its writes put on it; the search finds a doc and a task.
 * `refuse` is a thing the server won't link, in its own words.
 */
async function open(page: Page, testInfo: TestInfo, path: string, { refuse }: { refuse?: string } = {}): Promise<Seen> {
  const seen: Seen = { writes: [] }
  let files: { kind: string; uuid: string }[] = []
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    ...TASK_PANEL_READS,
    "/event/getEvents": { msg: "ok", data: [listed()] },
    "/event/getEvent/": { msg: "ok", data: listed() },
    "/calendar/events": (url: URL, request: Request) => {
      const method = request.method()
      if (method !== "GET") seen.writes.push({ method, url: url.pathname, body: method === "DELETE" ? null : request.postDataJSON() })
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
      if (method === "POST" && url.pathname.endsWith("/files")) {
        const f = request.postDataJSON() as { kind: string; uuid: string }
        if (f.uuid === refuse) return withStatus(403, { msg: UNREADABLE })
        files = [...files, { kind: f.kind, uuid: f.uuid }]
      }
      const off = url.pathname.match(/\/files\/(doc|board|task)\/([^/]+)$/)
      if (method === "DELETE" && off) files = files.filter((f) => !(f.kind === off[1] && f.uuid === off[2]))
      return { msg: "ok", data: apiEvent(files) }
    },
    "/entities": (_url: URL, request: Request) => {
      const refs = (request.postDataJSON() as { refs: Array<{ kind: string; id: string }> }).refs
      return {
        msg: "ok",
        data: refs.map((r) =>
          r.id === DOC
            ? { kind: "doc", id: r.id, access: "ok", data: { title: "Launch brief" } }
            : r.id === TASK
              ? { kind: "task", id: r.id, access: "ok", data: { name: "Book the venue", status: "todo", status_name: "To do", done: false, can_edit: true } }
              : { kind: r.kind, id: r.id, access: "gone" },
        ),
      }
    },
    "/search/unifiedSearch": {
      msg: "ok",
      data: {
        page: [
          { type: "task", task: { task_id: TASK, task_name: "Book the venue", task_project_name: "Launch" } },
          { type: "doc", doc: { doc_uuid: DOC, doc_title: "Launch brief" } },
        ],
        has_more: false,
      },
    },
    [`/task/info/${TASK}`]: taskInfo,
    // What the task panel reads beside the task, and the week's repeats: answered, so no shot carries the stub's toast.
    "/task/milestone/": { msg: "ok", data: null },
    [`/project/${PROJECT}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: true } },
    [`/project/${PROJECT}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${PROJECT}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    [`/project/${PROJECT}/statuses`]: { msg: "ok", data: null },
    [`/project/${PROJECT}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/calendar/repeats": { msg: "ok", data: { checkins: [], tasks: [] } },
    "/restriction": { msg: "ok", data: { task_uuid: TASK, restricted: false, people: [], can_change: true } },
    "/user/preferences": { msg: "ok", data: {} },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/suggestTimes": { msg: "ok", data: { suggestions: [] } },
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return seen
}

/** A toast held still by a pointer on it, whole in the viewport and drawn in full, for a shot. */
async function toastHeld(toast: Locator) {
  await toast.hover()
  await expect(toast).toBeInViewport({ ratio: 1 })
  await animationsSettled(toast, { subtree: true })
}

/**
 * The form's Linked row offline: both adds wait, and the row says so; back online, they come back. With the row's
 * shot in between.
 */
async function offlineAdds(page: Page, row: Locator, theme: string) {
  const add = row.getByRole("button", { name: "Add from OneCamp" })
  const upload = row.getByRole("button", { name: "Upload" })
  await expect(add).toBeEnabled({ timeout: 20_000 })
  await page.context().setOffline(true)
  await expect(add).toBeDisabled({ timeout: 20_000 })
  await expect(upload).toBeDisabled()
  await expect(row.getByText("You're offline. Link a doc, a board or a task once you're back.")).toBeVisible()
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await reviewShot(page, "linked-offline", theme)
  await page.context().setOffline(false)
  await expect(add).toBeEnabled({ timeout: 20_000 })
  await expect(upload).toBeEnabled()
  await expect(row.getByText("You're offline. Link a doc, a board or a task once you're back.")).toHaveCount(0)
}

for (const theme of SHOT_THEMES) {
  test.describe(`an event's Linked row at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("links a task and a doc through the one search, opens the task in its panel, and unlinks it", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const seen = await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const details = async () => {
        await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
        await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
        await expect(page.locator("[data-event-view]")).toBeVisible({ timeout: 20_000 })
      }
      await details()
      // Nothing linked: no Linked section on the event, and the edit's row is its adds alone.
      await expect(page.locator("[data-event-view] [data-event-files]")).toHaveCount(0)
      await page.getByRole("button", { name: "Edit event" }).click()
      const row = page.locator("[data-event-edit] [data-form-files]")
      await expect(row.getByRole("list")).toHaveCount(0)
      const pick = async (name: string, shot?: string) => {
        await row.getByRole("button", { name: "Add from OneCamp" }).click()
        const picker = page.getByRole("dialog", { name: "Add from OneCamp" })
        await picker.getByPlaceholder("Search docs, boards and tasks…").fill("launch")
        await expect(picker.getByRole("button", { name: /^Book the venue task$/i })).toBeVisible({ timeout: 20_000 })
        await expect(picker.getByRole("button", { name: /^Launch brief doc$/i })).toBeVisible()
        if (shot) await reviewShot(page, shot, theme)
        await picker.getByRole("button", { name }).click()
      }
      await pick("Book the venue", "evlink-search")
      await expect(row.getByRole("link", { name: "Task: Book the venue" })).toBeVisible({ timeout: 20_000 })
      await pick("Launch brief")
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "evlink-row", theme)
      await page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }).click()
      await expect.poll(() => seen.writes.filter((w) => w.method === "POST" && w.url.endsWith("/files")).map((w) => w.body), { timeout: 20_000 }).toEqual([
        { kind: "task", uuid: TASK },
        { kind: "doc", uuid: DOC },
      ])

      // Read back: the Linked section names both as the reader's own read does.
      const linked = page.locator("[data-event-view] [data-event-files]")
      await expect(linked.getByRole("heading", { name: "Linked" })).toBeVisible({ timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toBeVisible()
      await expect(linked.getByRole("link", { name: "Task: Book the venue" })).toBeVisible()
      await reviewShot(page, "evlink-read", theme)

      // The task's chip opens the task in the task panel.
      await linked.getByRole("link", { name: "Task: Book the venue" }).click()
      await expect(page.locator("[data-task-panel]")).toBeVisible({ timeout: 30_000 })
      await expect(page.locator("[data-task-panel]").getByText("Book the venue").first()).toBeVisible()
      await reviewShot(page, "evlink-task-open", theme)

      // Unlink the task: the soft delete goes, and only the doc stays.
      await details()
      await page.getByRole("button", { name: "Edit event" }).click()
      await row.getByRole("button", { name: "Remove Book the venue" }).click()
      await expect(row.getByRole("link", { name: "Task: Book the venue" })).toHaveCount(0)
      await page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }).click()
      await expect.poll(() => !!wrote(seen, "DELETE", `/calendar/events/${LAUNCH}/files/task/${TASK}`), { timeout: 20_000 }).toBe(true)
      await expect(linked.getByRole("link", { name: "Task: Book the venue" })).toHaveCount(0, { timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toBeVisible()
    })

    test("a link the server refuses: the event saves, the toast says why, and the panel reads it again without it; Tab reaches the task's chip; offline, the adds wait", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const seen = await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", { refuse: DOC })
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await expect(page.locator("[data-event-view]")).toBeVisible({ timeout: 20_000 })
      await page.getByRole("button", { name: "Edit event" }).click()
      const row = page.locator("[data-event-edit] [data-form-files]")
      for (const name of [/^Book the venue task$/i, /^Launch brief doc$/i]) {
        await row.getByRole("button", { name: "Add from OneCamp" }).click()
        const picker = page.getByRole("dialog", { name: "Add from OneCamp" })
        await picker.getByPlaceholder("Search docs, boards and tasks…").fill("launch")
        await picker.getByRole("button", { name }).click({ timeout: 20_000 })
        await expect(picker).toHaveCount(0)
      }
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }).click()

      // Both were asked for; the doc was refused. The event is saved, its toast says why in the server's words, and
      // the panel, read again, carries the task alone.
      await expect.poll(() => seen.writes.filter((w) => w.method === "POST" && w.url.endsWith("/files")).map((w) => w.body), { timeout: 20_000 }).toEqual([
        { kind: "task", uuid: TASK },
        { kind: "doc", uuid: DOC },
      ])
      const toast = page.locator(".toast-root").filter({ hasText: "Couldn't link it to the event" })
      await expect(toast).toContainText(UNREADABLE, { timeout: 20_000 })
      const linked = page.locator("[data-event-view] [data-event-files]")
      const taskChip = linked.getByRole("link", { name: "Task: Book the venue" })
      await expect(taskChip).toBeVisible({ timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toHaveCount(0)
      await expect(page.locator("[data-event-edit]")).toHaveCount(0)
      await toastHeld(toast)
      await reviewShot(page, "link-refused", theme)

      // The toast closed by its ×, Tab reaches the task's chip, which draws its ring.
      await toast.getByRole("button", { name: "Close notification" }).click()
      await expect(toast).toHaveCount(0, { timeout: 20_000 })
      await tabOnto(page, taskChip)
      await showsFocusRing(page, taskChip, "The task's chip")
      await reviewShot(page, "linked-chip-focus", theme)

      // Offline, the form's adds wait and say so.
      await page.getByRole("button", { name: "Edit event" }).click()
      await expect(row.getByRole("link", { name: "Task: Book the venue" })).toBeVisible({ timeout: 20_000 })
      await offlineAdds(page, row, theme)
    })
  })

  test.describe(`an event's Linked row on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("links a task and a doc from a sheet, opens the task at its page, and unlinks it", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const eventPage = `/app/calendar/event/${LAUNCH}`
      const seen = await open(page, testInfo, eventPage)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("[data-event-files]")).toHaveCount(0)
      await page.getByRole("button", { name: "Edit event" }).tap()
      const row = page.locator("[data-event-edit] [data-form-files]")
      const pick = async (name: string, shot?: string) => {
        await row.getByRole("button", { name: "Add from OneCamp" }).tap({ timeout: 20_000 })
        const sheet = page.locator("[data-files-sheet]")
        await expect(sheet).toBeVisible()
        await expect(sheet.getByText("A doc, a board or a task you can open.")).toBeVisible()
        await sheet.getByPlaceholder("Search docs, boards and tasks…").fill("launch")
        await expect(sheet.getByRole("button", { name: /^Book the venue task$/i })).toBeVisible({ timeout: 20_000 })
        await expect(sheet.getByRole("button", { name: /^Launch brief doc$/i })).toBeVisible()
        if (shot) await reviewShot(page, shot, theme)
        await sheet.getByRole("button", { name }).tap()
        await expect(sheet).toHaveCount(0, { timeout: 20_000 })
      }
      await pick("Book the venue", "evlink-search")
      await expect(row.getByRole("link", { name: "Task: Book the venue" })).toBeVisible({ timeout: 20_000 })
      await pick("Launch brief")
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await row.scrollIntoViewIfNeeded()
      await reviewShot(page, "evlink-row", theme)
      await page.getByRole("button", { name: "Save" }).tap()
      await expect.poll(() => seen.writes.filter((w) => w.method === "POST" && w.url.endsWith("/files")).length, { timeout: 20_000 }).toBe(2)

      const linked = page.locator("[data-event-files]")
      await expect(linked.getByRole("link", { name: "Task: Book the venue" })).toBeVisible({ timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toBeVisible()
      await linked.scrollIntoViewIfNeeded()
      await reviewShot(page, "evlink-read", theme)

      // The task's chip opens the task at its own page, the task panel as a page (app/app/task).
      await linked.getByRole("link", { name: "Task: Book the venue" }).tap()
      await expect(page).toHaveURL(new RegExp(`/app/task/${TASK}$`), { timeout: 30_000 })
      await expect(page.locator("[data-task-page] [data-task-panel]")).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, "evlink-task-open", theme)

      await page.goto(eventPage, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.getByRole("button", { name: "Edit event" }).tap({ timeout: 60_000 })
      await row.getByRole("button", { name: "Remove Book the venue" }).tap({ timeout: 20_000 })
      await page.getByRole("button", { name: "Save" }).tap()
      await expect.poll(() => !!wrote(seen, "DELETE", `/calendar/events/${LAUNCH}/files/task/${TASK}`), { timeout: 20_000 }).toBe(true)
      await expect(linked.getByRole("link", { name: "Task: Book the venue" })).toHaveCount(0, { timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toBeVisible()
    })

    test("a link the server refuses: the event saves, the toast says why, and the page reads it again without it; offline, the adds wait", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const seen = await open(page, testInfo, `/app/calendar/event/${LAUNCH}`, { refuse: DOC })
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      // The demo's banner put away, so the page's foot holds the Linked chips clear of the toast. Only the demo's build
      // draws it (components/banner/DemoSharedNote, NEXT_PUBLIC_DEMO_MODE, as demoBuild reads it): there the tap waits
      // for it however late it comes; a customer's build has none to put away.
      if (demoBuild()) await page.getByRole("button", { name: "Got it" }).tap()
      await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0)
      await page.getByRole("button", { name: "Edit event" }).tap()
      const row = page.locator("[data-event-edit] [data-form-files]")
      for (const name of [/^Book the venue task$/i, /^Launch brief doc$/i]) {
        await row.getByRole("button", { name: "Add from OneCamp" }).tap({ timeout: 20_000 })
        const sheet = page.locator("[data-files-sheet]")
        await sheet.getByPlaceholder("Search docs, boards and tasks…").fill("launch")
        await sheet.getByRole("button", { name }).tap({ timeout: 20_000 })
        await expect(sheet).toHaveCount(0, { timeout: 20_000 })
      }
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await page.getByRole("button", { name: "Save" }).tap()

      await expect.poll(() => seen.writes.filter((w) => w.method === "POST" && w.url.endsWith("/files")).map((w) => w.body), { timeout: 20_000 }).toEqual([
        { kind: "task", uuid: TASK },
        { kind: "doc", uuid: DOC },
      ])
      const toast = page.locator(".toast-root").filter({ hasText: "Couldn't link it to the event" })
      await expect(toast).toContainText(UNREADABLE, { timeout: 20_000 })
      const linked = page.locator("[data-event-files]")
      const taskChip = linked.getByRole("link", { name: "Task: Book the venue" })
      await expect(taskChip).toBeVisible({ timeout: 20_000 })
      await expect(linked.getByRole("link", { name: "Page: Launch brief" })).toHaveCount(0)
      await expect(page.locator("[data-event-edit]")).toHaveCount(0)
      await linked.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await toastHeld(toast)
      // The chip the page kept shows above the toast.
      const [chipBox, toastBox] = [await taskChip.boundingBox(), await toast.boundingBox()]
      expect(chipBox && toastBox && chipBox.y + chipBox.height <= toastBox.y, `the chip ${JSON.stringify(chipBox)} clear of the toast ${JSON.stringify(toastBox)}`).toBe(true)
      await reviewShot(page, "link-refused", theme)

      // The toast closed by its ×, the form's adds offline.
      await toast.getByRole("button", { name: "Close notification" }).tap()
      await expect(toast).toHaveCount(0, { timeout: 20_000 })
      await page.getByRole("button", { name: "Edit event" }).tap({ timeout: 20_000 })
      await expect(row.getByRole("link", { name: "Task: Book the venue" })).toBeVisible({ timeout: 20_000 })
      await offlineAdds(page, row, theme)
    })
  })
}
