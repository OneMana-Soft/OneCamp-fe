import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { askOf, holdAndDrag, openMeeting } from "./calendarMove"
import { P, openBoard } from "./projectBoard"
import { SAM, TASK_PANEL_READS, logFailures, reviewShot } from "./stubbedApp"

// V-835: a dialog opened by a TAP put the focus on its first tabbable: a
// project's Fields opened with its first row's name ("Spend") focused and
// selected (a phone's keyboard comes up over the sheet, and the next key
// replaces the name), the board's Fields with "New field" focused and ringed,
// and the calendar's "Tell guests?", after a held-finger move, with Send
// ringed. Opened on a touch screen, an overlay now holds the focus itself
// (components/ui/returnFocus's openFocus): no field focused, no text
// selected, no button ringed. With a mouse or the keys, the first field still
// takes it, and Tell guests still starts on Send.

const TASK = "00000000-0000-4000-8000-100000000835"
const SPEND = "f0a0f100-0000-4000-8000-000000000835"
const spend = { id: SPEND, project_id: P, name: "Spend", type: "money", currency: "INR", options: [], position: 0, on_card: false, filter_id: "field_spend", hidden: false }
const withSpend = { [`/project/${P}/fields`]: { msg: "ok", data: { fields: [spend], can_edit: true } } }

/** A task in the board's project, whose project has one field, Spend, with a value. */
async function openTask(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: true }
  await openBoard(page, testInfo, theme, {
    ...TASK_PANEL_READS,
    ...withSpend,
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        task_uuid: TASK,
        task_name: "Draft launch email",
        task_status: "todo",
        task_priority: "medium",
        task_project: project,
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
        task_fields: { [SPEND]: 125000 },
        task_access: { edit: true, delete: true, comment: true, log_time: true },
      },
    },
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const fieldsOf = (page: Page) => page.getByRole("dialog", { name: "Fields" })

/** What holds the focus as the overlay opens, and how much text is selected (in the page, or in a field). */
function focusIn(dialog: Locator) {
  return dialog.evaluate((el) => {
    const at = document.activeElement
    const field = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement ? at : null
    return {
      tag: at?.tagName.toLowerCase(),
      itself: at === el,
      selected: (window.getSelection()?.toString().length ?? 0) + (field ? (field.selectionEnd ?? 0) - (field.selectionStart ?? 0) : 0),
    }
  })
}

/** After a tap open: the overlay itself holds the focus; no field, select or button has it, and nothing is selected. */
async function expectHeldByItself(dialog: Locator) {
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toHaveAttribute("data-v3-sheet", "")
  // Its rise is over: a late focus (a field's own, Radix's) would have landed.
  await dialog.page().waitForTimeout(500)
  const now = await focusIn(dialog)
  expect(["input", "textarea", "select", "button"], `the focus is on a ${now.tag}`).not.toContain(now.tag)
  expect(now.selected, "no text selected").toBe(0)
  expect(now.itself, "the overlay itself holds the focus").toBe(true)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`an overlay opened by a tap at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    test("a project's Fields, from a task's Edit fields, holds the focus itself, not Spend's name", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openTask(page, testInfo, theme)
      await page.getByRole("button", { name: /More fields/ }).tap({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit fields" }).tap()
      const fields = fieldsOf(page)
      await expect(fields.locator("input").first()).toHaveValue("Spend", { timeout: 30_000 })
      await expectHeldByItself(fields)
      await reviewShot(page, "tap-focus-project-fields", theme)
    })

    test("the board's Fields, from Display's Manage fields, holds the focus itself, not New field", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openBoard(page, testInfo, theme)
      await page.getByRole("button", { name: "Display", exact: true }).tap()
      await page.getByRole("menuitem", { name: "Manage fields…" }).tap()
      const fields = fieldsOf(page)
      await expect(fields.getByLabel("New field name")).toBeVisible({ timeout: 30_000 })
      await expectHeldByItself(fields)
      await reviewShot(page, "tap-focus-board-fields", theme)
    })

    test("the calendar's Tell guests?, after a held-finger move, holds the focus itself, not Send", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { block } = await openMeeting(page, testInfo, "day")
      await holdAndDrag(page, block)
      await expectHeldByItself(askOf(page))
      await reviewShot(page, "tap-focus-tell-guests", theme)
    })
  })

  test.describe(`an overlay opened by the keys at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    /** Display, then Manage fields…, by Enter. */
    async function fieldsByKeys(page: Page) {
      await page.getByRole("button", { name: "Display", exact: true }).focus()
      await page.keyboard.press("Enter")
      const row = page.getByRole("menuitem", { name: "Manage fields…" })
      await expect(row).toBeVisible()
      await row.focus()
      await page.keyboard.press("Enter")
      await expect(fieldsOf(page)).toBeVisible({ timeout: 30_000 })
    }

    test("a project's Fields still starts on its first field, Spend's name", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openBoard(page, testInfo, theme, withSpend)
      await fieldsByKeys(page)
      const name = fieldsOf(page).locator("input").first()
      await expect(name).toHaveValue("Spend", { timeout: 30_000 })
      await expect(name).toBeFocused()
      await reviewShot(page, "key-focus-project-fields", theme)
    })

    test("the board's Fields still starts on New field", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openBoard(page, testInfo, theme)
      await fieldsByKeys(page)
      await expect(fieldsOf(page).getByLabel("New field name")).toBeFocused()
    })

    test("Tell guests?, after a move by Alt and an arrow, still starts on Send", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { block } = await openMeeting(page, testInfo, "week")
      await block.focus()
      await page.keyboard.press("Alt+ArrowDown")
      const ask = askOf(page)
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(ask.getByRole("button", { name: "Send", exact: true })).toBeFocused()
      await reviewShot(page, "key-focus-tell-guests", theme)
    })
  })
}
