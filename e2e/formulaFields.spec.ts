import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, TASK_PANEL_READS, expectEveryCallAnswered, reviewShot, stubBackend } from "./stubbedApp"

// Formula task fields (J-F WEB, jira-01). A project's admin adds "Days left",
// a formula over the due date, and "Spend x 2", a formula over a money field,
// in the fields dialog; the server works both out and the values show in the
// list, on the board's card and in the panel. A member sees the money formula
// as the lock (the server hides it: V-698) and has no fields dialog, so no
// Formula choice. Every list read asks in the reader's zone (?tz=).

const P = "9e0a0000-0000-4000-8000-0000000000f1"
const NONE = "0001-01-01T00:00:00Z"
const WORDS = "Only project admins see money"
const id = (i: number) => `7a5c00f1-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const SPEND = "f0a0f100-0000-4000-8000-000000000001"
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const member = { ...admin, role: "member", delete_tasks: "own", manage: false, manage_people: false, archive: false }
type Reader = "admin" | "member"
const NAMES = ["Print the launch flyers", "Book the venue"]
const spendOf = (i: number) => 125000 + i * 10000

type Field = Record<string, unknown> & { id: string; name: string; type: string; formula?: string; on_card: boolean }
type Server = { fields: Field[]; reads: string[]; created: Record<string, unknown>[] }

/** What the server works out for a task: the formula's value, or nothing for a reader it hides it from. */
const worked = (f: Field, i: number, reader: Reader) =>
  f.name === "Ratio" ? { error: "Division by zero" } : f.name === "Days left" ? 12 + i : reader === "admin" ? (spendOf(i) / 100) * 2 : undefined

async function openProject(page: Page, testInfo: TestInfo, reader: Reader, formulas: boolean, tab = "list", more: Record<string, unknown> = {}, broken = false) {
  const server: Server = { fields: [{ id: SPEND, project_id: P, name: "Spend", type: "money", currency: "INR", options: [], position: 0, on_card: false, filter_id: "field_spend", hidden: reader === "member" }], reads: [], created: [] }
  const add = (name: string, formula: string, on_card = false) =>
    server.fields.push({ id: `f0a0f100-0000-4000-8000-00000000000${server.fields.length + 1}`, project_id: P, name, type: "formula", formula, result: "number", options: [], position: server.fields.length, on_card, filter_id: `field_${server.fields.length}`, hidden: reader === "member" && name.startsWith("Spend") })
  if (formulas) {
    add("Days left", 'DATETIME_DIFF({Due}, TODAY(), "days")', true)
    add("Spend x 2", "{Spend} * 2", true)
  }
  // A formula every task's value of is an error (the server's FormulaError), on cards.
  if (broken) add("Ratio", "{Spend} / 0", true)
  const tasks = () =>
    NAMES.map((name, i) => ({
      task_uuid: id(i), task_name: name, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "2026-11-20T00:00:00Z", task_start_date: "",
      task_created_at: "2026-10-01T09:00:00Z", task_status_since: "2026-10-01T09:00:00Z", task_deleted_at: NONE, task_sub_task_count: 0, task_comment_count: 0,
      task_assignee: SAM, task_created_by: SAM, task_project: { project_uuid: P, project_name: "Spring fair" }, task_access: { edit: true, delete: true, comment: true, log_time: true }, task_key: `SF-${i + 1}`,
      task_fields: Object.fromEntries(
        server.fields.flatMap((f) => (f.type === "money" ? (reader === "admin" ? [[f.id, spendOf(i)]] : []) : worked(f, i, reader) === undefined ? [] : [[f.id, worked(f, i, reader)]])),
      ),
    }))
  const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: reader === "admin" ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: reader === "admin" ? admin : member }
  const answers: Record<string, unknown> = {
    ...TASK_PANEL_READS,
    [`/project/taskList/${P}`]: (url: URL) => {
      server.reads.push(url.search)
      return { msg: "ok", data: { ...project, project_task_count: 2, project_tasks: tasks() }, pageCount: 1 }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/taskListForKanban/${P}`]: (url: URL) => {
      server.reads.push(url.search)
      return { msg: "ok", data: { ...project, project_tasks_todo: tasks(), project_tasks_in_progress: [], project_tasks_done_count: 0 } }
    },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: reader === "admin" } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: reader === "admin" } },
    "/task/milestone/": { msg: "ok", data: null },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Spring fair" }, topic: `project/${P}` }] },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: reader === "admin" } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/restriction": { msg: "ok", data: { restricted: false, people: [], can_change: reader === "admin" } },
    // The fields: read, add, change, and a draft checked (no sample values yet: V-763).
    [`/project/${P}/fields`]: (url: URL, request: { method: () => string; postDataJSON: () => Record<string, unknown> }) => {
      if (url.pathname.endsWith("/preview"))
        return { msg: "ok", data: { result: "number", values: [], ...(String(request.postDataJSON()?.formula).includes("{Nope}") ? { error: "There's no field named Nope" } : {}) } }
      if (request.method() === "POST") {
        const body = request.postDataJSON()
        const fid = url.pathname.split("/fields/")[1]
        if (fid?.endsWith("/delete")) {
          server.fields = server.fields.filter((x) => x.id !== fid.split("/")[0])
          return { msg: "ok", data: null }
        }
        if (fid) {
          const f = server.fields.find((x) => x.id === fid)!
          Object.assign(f, body)
          return { msg: "ok", data: { field: f, changed: 0 } }
        }
        server.created.push(body)
        add(String(body.name), String(body.formula), !!body.on_card)
        return { msg: "ok", data: server.fields.at(-1) }
      }
      const builtins = [{ id: "due", name: "Due", result: "date" }, { id: "status", name: "Status", result: "text" }]
      return { msg: "ok", data: { fields: server.fields, can_edit: reader === "admin", builtins } }
    },
  }
  Object.assign(answers, more)
  for (const [i] of NAMES.entries()) {
    answers[`/task/info/${id(i)}`] = () => ({
      msg: "ok",
      data: { ...tasks()[i], task_description: "<p>What it needs.</p>", task_project: { ...project }, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
    })
  }
  await stubBackend(page, testInfo, answers)
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem("onecamp:demo-lead-dismissed", "1")
  })
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-task-id="${id(0)}"]`).first()).toBeVisible({ timeout: 60_000 })
  return server
}

const shot = (page: Page, name: string, theme: string) => reviewShot(page, `formula-${name}`, theme)
const press = (page: Page, touch: boolean) => (touch ? (l: ReturnType<Page["locator"]>) => l.tap() : (l: ReturnType<Page["locator"]>) => l.click())

/** The fields dialog, from the task's panel or page: a formula added by name and text. */
async function addFormula(page: Page, touch: boolean, name: string, formula: string) {
  const go = press(page, touch)
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("New field name").fill(name)
  await go(dialog.getByRole("combobox", { name: "Kind of field" }))
  await go(page.getByRole("option", { name: /^Formula/ }))
  const box = dialog.getByRole("textbox", { name: "Formula" })
  await box.fill(formula)
  await expect(dialog.locator("[data-formula-preview]")).toContainText("once tasks have them")
  await go(dialog.getByRole("button", { name: "Add field" }))
  // The new row, by its own label: "New field name" holds the typed name until the add lands.
  await expect(dialog.getByLabel("Field name", { exact: true }).last()).toHaveValue(name)
}

for (const theme of ["light", "dark"] as const) {
  for (const [width, height, touch] of [[1280, 860, false], [390, 844, true]] as const) {
    test.describe(`formula fields at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height }, colorScheme: theme, ...(touch ? { isMobile: true, hasTouch: true } : {}) })

      test("an admin adds a due-date formula and one over money; the values show in the panel, the list and the card", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const go = press(page, touch)
        const server = await openProject(page, testInfo, "admin", false)
        expect(server.reads.at(-1)).toContain("tz=")
        await go(page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }))
        if (touch) await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
        // The project's fields and Edit fields fold into the panel's More fields (W29), opened as a person does.
        await go(page.getByRole("button", { name: /More fields/ }))
        await go(page.getByRole("button", { name: "Edit fields" }))
        await addFormula(page, touch, "Days left", 'DATETIME_DIFF({Due}, TODAY(), "days")')
        await shot(page, `admin-dialog-${width}`, theme)
        await addFormula(page, touch, "Spend x 2", "{Spend} * 2")
        expect(server.created.map((c) => [c.name, c.type])).toEqual([["Days left", "formula"], ["Spend x 2", "formula"]])
        // Every row shows its whole name, on a phone too (squeezed by the row's controls, they read "S" and "Day").
        const dialog = page.getByRole("dialog")
        for (const name of await dialog.getByLabel("Field name", { exact: true }).all())
          expect(await name.evaluate((e) => e.scrollWidth <= e.clientWidth), `${await name.inputValue()} is cut`).toBe(true)
        // One row open: its formula to change, and Save formula in the footer until it's changed.
        await go(dialog.getByRole("button", { name: "Edit Days left's formula" }))
        await expect(dialog.getByRole("textbox", { name: "Formula" }).first()).toHaveValue('DATETIME_DIFF({Due}, TODAY(), "days")')
        await expect(dialog.getByRole("button", { name: "Save formula" })).toBeDisabled()
        await shot(page, `admin-row-open-${width}`, theme)
        await go(dialog.getByRole("button", { name: "Cancel" }))
        await expect(dialog.getByRole("button", { name: "Save formula" })).toHaveCount(0)
        await go(page.getByRole("switch", { name: "Show Spend x 2 on cards" }))
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0)

        // The panel: each value, read-only, an admin's too.
        const row = page.locator("[data-task-fields]")
        await expect(row).toContainText("12", { timeout: 30_000 })
        await expect(row).toContainText("2,500")
        await expect(row.getByRole("textbox", { name: "Spend x 2" })).toHaveCount(0)
        await row.scrollIntoViewIfNeeded()
        await shot(page, `admin-panel-${width}`, theme)

        // The board's card shows the value it's marked for. The board's address is
        // ?tab=kanban on both widths (the desktop has no "board" tab name, so that
        // opened the list), and the card is looked for inside the board itself.
        await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded" })
        await expect(page.locator(`[data-board] [data-task-id="${id(0)}"]`).first()).toContainText("2,500", { timeout: 60_000 })
        await shot(page, `admin-card-${width}`, theme)

        if (!touch) {
          // The list: each a column of its own, the number on the right.
          await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded" })
          await page.getByRole("button", { name: "Display" }).click()
          const menu = page.locator("[data-display-menu]")
          for (const name of ["Days left", "Spend x 2"]) await menu.getByRole("button", { name, exact: true }).click()
          await page.keyboard.press("Escape")
          const cells = page.locator(`[data-task-id="${id(1)}"] [data-field-cell="formula"]`)
          await expect(cells.first()).toContainText("13")
          await expect(cells.last()).toContainText("2,700")
          await shot(page, `admin-list-${width}`, theme)
        }
        await expectEveryCallAnswered(page)
      })

      test("an admin's open row holds an error, a delete asks and offers Undo, and a formula's error shows in the panel and on the card", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const go = press(page, touch)
        await openProject(page, testInfo, "admin", true, "list", {}, true)
        await go(page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }))
        if (touch) await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
        // The panel: Ratio's value is the server's error, in words on hover and to a screen reader.
        await expect(page.locator("[data-task-fields] [data-formula-error]").first()).toHaveAttribute("title", "Division by zero", { timeout: 60_000 })
        await page.locator("[data-task-fields] [data-formula-error]").first().scrollIntoViewIfNeeded()
        await shot(page, `admin-error-panel-${width}`, theme)
        await go(page.getByRole("button", { name: /More fields/ }))
        await go(page.getByRole("button", { name: "Edit fields" }))
        const dialog = page.getByRole("dialog")
        const ring = (l: ReturnType<Page["locator"]>) => l.evaluate((e) => { const c = getComputedStyle(e); return c.boxShadow !== "none" || (c.outlineStyle !== "none" && c.outlineWidth !== "0px") })
        if (!touch) {
          // The keyboard: from Spend x 2's name, Tab reaches its Edit, ringed; from the open editor, Tab reaches Save formula, ringed.
          await dialog.getByLabel("Field name", { exact: true }).nth(2).click()
          await page.keyboard.press("Tab")
          const edit = dialog.getByRole("button", { name: "Edit Spend x 2's formula" })
          await expect(edit).toBeFocused()
          expect(await ring(edit)).toBe(true)
          await shot(page, `admin-keys-edit-${width}`, theme)
          await page.keyboard.press("Enter")
          await dialog.getByRole("textbox", { name: "Formula" }).first().press("End")
          await page.keyboard.type(" + 1")
          const save = dialog.getByRole("button", { name: "Save formula" })
          await expect(save).toBeEnabled()
          for (let i = 0; i < 20 && !(await save.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab")
          await expect(save).toBeFocused()
          expect(await ring(save)).toBe(true)
          await shot(page, `admin-keys-save-${width}`, theme)
          await go(dialog.getByRole("button", { name: "Cancel" }))
        }
        // With the mouse, what was clicked stays under the pointer: the add form goes when a row opens, and the dialog's top holds still.
        const yOf = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())?.y ?? Number.NaN
        const stays = async (l: ReturnType<Page["locator"]>, y: number) => { if (!touch) expect(Math.abs((await yOf(l)) - y)).toBeLessThanOrEqual(1) }
        // An unknown field: the editor says so in words and Save formula holds; one editor at a time, so no add form.
        const spendName = dialog.getByLabel("Field name", { exact: true }).nth(2)
        const spendY = await yOf(spendName)
        await go(dialog.getByRole("button", { name: "Edit Spend x 2's formula" }))
        await dialog.getByRole("textbox", { name: "Formula" }).first().fill("{Nope} * 2")
        await expect(dialog.locator("[data-formula-preview]").first()).toContainText("There's no field named Nope")
        await expect(dialog.getByRole("button", { name: "Save formula" })).toBeDisabled()
        await expect(dialog.getByLabel("New field name")).toHaveCount(0)
        await stays(spendName, spendY)
        if (touch) {
          // CR-B55 C2: at 390 an open formula row's controls wrap inside the sheet: none past its content box, nothing to scroll sideways.
          const fit = await dialog.evaluate((d) => {
            const right = d.getBoundingClientRect().right - parseFloat(getComputedStyle(d).paddingRight)
            const rows = [...d.querySelectorAll('input[aria-label="Field name"]')].map((i) => i.closest(".rounded-lg")).filter((r): r is Element => !!r)
            const past = rows
              .flatMap((r) => [...r.querySelectorAll("*")])
              .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > right + 0.5 })
              .map((e) => `${e.tagName} ${e.getAttribute("aria-label") ?? ""} ${Math.round(e.getBoundingClientRect().right)} > ${Math.round(right)}`)
            const body = rows[0]?.parentElement?.parentElement
            return { rows: rows.length, past, sideways: [d.scrollWidth - d.clientWidth, body ? body.scrollWidth - body.clientWidth : 0] }
          })
          expect(fit.rows).toBeGreaterThanOrEqual(3)
          expect(fit.past, "every row's controls inside the sheet's content box").toEqual([])
          expect(fit.sideways, "the sheet and its body scroll no way but down").toEqual([0, 0])
        }
        await shot(page, `admin-row-error-${width}`, theme)
        await go(dialog.getByRole("button", { name: "Cancel" }))
        await expect(dialog.getByLabel("New field name")).toBeVisible()
        // A delete asks in the footer, then offers Undo.
        const trash = dialog.getByRole("button", { name: "Delete Days left" }).first()
        const trashY = await yOf(trash)
        await go(trash)
        const confirm = dialog.getByRole("button", { name: "Delete Days left" }).last()
        await expect(dialog.getByLabel("New field name")).toHaveCount(0)
        await stays(trash, trashY)
        await expect(dialog.getByText("Every task's Days left goes with it.")).toBeVisible()
        await shot(page, `admin-delete-${width}`, theme)
        await go(confirm)
        await expect(page.getByRole("button", { name: "Undo" })).toBeVisible({ timeout: 30_000 })
        await expect(dialog.getByLabel("Field name", { exact: true })).toHaveCount(3)
        await shot(page, `admin-undo-${width}`, theme)
        await page.keyboard.press("Escape")
        // The card: Ratio is marked for cards, so its error shows there too.
        await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded" })
        const card = page.locator(`[data-board] [data-task-id="${id(0)}"]`).first()
        await expect(card.locator("[data-formula-error]")).toHaveAttribute("title", "Division by zero", { timeout: 60_000 })
        await shot(page, `admin-error-card-${width}`, theme)
        await expectEveryCallAnswered(page)
      })

      test("an admin still reaches Edit fields when every other row holds a value, through a More fields that names none", async ({ page }, testInfo) => {
        test.skip(!touch, "the fold is the same at every width; this walks it on the phone's task page, with touch")
        test.setTimeout(180_000)
        const go = press(page, touch)
        // The task repeats and its one field (Spend) holds a value; with no cycles or milestones, all More fields folds is Edit fields.
        const repeats = { "/task/recurrence/": { msg: "ok", data: { rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", mode: "schedule" } } }
        await openProject(page, testInfo, "admin", false, "list", repeats)
        await go(page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }))
        await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
        const toggle = page.getByRole("button", { name: /More fields/ })
        await expect(toggle).toHaveText("More fields", { timeout: 60_000 })
        await go(toggle)
        await go(page.getByRole("button", { name: "Edit fields" }))
        await expect(page.getByRole("dialog").getByLabel("New field name")).toBeVisible()
        await shot(page, `admin-fold-${width}`, theme)
        await expectEveryCallAnswered(page)
      })

      test("a member sees the money formula locked, the other's value, and no fields dialog", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const go = press(page, touch)
        await openProject(page, testInfo, "member", true)
        await go(page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }))
        if (touch) await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
        const locked = page.locator("[data-field-hidden-row]").filter({ hasText: "Spend x 2" })
        await expect(locked).toContainText(WORDS, { timeout: 60_000 })
        await expect(page.locator("[data-task-fields]")).toContainText("12")
        await expect(page.getByText("2,500")).toHaveCount(0)
        // Opened, More fields shows every row it folds: still no fields dialog for a member who may change the task.
        await go(page.getByRole("button", { name: /More fields/ }))
        await expect(page.getByRole("button", { name: /Fewer fields/ })).toBeVisible()
        await expect(page.getByRole("button", { name: /Edit fields|Add a field/ })).toHaveCount(0)
        await locked.scrollIntoViewIfNeeded()
        await shot(page, `member-panel-${width}`, theme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
