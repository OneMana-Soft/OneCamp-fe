import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, stubBackend, untilStill } from "./stubbedApp"

// A menu that joins the page on a press (components/ui/menuOnDemand) opened on
// the finger's touch, where every other menu opens on a phone on the tap's
// click (components/ui/dropdown-menu's Press): a phone's menu is a sheet that
// rises under the finger. Inside the event card's own sheet, the card's sheet
// slid away as its More menu came up, and the menu's rows couldn't be tapped.
// It now opens as every menu does: on the tap on a phone, on the press with a
// mouse, and on Enter, Space or ↓ with its first row focused.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const EVENT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c21"
const DESIGN_REVIEW = {
  event_uuid: EVENT,
  event_title: "Design review",
  event_start_time: at(10, 30),
  event_end_time: at(11),
  event_created_by: ME,
  event_participants: [],
  // The reader's own reminder: its row on the card is a menu on demand too.
  event_reminders: [10],
  event_reminders_default: true,
}

async function openDay(page: Page, testInfo: TestInfo) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [DESIGN_REVIEW] },
    "/event/getEvent/": { msg: "ok", data: DESIGN_REVIEW },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${EVENT}"]`).first()).toBeVisible({ timeout: 60_000 })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("an event card's More opens on the tap, over the card's sheet, which stays where it is; a row is chosen by its own tap", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openDay(page, testInfo)
      await page.locator(`[data-event-uuid="${EVENT}"]`).first().tap()
      const sheet = page.locator("[data-event-sheet]")
      await expect(sheet.getByRole("heading", { name: "Design review" })).toBeVisible({ timeout: 20_000 })
      await untilStill(page)
      const where = await sheet.boundingBox()
      const calendar = page.url()

      await sheet.getByRole("button", { name: "More" }).tap()
      const open = page.getByRole("menuitem", { name: "Open" })
      await expect(open).toBeVisible()
      await untilStill(page)
      expect(await sheet.boundingBox()).toEqual(where)
      expect(page.url()).toBe(calendar)
      await reviewShot(page, "event-card-more", theme)

      await open.tap()
      await expect(page).toHaveURL(new RegExp(`/app/calendar/event/${EVENT}`), { timeout: 30_000 })
    })
  })
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("an event card's More opens on the press, and its row opens the event", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openDay(page, testInfo)
    await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
    const card = page.locator("[data-event-card]")
    await card.getByRole("button", { name: "More" }).click()
    await page.getByRole("menuitem", { name: "Open" }).click()
    await expect(page.locator("[data-event-panel]").getByText("Design review").first()).toBeVisible({ timeout: 30_000 })
  })

  test("an event card's More opens from the keys with its first row focused, and Escape gives focus back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openDay(page, testInfo)
    await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
    const more = page.locator("[data-event-card]").getByRole("button", { name: "More" })
    await more.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "Open" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(more).toBeFocused()
  })

  test("an event card's reminder opens from the keys with its first choice focused, and Escape gives focus back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openDay(page, testInfo)
    await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
    const reminder = page.locator("[data-event-card]").getByRole("button", { name: "Reminders: 10 minutes before" })
    await reminder.focus()
    await page.keyboard.press("Enter")
    // Its choices are radios, not plain rows.
    await expect(page.getByRole("menuitemradio", { name: "No reminder" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("menuitemradio", { name: "At the start" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(reminder).toBeFocused()
  })
})

// A task row's priority (the project's list, taskRowParts' PriorityMenu): a
// computer's list only; a phone lists its tasks in rows of its own.
const P = "9e0a0000-0000-4000-8000-0000000000c3"
const PROJECT = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const ROWS = ["Draft the invoice copy", "Check the tax rules"].map((name, i) => ({
  task_uuid: `7a5c00c3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: name,
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Billing" },
}))

test.describe("a task row's priority, on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("opens on the press and from the keys, its first row focused, and Escape gives focus back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    await stubBackend(page, testInfo, {
      [`/project/taskList/${P}`]: { msg: "ok", data: { ...PROJECT, project_task_count: ROWS.length, project_tasks: ROWS }, pageCount: 1 },
      [`/project/info/${P}`]: { msg: "ok", data: PROJECT },
      [`/project/${P}/statuses`]: { msg: "ok", data: null },
      [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
      "/task/views": { msg: "ok", data: [] },
    })
    await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const priority = page.getByRole("button", { name: "Priority of Draft the invoice copy" })
    await expect(priority).toBeVisible({ timeout: 60_000 })

    await priority.click()
    await expect(page.getByRole("menuitem").first()).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)

    await priority.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem").first()).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(priority).toBeFocused()
  })
})
