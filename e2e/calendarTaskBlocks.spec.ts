import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { animationsSettled } from "./settled"
import { reviewShot, SAM, stubBackend, withStatus } from "./stubbedApp"

// gcal-new-task-blocks (B1): time on the grid for a task. A block is drawn
// with its task's glyph and in its project's hue; a task in the all-day lane
// carried onto the hours blocks an hour of its time there, through the one
// create. A slot's quick create (and, on a phone, the form) blocks time for a
// task picked from your tasks, and a block's card opens its task. With
// SHOTS_DIR set, the week with a block, the carry and quick create's Task are
// saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
const BLOCK = {
  event_uuid: "b-brief",
  event_title: "Write the brief",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_task: { task_uuid: "t-brief", task_name: "Write the brief", task_status: "in_progress", project_uuid: "p-launch", project_name: "Launch" },
}
const PLAN = { task_uuid: "t-plan", task_name: "Plan the launch", task_due_date: at(22, 17), task_status: "todo", task_project: { project_uuid: "p-launch" } }
// The calendar's Tasks list (T1): your open tasks, one with an estimate, one waiting on an open task.
const WAITS = { task_uuid: "t-copy", task_name: "Write the pricing copy", task_status: "todo", task_blocked_open: 1, task_project: { project_uuid: "p-launch", project_name: "Launch" } }
const OPEN = [{ ...PLAN, task_estimate_minutes: 45, task_project: { project_uuid: "p-launch", project_name: "Launch" } }, WAITS]
// A block whose task waits on "Design review".
const WAITING = {
  event_uuid: "b-copy",
  event_title: "Write the pricing copy",
  event_start_time: at(21, 8),
  event_end_time: at(21, 9),
  event_task: { task_uuid: "t-copy", task_name: "Write the pricing copy", task_status: "todo", project_uuid: "p-launch", project_name: "Launch", task_blocked_open: 1, task_blocked_by: [{ task_uuid: "t-design", task_name: "Design review" }] },
  // Sam's own: the panel and the event's page edit only their organiser's events.
  event_created_by: { user_uuid: SAM.user_uuid },
}
// A block whose task waits on two tasks the reader can't read: the server names none of them, so it says how many.
const HIDDEN = {
  event_uuid: "b-hidden",
  event_title: "Ship the pricing page",
  event_start_time: at(21, 12),
  event_end_time: at(21, 13),
  event_task: { task_uuid: "t-ship", task_name: "Ship the pricing page", task_status: "todo", project_uuid: "p-launch", project_name: "Launch", task_blocked_open: 2, task_blocked_by: [] },
  event_created_by: { user_uuid: SAM.user_uuid },
}
// The block the Tasks list's Block time makes (its create answers b-new), as its page reads it.
const MADE = {
  event_uuid: "b-new",
  event_title: "Plan the launch",
  event_start_time: at(21, 11),
  event_end_time: at(21, 11, 45),
  event_task: { task_uuid: "t-plan", task_name: "Plan the launch", task_status: "todo", project_uuid: "p-launch", project_name: "Launch" },
  event_created_by: { user_uuid: SAM.user_uuid },
}
/** How the Tasks list's stubs answer: the reader's projects (none: a guest or a visitor), the open tasks (or a failed read), the create, and the week's events. */
interface Lists {
  member?: boolean
  open?: unknown[]
  openFails?: boolean
  createFails?: boolean
  events?: { event_uuid: string }[]
  /** The page's clock: Wednesday 21 Oct at 10:00 unless a test pins another. */
  now?: Date
  /**
   * Your free time as the engine finds it in the window it is asked about:
   * today at 11:00 (unless set), Monday 26 Oct at 9:00 only when the window
   * reaches it (a Saturday's next working day, V-775), or none at all.
   */
  free?: "monday" | "none"
}
// Saturday 24 Oct 2026, 10:00: the weekend, with no working hours left before Monday.
const SATURDAY = new Date(2026, 9, 24, 10, 0)

async function open(page: Page, testInfo: TestInfo, posted: unknown[] = [], opened: string[] = [], lists: Lists = {}) {
  await page.clock.setFixedTime(lists.now ?? NOW)
  // The first run's "Three keys worth knowing" tip, seen: it would cover the grid's corner in the shots (DESIGN-BUILD-125).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const events = () => lists.events ?? [BLOCK, WAITING]
  await stubBackend(page, testInfo, {
    // The calendar keeps its own events: blocks can be made.
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    // The task a block's card opens (the panel asks for it).
    "/task/info": (url: URL) => {
      opened.push(url.pathname)
      return withStatus(404, { msg: "Not in this test" })
    },
    "/event/getEvents": () => ({ msg: "ok", data: events() }),
    // One event, as its panel or its page reads it.
    "/event/getEvent/": (url: URL) => {
      // The block made here is read back at the time its create asked for, as the server keeps it.
      const ask = posted.at(-1) as { start?: { at: string }; end?: { at: string } } | undefined
      const made = ask?.start && ask.end ? { ...MADE, event_start_time: ask.start.at, event_end_time: ask.end.at } : MADE
      const event = [...events(), made].find((e) => e.event_uuid === url.pathname.split("/").pop())
      return event ? { msg: "ok", data: event } : withStatus(404, { msg: "Not in this test" })
    },
    // The range read (the grid's tasks), and the Tasks list's open=1 read.
    "/user/assignedTaskList": (url: URL) => {
      if (url.searchParams.get("open") !== "1") return { msg: "ok", data: { user_tasks: [PLAN] } }
      return lists.openFails ? withStatus(500, { msg: "The tasks are having a moment" }) : { msg: "ok", data: { user_tasks: lists.open ?? OPEN } }
    },
    // The reader's projects: the Tasks list is for a member of one.
    "/user/sidebarNav": { msg: "ok", data: lists.member ? { user_projects: [{ project_uuid: "p-launch", project_name: "Launch" }] } : {} },
    // Your next free time: today at 11:00; or Monday's 9:00 when the ask reaches Monday; or none.
    "/event/suggestTimes": (_url: URL, request: { postDataJSON(): unknown }) => {
      const asked = request.postDataJSON() as { to: string }
      const monday = lists.free === "monday" && Date.parse(asked.to) >= Date.parse(at(26, 9, 45))
      const free = lists.free === undefined ? [{ start: at(21, 11), end: at(21, 11, 45) }] : monday ? [{ start: at(26, 9), end: at(26, 9, 45) }] : []
      return { msg: "ok", data: { suggestions: free.map((f) => ({ ...f, free: [], reason: "You're free" })) } }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/calendar/events": (url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      // One event by the calendar's API isn't kept here: the panel and the page edit it as /event/getEvent reads it.
      if (request.method() !== "POST") return /^\/calendar\/events\/[^/]+$/.test(url.pathname) ? withStatus(404, { msg: "Not in this test" }) : { msg: "ok", data: [] }
      posted.push(request.postDataJSON())
      if (lists.createFails) return withStatus(500, { msg: "The calendar is having a moment" })
      return { data: { id: "b-new", kind: "task_block", title: "Plan the launch" } }
    },
  })
  await week(page)
}

/** The week of 21 Oct 2026, drawn. */
async function week(page: Page) {
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
}

/** A shot in each theme asked for, the page switched to it; with a toast, the toast held and at rest in each. */
async function shotIn(page: Page, name: string, themes: readonly ("light" | "dark")[], toast?: Locator) {
  for (const theme of themes) {
    await page.emulateMedia({ colorScheme: theme })
    if (toast) await toastAtRest(toast)
    await reviewShot(page, name, theme)
  }
}

/**
 * A toast held by a pointer on it, whole in the viewport, fully drawn and moving no more (DESIGN-BUILD-128's re-look
 * F2: a phone's light frame was shot without its toast, the dark one with it). Its entrance runs on the card inside
 * it, so the card's opacity is read too, and a hover alone doesn't hold a toast still on its way in.
 */
async function toastAtRest(toast: Locator) {
  await toast.hover()
  await expect(toast).toBeInViewport({ ratio: 1 })
  await expect
    .poll(() => toast.evaluate((el) => [el, el.querySelector(".toast-card")].every((e) => !e || getComputedStyle(e).opacity === "1")), { message: "the toast, drawn whole" })
    .toBe(true)
  await animationsSettled(toast, { subtree: true })
}

const press = (target: Locator, phone: boolean) => (phone ? target.tap() : target.click())

/**
 * A waiting block's card and its form (DESIGN-BUILD-125's F2a): the first task
 * it waits on by name, or how many when the reader can read none of them.
 * A computer edits in the panel beside the grid, a phone at the event's page.
 */
async function waitsSaid(page: Page, phone: boolean, themes: readonly ("light" | "dark")[]) {
  const cases = [
    ["b-copy", "Waiting on Design review", "task-block-waits"],
    ["b-hidden", "Waiting on 2 tasks", "task-block-waits-count"],
  ] as const
  for (const [uuid, words, shot] of cases) {
    const block = page.locator(`[data-hue-block="block"][data-event-uuid="${uuid}"]`)
    await block.scrollIntoViewIfNeeded()
    await press(block, phone)
    // The card: beside the block on a computer, a sheet on a phone.
    const card = page.locator(phone ? "[data-event-sheet]" : "[data-event-popover]")
    await expect(card.locator("[data-block-waits]")).toContainText(words, { timeout: 15_000 })
    await shotIn(page, `${shot}-card`, themes)
    await press(card.getByRole("button", { name: "Edit event" }), phone)
    const said = page.locator("[data-event-form] [data-block-waits]")
    await expect(said).toContainText(words, { timeout: 30_000 })
    await said.scrollIntoViewIfNeeded()
    await shotIn(page, `${shot}-form`, themes)
    await week(page)
  }
}

/** The Tasks list's failed read, said once, and then (Try again) an empty list (DESIGN-BUILD-125's F2c), in both themes. */
async function failedThenEmpty(page: Page, testInfo: TestInfo, phone: boolean) {
  const lists: Lists = { member: true, open: [], openFails: true }
  await open(page, testInfo, [], [], lists)
  await press(page.getByRole("button", { name: "Tasks", exact: true }), phone)
  const list = page.locator("[data-calendar-tasks]")
  await expect(list.getByRole("alert")).toContainText("Couldn't load your tasks.", { timeout: 30_000 })
  await page.waitForTimeout(1_500)
  await expect(page.getByText("Couldn't load your tasks.")).toHaveCount(1)
  await expect(page.getByText("The tasks are having a moment")).toHaveCount(0)
  await shotIn(page, "task-list-failed", ["light", "dark"])
  lists.openFails = false
  await press(list.getByRole("button", { name: "Try again" }), phone)
  await expect(list).toContainText("No open tasks", { timeout: 30_000 })
  await expect(page.getByText("Couldn't load your tasks.")).toHaveCount(0)
  await shotIn(page, "task-list-empty", ["light", "dark"])
}

/**
 * V-775, on a Saturday: Block time asks through the next working day, so it
 * finds Monday; with no free time there either it says so as news (the info
 * toast, never a success's look), and the phone's list no longer promises
 * "today or tomorrow". A computer blocks from a row's menu, a phone from its
 * drawer's button.
 */
async function weekend(page: Page, testInfo: TestInfo, phone: boolean, free: "monday" | "none") {
  const posted: unknown[] = []
  await open(page, testInfo, posted, [], { member: true, now: SATURDAY, free })
  await press(page.getByRole("button", { name: "Tasks", exact: true }), phone)
  const list = page.locator("[data-calendar-tasks]")
  if (phone) {
    const row = list.getByRole("button", { name: /^Plan the launch/ })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(list).toContainText("Pick a task, then block your next free time for it.")
    await expect(list).not.toContainText("today or tomorrow")
    await row.tap()
    await list.getByRole("button", { name: "Block time" }).tap()
  } else {
    const more = page.getByRole("button", { name: "More for Plan the launch" })
    await expect(more).toBeVisible({ timeout: 30_000 })
    await more.click()
    await page.getByRole("menuitem", { name: "Block time" }).click()
  }
  if (free === "monday") {
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
    const body = posted[0] as { task_uuid: string; start: { at: string }; end: { at: string } }
    expect([body.task_uuid, body.start.at, body.end.at]).toEqual(["t-plan", at(26, 9), at(26, 9, 45)])
    // Monday is off this week's screen, so the toast names the day, as a move's does (DESIGN-BUILD-128's re-look F1).
    const done = page.locator(".toast-root").filter({ hasText: "Time blocked for “Plan the launch”" })
    await expect(done).toHaveCount(1, { timeout: 15_000 })
    // The exact words dayAndTime writes: a no-break space before AM (lib/utils/date/clock.ts, one spacing everywhere).
    // A regex, because a string would have its spaces evened out before the match.
    await expect(done).toContainText(/Mon 26 Oct, 9:00\u00a0AM – 9:45\u00a0AM/)
    // A phone opens the block it made for adjusting: on Monday, where the toast says.
    if (phone) await expect(page.locator("[data-event-form]")).toContainText("Mon 26 Oct", { timeout: 30_000 })
    await shotIn(page, phone ? "task-list-monday-phone" : "task-list-monday", ["light", "dark"], done)
    return
  }
  const said = page.locator(".toast-root").filter({ hasText: "No free time in the next few days" })
  await expect(said).toHaveCount(1, { timeout: 15_000 })
  await expect(said).toHaveAttribute("data-tone", "info")
  expect(posted).toHaveLength(0)
  // A pointer on the toast holds it while both themes are shot.
  await shotIn(page, phone ? "task-list-no-free-phone" : "task-list-no-free", ["light", "dark"], said)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`task blocks at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("draws a block with its task's state, and blocks a task's time where it is carried", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      const posted: unknown[] = []
      await open(page, testInfo, posted)
      // The block: its task's glyph (in progress) in the task's project's hue.
      const block = page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]')
      await expect(block).toBeVisible({ timeout: 30_000 })
      await expect(block.locator('[data-status-glyph="progress"]')).toHaveCount(1)
      await reviewShot(page, "task-block", theme)

      // Carry "Plan the launch" from Thursday's lane onto Thursday at 11:00.
      const chip = page.locator('[data-all-day-rail] [aria-label^="Task: Plan the launch"]')
      await expect(chip).toBeVisible()
      const from = (await chip.boundingBox())!
      const thursday = page.locator('[data-day-col="3"]')
      await thursday.scrollIntoViewIfNeeded()
      const col = (await thursday.boundingBox())!
      const hour = col.height / 24
      const scroller = (await page.locator("[data-time-grid-scroll]").boundingBox())!
      const top = await page.locator("[data-time-grid-scroll]").evaluate((el) => el.scrollTop)
      const target = { x: col.x + col.width / 2, y: Math.max(scroller.y + 20, col.y + 11 * hour) }
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((target.x - from.x) * i) / 8, from.y + ((target.y - from.y) * i) / 8)
      await expect(page.locator('[data-day-col="3"] [data-calendar-ghost]')).toContainText("Plan the launch")
      await reviewShot(page, "task-block-carry", theme)
      await page.mouse.up()
      await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
      const body = posted[0] as { kind: string; task_uuid: string; start: { at: string }; end: { at: string } }
      expect([body.kind, body.task_uuid]).toEqual(["task_block", "t-plan"])
      const start = new Date(body.start.at)
      expect([start.getDate(), (new Date(body.end.at).getTime() - start.getTime()) / 60000]).toEqual([22, 60])
      expect(top).toBeGreaterThanOrEqual(0)
      await expect(page.locator("[data-calendar-ghost]")).toHaveCount(0)
    })

    test("blocks a slot's time for a task from quick create, and a block's card opens its task", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      const posted: unknown[] = []
      const opened: string[] = []
      await open(page, testInfo, posted, opened)
      await expect(page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]')).toBeVisible({ timeout: 30_000 })
      // Thursday at 4 PM, an empty slot, pressed.
      const thursday = page.locator('[data-day-col="3"]')
      const col = (await thursday.boundingBox())!
      const hour = col.height / 24
      await page.mouse.click(col.x + col.width / 2, col.y + 16 * hour + hour / 4)
      const card = page.locator("[data-quick-create]")
      await expect(card).toBeVisible()
      await card.getByRole("button", { name: "Block time for a task" }).click()
      await page.getByRole("option", { name: /Plan the launch/ }).click()
      // The card is the block's now: its task, and no guests.
      await expect(card.getByRole("button", { name: "Time for Plan the launch. Change the task" })).toBeVisible()
      await expect(card.getByRole("button", { name: /Add guests/ })).toHaveCount(0)
      await expect(card.getByLabel("Event title")).toHaveAttribute("placeholder", "Plan the launch")
      await reviewShot(page, "task-block-quick", theme)
      await card.getByRole("button", { name: /^Save/ }).click()
      await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
      const body = posted[0] as { kind: string; task_uuid: string; title: string; start: { at: string } }
      expect([body.kind, body.task_uuid, body.title]).toEqual(["task_block", "t-plan", ""])
      const start = new Date(body.start.at)
      expect([start.getDate(), start.getHours()]).toEqual([22, 16])
      await expect(card).toHaveCount(0)

      // A block's card: its task's name opens the task beside the calendar, and the card makes way.
      await page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]').click()
      const popover = page.locator("[data-event-popover]")
      await expect(popover).toBeVisible()
      await popover.getByRole("link", { name: "Write the brief" }).click()
      await expect(popover).toHaveCount(0)
      await expect.poll(() => opened.join(" "), { timeout: 15_000 }).toContain("t-brief")
    })
  })
}

test.describe("task blocks on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("draws the block with its task's state, and a tap on a lane task opens it, blocking nothing", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const posted: unknown[] = []
    await open(page, testInfo, posted)
    // A phone shows the day: today's block, with its task's glyph.
    const block = page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]')
    await expect(block).toBeVisible({ timeout: 30_000 })
    await expect(block.locator('[data-status-glyph="progress"]')).toHaveCount(1)
    await reviewShot(page, "task-block-phone", "light")
    expect(posted).toEqual([])
  })

  test("a waiting block's card and its page say what it waits on: by name, or how many when you can't read them", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo, [], [], { events: [BLOCK, WAITING, HIDDEN] })
    await waitsSaid(page, true, ["light", "dark"])
  })

  test("blocks a slot's time for a task from the form", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const posted: unknown[] = []
    await open(page, testInfo, posted)
    await expect(page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]')).toBeVisible({ timeout: 30_000 })
    // The phone's New event opens the form as a sheet.
    await page.getByRole("button", { name: "New event" }).tap()
    const form = page.locator("[data-event-form]")
    await expect(form).toBeVisible({ timeout: 30_000 })
    await form.getByRole("button", { name: "Block time for a task" }).click()
    await page.getByRole("option", { name: /Plan the launch/ }).click()
    await expect(form.locator("[data-form-task]")).toContainText("Plan the launch")
    await expect(form.getByRole("button", { name: "Block time for a task" })).toHaveCount(0)
    await expect(form.getByLabel("Title")).toHaveValue("Plan the launch")
    // DESIGN-BUILD-6's must-fix (22 Oct): the shot shows the Task row, in either theme.
    await form.locator("[data-form-task]").scrollIntoViewIfNeeded()
    await expect(form.locator("[data-form-task]")).toBeInViewport()
    await shotIn(page, "task-block-form-phone", ["light", "dark"])
    await page.getByRole("button", { name: "Create event" }).click()
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
    const body = posted[0] as { kind: string; task_uuid: string; title: string; attendees: unknown[] }
    expect([body.kind, body.task_uuid, body.title, body.attendees]).toEqual(["task_block", "t-plan", "Plan the launch", []])
  })
})

// T1: the Tasks list beside the grid. A row carried onto the hours blocks the
// task's estimate there (the one create); a block whose task waits says so,
// and its card names what it waits on. A row's menu blocks the next free time.
for (const theme of ["light", "dark"] as const) {
  test.describe(`the Tasks list at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("carries a task from the list onto the grid for its estimate, and a waiting task's block says so", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      const posted: unknown[] = []
      await open(page, testInfo, posted, [], { member: true })
      await page.getByRole("button", { name: "Tasks", exact: true }).click()
      const list = page.locator("[data-calendar-tasks]")
      await expect(list.getByRole("button", { name: /^Plan the launch/ })).toBeVisible({ timeout: 30_000 })
      await expect(list.getByRole("button", { name: /^Write the pricing copy/ }).getByTitle("Blocked by 1 task")).toHaveCount(1)
      // The waiting task's block: the stop sign a task's card draws, and its name says it in the timeline's words.
      const waiting = page.locator('[data-hue-block="block"][data-event-uuid="b-copy"]')
      await waiting.scrollIntoViewIfNeeded()
      await expect(waiting.getByTitle("Blocked by 1 task")).toHaveCount(1)
      await expect(waiting).toHaveAttribute("aria-label", /, waiting on 1 task$/)
      // DESIGN-BUILD-125's F1: the marks (its task's glyph, the stop sign and how many) keep off the title, which ends before them.
      const marks = (await waiting.locator("[data-status-glyph]").locator("..").boundingBox())!
      const words = (await waiting.locator(".cal-block-title").boundingBox())!
      expect(words.x + words.width, "the block's title runs under its marks").toBeLessThanOrEqual(marks.x)
      await reviewShot(page, "task-list", theme)

      // Carry "Plan the launch" from the list onto Thursday at 11:00.
      const row = (await list.getByRole("button", { name: /^Plan the launch/ }).boundingBox())!
      const thursday = page.locator('[data-day-col="3"]')
      const col = (await thursday.boundingBox())!
      const hour = col.height / 24
      const scroller = (await page.locator("[data-time-grid-scroll]").boundingBox())!
      const target = { x: col.x + col.width / 2, y: Math.max(scroller.y + 40, col.y + 11 * hour) }
      await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 10; i++) await page.mouse.move(row.x + ((target.x - row.x) * i) / 10, row.y + ((target.y - row.y) * i) / 10)
      await expect(page.locator('[data-day-col="3"] [data-calendar-ghost]')).toContainText("Plan the launch")
      await reviewShot(page, "task-list-carry", theme)
      await page.mouse.up()
      await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
      const body = posted[0] as { kind: string; task_uuid: string; start: { at: string }; end: { at: string } }
      expect([body.kind, body.task_uuid]).toEqual(["task_block", "t-plan"])
      const start = new Date(body.start.at)
      expect([start.getDate(), (new Date(body.end.at).getTime() - start.getTime()) / 60000]).toEqual([22, 45])

      // The waiting block's card names what it waits on.
      await waiting.click()
      const card = page.locator("[data-event-popover] [data-block-waits]")
      await expect(card).toContainText("Waiting on Design review")
      await expect(card.getByRole("link", { name: "Design review" })).toHaveAttribute("href", "/app/task/t-design")
    })

    test("a waiting block's card and form say what it waits on: by name, or how many when you can't read them", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await open(page, testInfo, [], [], { events: [BLOCK, WAITING, HIDDEN] })
      await waitsSaid(page, false, [theme])
    })
  })
}

test.describe("the Tasks list's other cases at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: "light" })

  test("on a Saturday, Block time finds Monday (V-775)", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await weekend(page, testInfo, false, "monday")
  })

  test("on a Saturday with no free time, says so as news, not a success (V-775)", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await weekend(page, testInfo, false, "none")
  })

  test("a guest or a visitor without projects has no Tasks list", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo)
    await expect(page.locator('[data-hue-block="block"][data-event-uuid="b-brief"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "Tasks", exact: true })).toHaveCount(0)
  })

  test("says once when your tasks couldn't be read, and Try again says there are none", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await failedThenEmpty(page, testInfo, false)
  })

  test("blocks your next free time from a row's menu by the keys, and a failed create says so once", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const posted: unknown[] = []
    await open(page, testInfo, posted, [], { member: true, createFails: true })
    await page.getByRole("button", { name: "Tasks", exact: true }).click()
    const more = page.getByRole("button", { name: "More for Plan the launch" })
    await expect(more).toBeVisible({ timeout: 30_000 })
    await more.focus()
    await page.keyboard.press("Enter")
    // Opened by the keys, the menu's Block time has the focus, and shows it: the menu's highlight (DESIGN-BUILD-125's F2b).
    const item = page.getByRole("menuitem", { name: "Block time" })
    await expect(item).toBeFocused()
    await expect(item).toHaveAttribute("data-highlighted", "")
    // The highlight is the item's tint (interaction.css: --ix-a, the tint's alpha, eased in), none at rest.
    await expect.poll(() => item.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--ix-a")))).toBeGreaterThan(5)
    await shotIn(page, "task-list-menu-keys", ["light", "dark"])
    await item.press("Enter")
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
    const body = posted[0] as { kind: string; task_uuid: string; start: { at: string }; end: { at: string } }
    expect([body.kind, body.task_uuid, new Date(body.start.at).getHours(), (Date.parse(body.end.at) - Date.parse(body.start.at)) / 60000]).toEqual(["task_block", "t-plan", 11, 45])
    await expect(page.getByText("Couldn't create the event")).toHaveCount(1)
    await page.waitForTimeout(1_500)
    await expect(page.getByText("Couldn't create the event")).toHaveCount(1)
  })
})

test.describe("the Tasks list on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("on a Saturday, Block time finds Monday (V-775)", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await weekend(page, testInfo, true, "monday")
  })

  test("on a Saturday with no free time, says so as news, not a success (V-775)", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await weekend(page, testInfo, true, "none")
  })

  test("is a drawer: a task tapped, then Block time puts it in your next free time and opens the block", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const posted: unknown[] = []
    await open(page, testInfo, posted, [], { member: true })
    await page.getByRole("button", { name: "Tasks", exact: true }).tap()
    const sheet = page.locator("[data-calendar-tasks]")
    const row = sheet.getByRole("button", { name: /^Plan the launch/ })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(sheet.getByRole("button", { name: /^Write the pricing copy/ })).toContainText("1")
    await row.tap()
    await expect(row).toHaveAttribute("aria-pressed", "true")
    await shotIn(page, "task-list-phone", ["light", "dark"])
    await sheet.getByRole("button", { name: "Block time" }).tap()
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
    const body = posted[0] as { kind: string; task_uuid: string; start: { at: string }; end: { at: string } }
    expect([body.kind, body.task_uuid, new Date(body.start.at).getHours(), (Date.parse(body.end.at) - Date.parse(body.start.at)) / 60000]).toEqual(["task_block", "t-plan", 11, 45])
    // The block opens for adjusting at its own page, as a phone opens any event (calendarRoute), the drawer closed.
    await expect(page).toHaveURL(/\/app\/calendar\/event\/b-new\?edit=1$/, { timeout: 15_000 })
    // There it is being edited: its task's row in the form (DESIGN-BUILD-125's F2d).
    await expect(page.locator("[data-event-form] [data-form-task]")).toContainText("Plan the launch", { timeout: 30_000 })
    await shotIn(page, "task-list-booked-phone", ["light", "dark"])
  })

  test("says once when your tasks couldn't be read, and Try again says there are none", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await failedThenEmpty(page, testInfo, true)
  })
})
