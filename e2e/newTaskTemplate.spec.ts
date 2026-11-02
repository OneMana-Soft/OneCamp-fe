import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// New task from a template (linear-09, as Linear's issue templates): the
// project's templates in the Template chip, the form filled from the one
// picked, what it asks for named in words when Create is refused (422), and
// the task made through it once that is filled. On a computer Alt+C on the
// project's list (Linear's Option+C), or Alt+click on New task, opens New
// task on the picker; a phone taps the chip.

const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
const project = {
  project_uuid: P,
  project_name: "Website relaunch",
  project_key: "WEB",
  project_is_admin: true,
  project_is_member: true,
  project_team: { team_name: "Product" },
  project_members: [SAM],
}
const bug = { id: "t1", project_id: P, name: "Bug report", description: "Steps, what you saw, what you expected" }
const weekly = { id: "t2", name: "Weekly review" }
const BUG = { ...bug, shape: { name: "Bug: ", priority: "high", tags: "bug", subtasks: [{ name: "Reproduce" }, { name: "Fix" }, { name: "Verify" }] } }
// What the project couldn't take of the template (make's left_off), said beside the asks and under Created.
const GONE = "The value of a field this project doesn't have is left off."
const type = (builtin: string, name: string) => ({ id: `type-${builtin}`, builtin, name, icon: builtin })
// A project's field as the server sends it (business/TaskField's View), filter id included: the list's columns and
// its field filters are keyed by it, so a field stubbed without one breaks the project's list at 1280.
const field = (id: string, name: string, kind: string, position: number, options: { id: string; label: string; color: string }[] = []) => ({
  id,
  project_id: P,
  name,
  type: kind,
  options,
  on_card: false,
  position,
  filter_id: `field_${id}`,
})

/** Stubs the project, its templates and make: the first make is refused for the Customer and Area it asks for, and each says what the project couldn't take. */
async function stub(page: Page, testInfo: TestInfo, made: Record<string, unknown>[]) {
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project] },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: {
      msg: "ok",
      data: {
        fields: [
          field("f1", "Customer", "text", 0),
          field("f2", "Area", "multi_select", 1, [
            { id: "o1", label: "Data loss", color: "red" },
            { id: "o2", label: "Billing", color: "sky" },
          ]),
        ],
        can_edit: false,
      },
    },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [type("task", "Task"), type("bug", "Bug")], icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    // The project page's own reads at 1280, answered as the board specs answer
    // them. Left to the stub's 404, their "Not in this test" toasts took the
    // Escape meant for the New task dialog (head 2's 1280 FAIL, 2 Nov).
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] },
    },
    // No forecast yet: its chip keeps its place.
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    [`/project/${P}/task-templates`]: { msg: "ok", data: { templates: [bug, weekly], defaults: {}, can_manage: true } },
    [`/project/${P}/task-templates/t1`]: { msg: "ok", data: BUG },
    [`/project/${P}/task-templates/t1/make`]: (_url: URL, request: Request) => {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>
      made.push(body)
      const fields = body.fields as Record<string, unknown> | undefined
      const answered = fields?.f1 && Array.isArray(fields.f2)
      return answered
        ? { msg: "ok", data: { task_id: "00000000-0000-4000-8000-000000000009", subtasks: 3, left_off: [GONE] } }
        : withStatus(422, { msg: "This template asks for more", missing: ["field:f1", "field:f2"], left_off: [GONE] })
    },
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
}

/** Two frames, once every animation on the page that ends has ended: what is drawn then is where it rests. */
const settled = (page: Page) => page.evaluate(async () => {
  const ending = document.getAnimations().filter((a) => a.timeline === document.timeline && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
  await Promise.all(ending.map((a) => a.finished.catch(() => undefined)))
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
})

/**
 * The phone's chip row rests at its start, its first chip whole (DESIGN-BUILD-87, 2 Nov: the Type chip, drawn once the
 * project is known, came in ahead of the chip the row rested on, which kept the row there: scrolled 48 px, the new
 * chip showed only its last letters).
 */
async function expectChipRowAtStart(page: Page) {
  await expect(page.getByRole("button", { name: /^Type: / })).toBeVisible()
  await settled(page)
  const [scrolled, firstLeft] = await page.locator("[data-create-chips]").evaluate((el) => {
    const first = el.querySelector(':scope > :not([aria-hidden="true"])')!
    return [el.scrollLeft, Math.round(first.getBoundingClientRect().left - el.getBoundingClientRect().left)]
  })
  expect(scrolled).toBe(0)
  expect(firstLeft).toBeGreaterThanOrEqual(0)
}

/**
 * The Template picker rests on its chip once New task has settled: just below it (or above, with no room below) and
 * across it (DESIGN-BUILD-87, 2 Nov: opened with New task by Alt+C, it was placed while the dialog grew in, against the
 * growing dialog, and jumped to the page's top-left when the dialog's animation ended).
 */
async function expectPickerOnChip(page: Page) {
  const picker = page.getByRole("dialog", { name: "Template" })
  await expect(picker).toBeVisible()
  await settled(page)
  const id = await picker.getAttribute("id")
  const pick = (await picker.boundingBox())!
  const chip = (await page.locator(`[aria-controls="${id}"]`).boundingBox())!
  const below = Math.abs(pick.y - (chip.y + chip.height + 4)) <= 2
  const above = Math.abs(pick.y + pick.height - (chip.y - 4)) <= 2
  expect({ below, above, across: pick.x <= chip.x + chip.width && pick.x + pick.width >= chip.x }, JSON.stringify({ pick, chip }))
    .toMatchObject({ across: true, ...(below ? { below: true } : { above: true }) })
}

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 } }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ] as const) {
    test.describe(`New task from a template ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      test("fills the form from the template picked, names what it asks for, and makes the task through it", async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        const made: Record<string, unknown>[] = []
        await stub(page, testInfo, made)
        const phone = label === "on a phone"
        if (phone) {
          await page.goto("/app/create/task?project=web", { waitUntil: "domcontentloaded", timeout: 120_000 })
          await expect(page.getByRole("button", { name: /Website relaunch/ })).toBeVisible({ timeout: 60_000 })
          await expectChipRowAtStart(page)
          await page.getByRole("button", { name: "Template" }).tap()
        } else {
          await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
          // The toolbar's New task (C); the empty list offers one of its own, named by its words.
          const newTask = page.locator('button[aria-label="New task"]')
          await expect(newTask).toBeVisible({ timeout: 60_000 })
          // Alt+click on New task opens it on the picker too; Escape twice puts it away.
          await newTask.click({ modifiers: ["Alt"] })
          await expect(page.getByRole("option", { name: /^Bug report/ })).toBeVisible({ timeout: 30_000 })
          await page.keyboard.press("Escape")
          await page.keyboard.press("Escape")
          await expect(page.getByRole("dialog")).toHaveCount(0)
          // Then Alt+C, as the list's keys take it (the focus is back on New task, not in a field).
          await page.keyboard.press("Alt+KeyC")
        }
        // The picker is open, the project's own template first.
        const options = page.getByRole("option")
        await expect(options.filter({ hasText: "Bug report" })).toBeVisible({ timeout: 30_000 })
        await expect(options.filter({ hasText: "Weekly review" })).toBeVisible()
        if (!phone) await expectPickerOnChip(page)
        await reviewShot(page, `new-task-template-picker-${phone ? "390" : "1280"}`, theme)
        const bugReport = options.filter({ hasText: "Bug report" })
        await (phone ? bugReport.tap() : bugReport.click())

        // The form is the template's: title, priority, tags and the sub-tasks that come with it.
        await expect(page.getByRole("button", { name: "Template: Bug report" })).toBeVisible({ timeout: 30_000 })
        const title = page.getByLabel("Task title")
        await expect(title).toHaveValue("Bug: ")
        await expect(page.getByRole("button", { name: "Priority: High" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Labels: bug" })).toBeVisible()
        await expect(page.getByText("3 sub-tasks come with it")).toBeVisible()
        if (phone) await expectChipRowAtStart(page)
        await title.fill("Bug: export drops rows")
        const create = page.getByRole("button", { name: "Create task" })
        await (phone ? create.tap() : create.click())

        // Refused for the Customer and the Area it asks for: said in words, with what the project couldn't take; the form kept.
        const ask = page.getByRole("alert").filter({ hasText: "This template asks for" })
        await expect(ask).toContainText("Customer", { timeout: 30_000 })
        await expect(ask).toContainText("Area")
        await expect(ask.getByText(GONE)).toBeVisible()
        await expect(title).toHaveValue("Bug: export drops rows")
        await reviewShot(page, `new-task-template-ask-${phone ? "390" : "1280"}`, theme)
        await page.getByLabel("Customer").fill("Acme")
        // The Area is a multi-select: answered by its option's chip, never typed.
        const dataLoss = page.getByRole("button", { name: "Data loss" })
        await (phone ? dataLoss.tap() : dataLoss.click())
        await expect(dataLoss).toHaveAttribute("aria-pressed", "true")
        // The template's label taken off the form: the task is made with it cleared.
        const labels = page.getByRole("button", { name: "Labels: bug" })
        await (phone ? labels.tap() : labels.click())
        await page.locator("#task_label").fill("")
        await page.keyboard.press("Escape")
        await (phone ? create.tap() : create.click())
        await expect.poll(() => made.length, { timeout: 30_000 }).toBe(2)
        expect(made[0]).toMatchObject({ name: "Bug: export drops rows", priority: "high", tags: "bug" })
        expect(made[1]).toMatchObject({ name: "Bug: export drops rows", priority: "high", tags: "", fields: { f1: "Acme", f2: ["o1"] } })
        expect(typeof made[1].tz).toBe("string")
        // Made: Created, and what the project couldn't take, read before the form goes.
        // The page has other live regions (its notice, the announcer): read the form's Created line.
        await expect(page.getByRole("status").filter({ hasText: "Created" }).first()).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(GONE).first()).toBeVisible()
        if (!phone) {
          await page.keyboard.press("Escape")
          await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 })
        }
        // Every read the page made was answered: an unanswered one's toast can take a key meant for the form.
        await expectEveryCallAnswered(page)
      })
    })
  }
}
