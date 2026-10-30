import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend, withStatus } from "./stubbedApp"

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

async function open(page: Page, testInfo: TestInfo, posted: unknown[] = [], opened: string[] = []) {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    // The calendar keeps its own events: blocks can be made.
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    // The task a block's card opens (the panel asks for it).
    "/task/info": (url: URL) => {
      opened.push(url.pathname)
      return withStatus(404, { msg: "Not in this test" })
    },
    "/event/getEvents": { msg: "ok", data: [BLOCK] },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [PLAN] } },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/calendar/events": (_url: URL, request: { method(): string; postDataJSON(): unknown }) => {
      if (request.method() !== "POST") return { msg: "ok", data: [] }
      posted.push(request.postDataJSON())
      return { data: { id: "b-new", kind: "task_block", title: "Plan the launch" } }
    },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
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
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "task-block-form-phone", theme)
    }
    await page.getByRole("button", { name: "Create event" }).click()
    await expect.poll(() => posted.length, { timeout: 15_000 }).toBe(1)
    const body = posted[0] as { kind: string; task_uuid: string; title: string; attendees: unknown[] }
    expect([body.kind, body.task_uuid, body.title, body.attendees]).toEqual(["task_block", "t-plan", "Plan the launch", []])
  })
})
