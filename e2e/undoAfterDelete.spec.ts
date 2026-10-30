import { expect, test, type Page, type Request } from "@playwright/test"

import { FORM_ID, launchForm } from "./demoForm"
import { P, openBoard } from "./projectBoard"
import { SAM, SHOT_THEMES, TASK_PANEL_READS, expectEveryCallAnswered, logFailures, reviewShot, withStatus, type Answers } from "./stubbedApp"

// Undo right after a delete the server kept (V-78), at each place a project's
// admin deletes one: a status (its tasks come back with it), a field, a
// cycle, a milestone, a time entry, a form and a draft invoice. The toast's
// Undo posts /restore/<kind>/<id> through the one restore service, and the
// place reads again what shows it. A 503 (part of it is back) offers Retry,
// which has the same go again; any other refusal says the server's words,
// with nothing to retry. The server is a stateful stand-in that answers as
// controllers/Restore does. With SHOTS_DIR set, each toast is saved for
// review, light and dark.

test.use({ viewport: { width: 1280, height: 860 } })

// The server's words (controllers/Restore and each kind's own restore).
const UNFINISHED = "The status is back, but its restore didn't finish."
const NAME_TAKEN = "This project already has a field with that name. Rename that one, then restore this field."
const OVERLAP = "Cycle 4, made since, covers some of its dates, and cycles can't overlap. Delete that cycle first to bring this one back."
const NOTHING = "There's nothing to restore: it's back already, or it was never deleted."

const NONE = "0001-01-01T00:00:00Z"
const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
/** The board's first card (projectBoard), whose panel reads are answered there. */
const CARD = { task_uuid: "00000000-0000-4000-8000-100000000000", task_name: "Draft launch email" }

const toastOf = (page: Page, title: string) => page.locator(".toast-card").filter({ hasText: title })

/** The restores the page sends, as "<kind>/<id>". */
function restoresOf(page: Page): string[] {
  const sent: string[] = []
  page.on("request", (r) => {
    const m = r.method() === "POST" ? /\/restore\/([^/]+)\/([^/?]+)$/.exec(new URL(r.url()).pathname) : null
    if (m) sent.push(`${m[1]}/${decodeURIComponent(m[2])}`)
  })
  return sent
}

/** Presses Undo on the newest toast that says `title`. */
async function pressUndo(page: Page, title: string) {
  const offered = toastOf(page, title).last()
  await expect(offered.getByRole("button", { name: "Undo" })).toBeVisible()
  await offered.getByRole("button", { name: "Undo" }).click()
}

/**
 * The Undo is done: "Undone" shows, and is closed before the leg goes on, so a
 * later refusal stands alone (one outcome, one toast: DESIGN-BUILD-41).
 */
async function undone(page: Page) {
  const done = toastOf(page, "Undone")
  await expect(done).toBeVisible()
  // Its close sits on the toast's corner, outside the card.
  await page.locator(".toast-root").filter({ hasText: "Undone" }).getByRole("button", { name: "Close notification" }).click()
  await expect(done).toHaveCount(0)
}

/** A refused Undo says why in the server's words, with nothing to retry. */
async function expectRefused(page: Page, words: string) {
  const said = toastOf(page, "Couldn't undo that").last()
  await expect(said).toContainText(words)
  await expect(said.getByRole("button", { name: "Retry" })).toHaveCount(0)
}

/** A list read, or the delete under it: `remove` runs for a POST to …/<id>/delete. */
function listOr(read: () => unknown, remove: (id: string, request: Request) => void) {
  return (url: URL, request: Request) => {
    const del = request.method() === "POST" ? /\/([^/]+)\/delete$/.exec(url.pathname) : null
    if (!del) return read()
    remove(del[1], request)
    return { msg: "ok" }
  }
}

for (const theme of SHOT_THEMES) {
  test.describe(`${theme}: Undo after a delete`, () => {
    test.beforeEach(({ page }) => logFailures(page))

    test("a status comes back with its tasks; a 503 offers Retry, which finishes it", async ({ page }, testInfo) => {
      const QA = { id: "5a7a0000-0000-4000-8000-0000000000aa", project_id: P, name: "QA", category: "inReview", color: "dusk", position: 0 }
      const server = { listed: true, taskIn: QA.id, restores: 0 }
      const card = { ...CARD, task_priority: "medium", task_label: "", task_due_date: NONE, task_start_date: NONE, task_created_at: at(-9), task_status_since: at(-2), task_deleted_at: NONE, task_sub_task_count: 0, task_comment_count: 0, task_assignee: SAM, task_project: { project_uuid: P, project_name: "Website relaunch", project_is_admin: true } }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        // As the server files it: a task in a custom status has its category
        // as task_status and the status itself beside it. QA and its delete's
        // move ("inReview") are both in review.
        [`/project/taskListForKanban/${P}`]: () => {
          const inQA = server.taskIn === QA.id
          const task = { ...card, task_status: QA.category, task_custom_status: inQA ? QA.id : "", task_custom_status_name: inQA ? QA.name : "" }
          return {
            msg: "ok",
            data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [task], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
          }
        },
        [`/project/${P}/statuses`]: listOr(
          () => ({ msg: "ok", data: { built_in: [], custom: server.listed ? [QA] : [], colors: [], max: 20 } }),
          (_id, request) => {
            server.listed = false
            server.taskIn = (request.postDataJSON() as { move_to: string }).move_to
          },
        ),
        // The first go brings the status back but not its tasks yet (a 503); the next finishes.
        [`/restore/status/${QA.id}`]: () => {
          server.restores++
          server.listed = true
          if (server.restores === 1) return withStatus(503, { msg: UNFINISHED })
          server.taskIn = QA.id
          return { msg: "Status restored." }
        },
      })
      const inQA = page.locator(`[data-board] [data-column="${QA.id}"] [data-task-id="${CARD.task_uuid}"]`)
      await expect(inQA).toBeVisible()

      await page.getByRole("button", { name: "Display", exact: true }).click()
      await page.getByRole("menuitem", { name: "Manage statuses…" }).click()
      const dialog = page.getByRole("dialog", { name: "Statuses" })
      // The row's trash opens its ask; its red button (the second "Delete QA") deletes, its tasks to In review.
      // The first press on the trash opens nothing, on beta too (V-101, a dialog opened from a menu item):
      // press again only while no ask shows (the trash toggles). V-101's fix takes this out.
      const deleteQA = dialog.getByRole("button", { name: "Delete QA" })
      await expect(async () => {
        if ((await deleteQA.count()) < 2) await deleteQA.first().click()
        await expect(deleteQA).toHaveCount(2, { timeout: 1_000 })
      }).toPass({ timeout: 10_000 })
      await dialog.getByRole("button", { name: "Delete QA" }).last().click()
      await expect(dialog.getByRole("textbox", { name: "Status name", exact: true })).toHaveCount(0)
      await reviewShot(page, "undo-status-deleted", theme)

      await pressUndo(page, "Deleted “QA”")
      const unfinished = toastOf(page, "Undo didn't finish")
      await expect(unfinished).toContainText(UNFINISHED)
      // The status is back already; its tasks follow on Retry.
      await expect(dialog.getByRole("textbox", { name: "Status name", exact: true })).toHaveValue("QA")
      await reviewShot(page, "undo-status-503-retry", theme)
      await unfinished.getByRole("button", { name: "Retry" }).click()
      await expect(toastOf(page, "Undone")).toBeVisible()
      expect(sent).toEqual([`status/${QA.id}`, `status/${QA.id}`])

      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(inQA).toBeVisible()
      await reviewShot(page, "undo-status-tasks-back", theme)
      await expectEveryCallAnswered(page)
    })

    test("a field comes back; one whose name was taken since is refused in the server's words", async ({ page }, testInfo) => {
      const BUDGET = { id: "6b1d2c3e-4f50-4617-8829-3a4b5c6d7e02", project_id: P, name: "Budget", type: "money", options: [], currency: "USD", on_card: false, position: 0, filter_id: "f2" }
      const server = { listed: true, restores: 0 }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        [`/project/${P}/fields`]: listOr(() => ({ msg: "ok", data: { fields: server.listed ? [BUDGET] : [], can_edit: true } }), () => (server.listed = false)),
        [`/restore/field/${BUDGET.id}`]: () => {
          server.restores++
          if (server.restores > 1) return withStatus(400, { msg: NAME_TAKEN })
          server.listed = true
          return { msg: "Field restored." }
        },
      })
      await page.getByRole("button", { name: "Display", exact: true }).click()
      await page.getByRole("menuitem", { name: "Manage fields…" }).click()
      const dialog = page.getByRole("dialog", { name: "Fields" })
      const remove = async () => {
        await dialog.getByRole("button", { name: "Delete Budget" }).click()
        await dialog.getByRole("button", { name: "Delete Budget" }).last().click()
        await expect(dialog.getByRole("button", { name: "Delete Budget" })).toHaveCount(0)
      }

      await remove()
      await pressUndo(page, "Deleted “Budget”")
      await undone(page)
      await expect(dialog.getByRole("button", { name: "Delete Budget" })).toBeVisible()

      await remove()
      await pressUndo(page, "Deleted “Budget”")
      await expectRefused(page, NAME_TAKEN)
      await reviewShot(page, "undo-field-refused", theme)
      await expect(dialog.getByRole("button", { name: "Delete Budget" })).toHaveCount(0)
      expect(sent).toEqual([`field/${BUDGET.id}`, `field/${BUDGET.id}`])
      await expectEveryCallAnswered(page)
    })

    test("a cycle comes back; one a cycle made since overlaps is refused, naming it", async ({ page }, testInfo) => {
      const LAUNCH = { id: "c7c10000-0000-4000-8000-000000000003", project_uuid: P, number: 3, name: "Launch week", starts_at: at(-3), ends_at: at(10), state: "current", progress: { total: 2, started: 1, done: 0 } }
      const server = { listed: true, restores: 0 }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        [`/project/${P}/cycles`]: listOr(() => ({ msg: "ok", data: { cycles: server.listed ? [LAUNCH] : [], can_edit: true } }), () => (server.listed = false)),
        [`/restore/cycle/${LAUNCH.id}`]: () => {
          server.restores++
          if (server.restores > 1) return withStatus(400, { msg: OVERLAP })
          server.listed = true
          return { msg: "Cycle restored." }
        },
      })
      const remove = async (shot?: string) => {
        await page.getByRole("button", { name: "Cycles" }).click()
        await page.getByRole("button", { name: "Delete Launch week" }).click()
        const ask = page.getByRole("group", { name: "Delete Launch week" })
        await expect(ask).toContainText("Its 2 tasks stay in the project, in no cycle.")
        // Its toast's Undo brings it back, burndown and all, so it never says it can't.
        await expect(ask).not.toContainText("can't be undone")
        if (shot) await reviewShot(page, shot, theme)
        await ask.getByRole("button", { name: "Delete cycle" }).click()
      }

      await remove("undo-cycle-confirm")
      await expect(toastOf(page, "Deleted “Launch week”")).toContainText("Its tasks stay in the project.")
      await reviewShot(page, "undo-cycle-deleted", theme)
      await pressUndo(page, "Deleted “Launch week”")
      await undone(page)
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "Cycles" }).click()
      await expect(page.getByRole("button", { name: "Delete Launch week" })).toBeVisible()
      await page.keyboard.press("Escape")

      await remove()
      await pressUndo(page, "Deleted “Launch week”")
      await expectRefused(page, OVERLAP)
      await reviewShot(page, "undo-cycle-refused", theme)
      expect(sent).toEqual([`cycle/${LAUNCH.id}`, `cycle/${LAUNCH.id}`])
      await expectEveryCallAnswered(page)
    })

    test("a milestone comes back; one that's back already says there's nothing to restore", async ({ page }, testInfo) => {
      const day = (days: number) => at(days).slice(0, 10)
      const LAUNCH = { id: "m-2", project_uuid: P, name: "Public launch", description: "", target_date: day(12), progress: { total: 5, started: 2, done: 1 }, home: true, projects: [{ project_uuid: P, project_name: "Website relaunch" }], hidden_projects: 0, next: true, can_edit: true }
      const server = { listed: true, restores: 0 }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        [`/project/${P}/milestones`]: listOr(() => ({ msg: "ok", data: { milestones: server.listed ? [LAUNCH] : [], can_manage: true } }), () => (server.listed = false)),
        [`/restore/milestone/${LAUNCH.id}`]: () => {
          server.restores++
          if (server.restores > 1) return withStatus(404, { msg: NOTHING })
          server.listed = true
          return { msg: "Milestone restored." }
        },
      })
      await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const options = page.getByRole("button", { name: "Public launch options" })
      const remove = async () => {
        await options.click()
        await page.getByRole("menuitem", { name: "Delete" }).click()
        await page.getByRole("button", { name: "Delete milestone" }).click()
        await expect(options).toHaveCount(0)
      }

      await remove()
      await reviewShot(page, "undo-milestone-deleted", theme)
      await pressUndo(page, "Deleted “Public launch”")
      await undone(page)
      await expect(options).toBeVisible()

      // Restored in another tab meanwhile, say: this Undo finds nothing to bring back.
      await remove()
      await pressUndo(page, "Deleted “Public launch”")
      await expectRefused(page, NOTHING)
      await reviewShot(page, "undo-milestone-refused", theme)
      expect(sent).toEqual([`milestone/${LAUNCH.id}`, `milestone/${LAUNCH.id}`])
      await expectEveryCallAnswered(page)
    })

    test("a time entry comes back, with the task's time", async ({ page }, testInfo) => {
      const ENTRY = { id: "e7e10000-0000-4000-8000-000000000001", task_uuid: CARD.task_uuid, project_uuid: P, user_id: SAM.user_uuid, started_at: at(-1), ended_at: at(-0.9375), note: "", billable: false, person: "Sam", seconds: 5400, mine: true }
      const server = { listed: true }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        ...TASK_PANEL_READS,
        [`/task/time/${CARD.task_uuid}`]: () => ({ msg: "ok", data: { entries: server.listed ? [ENTRY] : [], seconds: server.listed ? 5400 : 0, billable_seconds: 0, running: null } }),
        "/task/time/entry/": listOr(() => ({ msg: "ok" }), () => (server.listed = false)),
        [`/restore/time_entry/${ENTRY.id}`]: () => {
          server.listed = true
          return { msg: "Time restored." }
        },
      })
      await page.locator(`[data-board] [data-task-id="${CARD.task_uuid}"]`).click()
      const logged = page.getByRole("button", { name: /1h 30m logged/ })
      await logged.click()
      const row = page.getByRole("button", { name: "Delete this time" })
      await row.hover()
      await row.click()
      await expect(logged).toHaveCount(0)
      await reviewShot(page, "undo-time-deleted", theme)

      await pressUndo(page, "Deleted 1h 30m")
      await expect(toastOf(page, "Undone")).toBeVisible()
      await expect(logged).toBeVisible()
      expect(sent).toEqual([`time_entry/${ENTRY.id}`])
      await expectEveryCallAnswered(page)
    })

    test("a form comes back, and its delete no longer says it can't be undone", async ({ page }, testInfo) => {
      const server = { listed: true }
      const sent = restoresOf(page)
      const answers: Answers = {
        [`/project/${P}/forms`]: listOr(() => ({ msg: "ok", data: { forms: server.listed ? [launchForm] : [], can_edit: true } }), () => (server.listed = false)),
        [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
        "/tables": { msg: "ok", data: [] },
        [`/restore/form/${FORM_ID}`]: () => {
          server.listed = true
          return { msg: "Form restored." }
        },
      }
      await openBoard(page, testInfo, theme, answers)
      await page.locator('button[aria-label="Project actions"]:visible').first().click()
      await page.getByRole("menuitem", { name: "Intake forms" }).click()
      const row = page.locator(`[data-form-row="${FORM_ID}"]`)
      await expect(row).toBeVisible()
      await row.getByRole("button", { name: "More for Launch requests" }).click()
      await page.getByRole("menuitem", { name: "Delete" }).click()
      const ask = page.getByRole("alertdialog")
      await expect(ask).toContainText("Its link stops working for anyone who has it.")
      await expect(ask).not.toContainText("can't be undone")
      await reviewShot(page, "undo-form-confirm", theme)
      await ask.getByRole("button", { name: "Delete form" }).click()
      await expect(row).toHaveCount(0)
      await reviewShot(page, "undo-form-deleted", theme)

      await pressUndo(page, "Deleted “Launch requests”")
      await expect(toastOf(page, "Undone")).toBeVisible()
      await expect(row).toBeVisible()
      expect(sent).toEqual([`form/${FORM_ID}`])
      await expectEveryCallAnswered(page)
    })

    test("a draft invoice comes back, and opens again as it was", async ({ page }, testInfo) => {
      const DRAFT = {
        id: "1a2b3c4d-0000-4000-8000-0000000000e7",
        project_id: P,
        number: "INV-007",
        status: "draft",
        issued_on: at(-1).slice(0, 10),
        due_on: at(29).slice(0, 10),
        currency: "USD",
        seller: { name: "OneMana", address: "1 Main St" },
        client: { name: "Acme", address: "2 Side St" },
        lines: [{ description: "Design review", hours: 2, rate_cents: 10_000, amount_cents: 20_000 }],
        subtotal_cents: 20_000,
        tax_percent: 0,
        tax_cents: 0,
        total_cents: 20_000,
        notes: "",
        created_at: at(-1),
        updated_at: at(-1),
      }
      const server = { listed: true }
      const sent = restoresOf(page)
      await openBoard(page, testInfo, theme, {
        [`/project/${P}/invoices`]: () => ({ msg: "ok", data: { invoices: server.listed ? [DRAFT] : [], next_number: "INV-008" } }),
        [`/project/${P}/invoices/${DRAFT.id}`]: (_url: URL, request: Request) => {
          if (request.method() === "POST") {
            server.listed = false
            return { msg: "ok" }
          }
          return server.listed ? { msg: "ok", data: DRAFT } : withStatus(404, { msg: "Invoice not found" })
        },
        [`/project/${P}/time`]: { msg: "ok", data: { from: at(-30), to: at(0), seconds: 0, billable_seconds: 0, entries: 0, running: 0, by_person: [], by_task: [], truncated: false } },
        [`/restore/invoice/${DRAFT.id}`]: () => {
          server.listed = true
          return { msg: "Invoice restored." }
        },
      })
      await page.goto(`/invoice/${P}?id=${DRAFT.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const deleteDraft = page.getByRole("button", { name: "Delete draft" })
      await deleteDraft.click()
      await expect(deleteDraft).toHaveCount(0)
      // The shot waits for the toast and for the new draft the page reads in its place.
      await expect(toastOf(page, "Deleted draft “INV-007”")).toBeVisible()
      await page.waitForLoadState("networkidle")
      await reviewShot(page, "undo-invoice-deleted", theme)

      await pressUndo(page, "Deleted draft “INV-007”")
      await expect(toastOf(page, "Undone")).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`[?&]id=${DRAFT.id}`))
      await expect(deleteDraft).toBeVisible()
      expect(sent).toEqual([`invoice/${DRAFT.id}`])
      await expectEveryCallAnswered(page)
    })
  })
}

// V-99: the keyboard reaches that Undo from inside the dialog. ⌥T landed in
// the toasts and the dialog's focus trap pulled it straight back, so the Undo
// was the mouse's alone. Now Tab goes through the front toast to its Undo,
// Enter takes it, and Esc, or the Undo itself, goes back to where ⌥T came
// from in the dialog, which stays open.
test.describe("the keyboard and Undo", () => {
  test("from the Fields dialog: ⌥T, Tab to Undo, Enter; Esc or the Undo goes back to where ⌥T came from", async ({ page }, testInfo) => {
    const BUDGET = { id: "6b1d2c3e-4f50-4617-8829-3a4b5c6d7e02", project_id: P, name: "Budget", type: "money", options: [], currency: "USD", on_card: false, position: 0, filter_id: "f2" }
    const server = { listed: true }
    const sent = restoresOf(page)
    await openBoard(page, testInfo, "light", {
      [`/project/${P}/fields`]: listOr(() => ({ msg: "ok", data: { fields: server.listed ? [BUDGET] : [], can_edit: true } }), () => (server.listed = false)),
      [`/restore/field/${BUDGET.id}`]: () => {
        server.listed = true
        return { msg: "Field restored." }
      },
    })
    await page.getByRole("button", { name: "Display", exact: true }).click()
    await page.getByRole("menuitem", { name: "Manage fields…" }).click()
    const dialog = page.getByRole("dialog", { name: "Fields" })
    await dialog.getByRole("button", { name: "Delete Budget" }).click()
    await dialog.getByRole("button", { name: "Delete Budget" }).last().click()
    await expect(dialog.getByRole("button", { name: "Delete Budget" })).toHaveCount(0)
    const offered = toastOf(page, "Deleted “Budget”").last()
    await expect(offered).toBeVisible()
    // ⌥T from a control in the dialog: the delete took its own row's buttons with it.
    const kind = dialog.getByRole("combobox", { name: "Kind of field" })
    await kind.focus()

    await page.keyboard.press("Alt+t")
    await expect(page.locator(".toast-viewport"), "⌥T takes focus to the toasts").toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expect(kind, "Esc goes back to where ⌥T came from").toBeFocused()

    await page.keyboard.press("Alt+t")
    await expect(page.locator(".toast-viewport")).toBeFocused()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(offered.getByRole("button", { name: "Undo" }), "Tab reaches the Undo").toBeFocused()
    await page.keyboard.press("Enter")
    await expect(toastOf(page, "Undone")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Delete Budget" })).toBeVisible()
    expect(sent).toEqual([`field/${BUDGET.id}`])
    await expect(kind, "the Undo goes back to where ⌥T came from").toBeFocused()
    // The turn is over: Esc is the dialog's again.
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expectEveryCallAnswered(page)
  })
})
