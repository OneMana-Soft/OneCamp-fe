import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, TASK_PANEL_READS, reviewShot, stubBackend, type Answers } from "./stubbedApp"

// linear-28: ⌘K acts on the task you are on, as Linear's does on the issue. The task's panel offers its own actions to
// the palette (lib/ui/paletteEntries, lib/work/taskPaletteEntries). With nothing typed they lead, under "This task";
// one with choices asks on a page that marks the current one; a pick goes to the panel's own handler, so it is sent as
// a change made on the panel is (/task/updateTaskPriority) and painted there; typing finds them. Someone the panel
// doesn't let edit the task is offered its copies and no change.
//
// A phone's top bar on a task's page holds the task's options, not search: a keyboard's ⌘K opens the palette there,
// and its rows answer a tap.

const P = "9e0a0000-0000-4000-8000-0000000000a8"
const T = "7a5c00a8-0000-4000-8000-000000000001"
const NONE = "0001-01-01T00:00:00Z"
const project = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: T,
  task_name: "Price the enterprise plan",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Billing" },
}
/** An AI teammate the task can be handed to, as /user/dm-ai-targets sends one: a bot. */
const SCOUT = { user_uuid: "5c0a7000-0000-4000-8000-0000000000a1", user_name: "scout", user_full_name: "Scout", user_profile_object_key: "", is_bot: true }
const fields = { data: { fields: [], can_edit: true } }
/** A task as /task/info answers it: the task (and `more`), then what its panel reads with it. */
const infoOf = (t: typeof task, more: object = {}) => ({
  msg: "ok",
  data: {
    ...t,
    ...more,
    task_description: "",
    task_project: { ...project },
    task_sub_tasks: [],
    task_comments: [],
    task_activities: [],
    task_attachments: [],
    task_collaborators: [],
    task_blocked_by: [],
    task_blocks: [],
    task_fields: {},
  },
  included: { statuses: { data: null }, fields },
})
/** What the server lets a viewer do with the task: read it and comment, no change. */
const VIEWER = { edit: false, delete: false, comment: true, log_time: false }

// H1b: the task's tags, cycle and milestone in ⌘K, and the selection's actions.
const DAY = 86_400_000
/** The project's running cycle, as /project/<P>/cycles lists it. */
const CYCLE = { id: "c-12", project_uuid: P, number: 12, name: "", starts_at: new Date(Date.now() - 3 * DAY).toISOString(), ends_at: new Date(Date.now() + 11 * DAY).toISOString(), state: "current", progress: { total: 1, started: 0, done: 0 } }
/** The project's milestone, as /project/<P>/milestones lists it. */
const BETA = { id: "m-beta", project_uuid: P, name: "Beta", description: "", target_date: null, progress: { total: 0, started: 0, done: 0 }, home: true, projects: [{ project_uuid: P, project_name: "Billing" }], hidden_projects: 0, next: true, can_edit: true }
/** What the rows' changes sent, and what the server now says the task is in. */
type Rows = { label?: unknown; cycle?: unknown; milestone?: unknown; cycleNow: typeof CYCLE | null; milestoneNow: typeof BETA | null }

/** The project's tags, cycles and milestones, and the rows' reads and changes, keeping what they're sent. */
function rowAnswers(rows: Rows): Answers {
  const cycle = (_url: URL, request: Request) => {
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { task_uuid: string; cycle_id: string }
      rows.cycle = body
      rows.cycleNow = body.cycle_id === CYCLE.id ? CYCLE : null
    }
    return { msg: "ok", data: rows.cycleNow }
  }
  return {
    [`/project/${P}/tags`]: { msg: "ok", data: [{ name: "pricing", count: 3 }, { name: "enterprise", count: 1 }] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [CYCLE], can_edit: true } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [BETA], can_manage: true } },
    // GET /task/cycle/<task> reads it, POST /task/cycle moves it.
    "/task/cycle/": cycle,
    "/task/cycle": cycle,
    "/task/milestone": (_url: URL, request: Request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { task_uuid: string; milestone_id: string }
        rows.milestone = body
        rows.milestoneNow = body.milestone_id === BETA.id ? BETA : null
      }
      return { msg: "ok", data: rows.milestoneNow && { id: BETA.id, project_uuid: P, name: BETA.name, description: "", target_date: null } }
    },
    "/task/updateTaskLabel": (_url: URL, request: Request) => {
      rows.label = request.postDataJSON()
      return { msg: "ok", data: { ...task, task_label: (rows.label as { task_label: string }).task_label } }
    },
  }
}

type Sent = Array<{ task_uuid: string; task_priority: string; task_project_uuid: string }>

/** The project and the task; `access`, when given, is what the server says this person may do with the task. */
function answersFor(sent: Sent, access?: typeof VIEWER): Answers {
  return {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", ...fields },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    [`/task/info/${T}`]: infoOf(task, access ? { task_access: access } : {}),
    // The server keeps the priority it's sent, as the panel's own pick sends it.
    "/task/updateTaskPriority": (_url: URL, request: Request) => {
      const body = request.postDataJSON() as Sent[number]
      sent.push({ task_uuid: body.task_uuid, task_priority: body.task_priority, task_project_uuid: body.task_project_uuid })
      return { msg: "ok", data: { ...task, task_priority: body.task_priority } }
    },
    // What's typed is also searched for in the workspace's text: nothing here.
    "/search/unifiedSearch": { msg: "ok", data: { page: [] } },
    // The task page's other reads, answered empty, so no "Not in this test" toast lands in a shot or under a tap.
    [`/project/membersInfo/${P}`]: { msg: "ok", data: { ...project, project_members: [SAM] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    "/notices": { msg: "ok", data: { notices: [] } },
    // The workspace's AI teammates, whom the panel's picker lists and so does the palette's Assign to (CR-127).
    "/user/dm-ai-targets": { msg: "ok", data: [SCOUT] },
    // Each bot's kind, as /user/botKinds answers: an AI is behind scout, so its tag says "Agent".
    "/user/botKinds": { msg: "ok", data: { [SCOUT.user_uuid]: "agent" } },
  }
}

/** The task's own page, as `theme`; `access` as in answersFor; `more` adds or replaces answers. */
async function openTask(page: Page, testInfo: TestInfo, sent: Sent, theme: string, access?: typeof VIEWER, more: Answers = {}) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, { ...answersFor(sent, access), ...more })
  await page.goto(`/app/task/${T}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const panel = page.locator("[data-task-panel]")
  await expect(panel.getByText(task.task_name).first()).toBeVisible({ timeout: 60_000 })
  return panel
}

/** ⌘K, from a laptop's keyboard or one paired with a phone. */
async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k")
  const palette = page.getByRole("dialog", { name: "Search, jump, or ask" })
  await expect(palette).toBeVisible({ timeout: 30_000 })
  return palette
}

const row = (palette: Locator, text: string) => palette.locator("[cmdk-item]").filter({ hasText: text })

/**
 * A page's field says its placeholder whole, or ends it in an ellipsis: never cut mid-word beside the page's chip
 * and Cancel ("Add or remove ta" at 390, DB-61's H1b MUST 1). Measured in the page, in the field's own font.
 */
function fitsOrEllipsis(el: SVGElement | HTMLElement): boolean {
  const field = el as HTMLInputElement
  const s = getComputedStyle(field)
  const pen = document.createElement("canvas").getContext("2d")
  if (!pen) return false
  pen.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
  const room = field.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
  return pen.measureText(field.placeholder).width <= room || s.textOverflow === "ellipsis"
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["at 1280", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`${where}, ${theme}`, () => {
      test.use(use)

      test("⌘K on a task offers its actions first; a priority picked on a page that marks the current one is sent and painted as the panel's own; typing finds it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = use.viewport.width < 500
        const press = (target: Locator) => (phone ? target.tap() : target.click())
        const sent: Sent = []
        const panel = await openTask(page, testInfo, sent, theme)
        const properties = panel.locator("[data-task-properties]")
        await expect(properties).toContainText("Medium")

        // With nothing typed, the task's actions lead, under the task.
        let palette = await openPalette(page)
        const lead = palette.locator("[cmdk-group]").first()
        await expect(lead.locator("[cmdk-group-heading]")).toHaveText("This task")
        for (const label of ["Change status…", "Set priority…", "Assign to…", "Copy link", "Copy branch name"]) await expect(row(lead, label)).toHaveCount(1)
        // On this first open the keyboard is on the task's first action, so Enter acts on the task (DB-57).
        await expect(row(lead, "Change status…")).toHaveAttribute("aria-selected", "true")
        // Each action wears its own mark, as the toolbar's facets and the header's buttons do; none the page icon.
        // lucide classes an icon by its component's name: Link2 draws "lucide-link2", GitBranch "lucide-git-branch".
        for (const [label, mark] of [
          ["Change status…", "[data-status-glyph]"],
          ["Set priority…", "[data-priority-glyph]"],
          ["Assign to…", ".lucide-users"],
          ["Copy link", ".lucide-link2"],
          ["Copy branch name", ".lucide-git-branch"],
        ]) await expect(row(lead, label).locator(`.palette-mark ${mark}`)).toHaveCount(1)
        await expect(lead.locator(".lucide-file-text")).toHaveCount(0)
        await reviewShot(page, "paletteTask-lead", theme)

        // A choice asks on a page, which marks the task's current priority.
        await press(row(lead, "Set priority…"))
        await expect(palette.getByPlaceholder("Set priority…")).toBeVisible()
        await expect(row(palette, "Medium")).toContainText("Current")
        await expect(row(palette, "High")).not.toContainText("Current")
        await expect(row(palette, "Copy link")).toHaveCount(0)
        // Each level wears its glyph, as the panel's priority menu draws it.
        await expect(row(palette, "Urgent").locator('.palette-mark [data-priority-glyph="4"]')).toHaveCount(1)
        await expect(row(palette, "Medium").locator('.palette-mark [data-priority-glyph="2"]')).toHaveCount(1)
        await reviewShot(page, "paletteTask-priority", theme)

        // The pick is the panel's own: sent as the panel sends it, and painted on the panel.
        await press(row(palette, "High"))
        await expect(palette).toBeHidden()
        await expect.poll(() => sent).toContainEqual({ task_uuid: T, task_priority: "high", task_project_uuid: P })
        await expect(properties).toContainText("High")
        expect(sent).toHaveLength(1)

        // Typing finds it, marked as the task's; the page it opens reads the task as it is now.
        palette = await openPalette(page)
        await palette.locator("[cmdk-input]").fill("priority")
        const found = row(palette, "Set priority…").filter({ hasText: "This task" })
        await expect(found).toHaveCount(1)
        if (phone) await found.tap()
        else {
          await expect(found).toHaveAttribute("aria-selected", "true")
          await page.keyboard.press("Enter")
        }
        await expect(palette.getByPlaceholder("Set priority…")).toBeVisible()
        await expect(row(palette, "High")).toContainText("Current")
        await expect(row(palette, "Medium")).not.toContainText("Current")

        // The assign page lists whom the panel's picker lists, the workspace's AI teammates after the project's
        // people, each with their avatar, and no one first (CR-127).
        await page.keyboard.press("Escape")
        await expect(palette).toBeHidden()
        palette = await openPalette(page)
        await press(row(palette, "Assign to…"))
        await expect(palette.getByPlaceholder("Assign to…")).toBeVisible()
        const people = palette.locator("[cmdk-item]")
        await expect(people.first()).toContainText("No one")
        await expect(people.last()).toContainText("scout")
        expect(await people.locator(".palette-mark").count()).toBe(await people.count())
        await expect(palette.locator(".lucide-file-text")).toHaveCount(0)
        // An AI teammate wears the app's tag, as the panel's picker draws it: assigning hands the task to the agent
        // and starts its run, so "Agent" shows before Enter does (DB-58). A person wears none.
        await expect(people.last().locator('[data-principal-tag="ai"]')).toContainText("Agent")
        await expect(people.locator("[data-principal-tag]")).toHaveCount(1)
        await reviewShot(page, "paletteTask-assign", theme)
        if (phone) return

        // The status page wears each status's glyph, as the panel's status menu draws it.
        await page.keyboard.press("Escape")
        await expect(palette).toBeHidden()
        palette = await openPalette(page)
        await press(row(palette, "Change status…"))
        await expect(palette.getByPlaceholder("Change status…")).toBeVisible()
        const statuses = palette.locator("[cmdk-item]")
        await expect(statuses.first()).toBeVisible()
        expect(await statuses.count()).toBeGreaterThan(2)
        expect(await statuses.locator(".palette-mark [data-status-glyph]").count()).toBe(await statuses.count())
        await expect(statuses.filter({ hasText: "Current" }).locator('[data-status-glyph="todo"]')).toHaveCount(1)
        await reviewShot(page, "paletteTask-status", theme)
      })

      test("⌘K tags the task, moves it to a cycle and onto a milestone, each read as its page opens and picked through its row's own change (H1b)", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = use.viewport.width < 500
        const press = (target: Locator) => (phone ? target.tap() : target.click())
        const rows: Rows = { cycleNow: null, milestoneNow: null }
        await openTask(page, testInfo, [], theme, undefined, rowAnswers(rows))
        const page_ = async (palette: Locator, label: string) => {
          const field = palette.getByPlaceholder(label)
          await expect(field).toBeVisible()
          expect(await field.evaluate(fitsOrEllipsis), `${label} fits its field or ends in an ellipsis`).toBe(true)
        }

        // Each wears its own mark, as the panel's rows do.
        let palette = await openPalette(page)
        const lead = palette.locator("[cmdk-group]").first()
        for (const [label, mark] of [
          ["Add or remove tag…", ".lucide-tag"],
          ["Move to cycle…", ".lucide-repeat"],
          ["Move to milestone…", ".lucide-milestone"],
        ]) await expect(row(lead, label).locator(`.palette-mark ${mark}`)).toHaveCount(1)

        // Tags as the tag picker lists them, each in its hue; a pick is the panel's own save of the task's tags.
        await press(row(lead, "Add or remove tag…"))
        await page_(palette, "Add or remove tag…")
        await expect(row(palette, "pricing").locator(".palette-mark [data-tag-hue]")).toHaveCount(1)
        await expect(row(palette, "pricing")).not.toContainText("Current")
        await reviewShot(page, "paletteTask-tags", theme)
        await press(row(palette, "pricing"))
        await expect(palette).toBeHidden()
        await expect.poll(() => rows.label, { timeout: 10_000 }).toMatchObject({ task_uuid: T, task_label: "pricing", task_project_uuid: P })
        palette = await openPalette(page)
        await press(row(palette, "Add or remove tag…"))
        await expect(row(palette, "pricing")).toContainText("Current")
        await page.keyboard.press("Escape")
        await expect(palette).toBeHidden()

        // The Cycle row's choices: No cycle first, marked while it has none; a pick is the row's own move, and the
        // page then reads the cycle it is in.
        palette = await openPalette(page)
        await press(row(palette, "Move to cycle…"))
        await page_(palette, "Move to cycle…")
        await expect(palette.locator("[cmdk-item]").first()).toContainText("No cycle")
        await expect(row(palette, "No cycle")).toContainText("Current")
        await reviewShot(page, "paletteTask-cycle", theme)
        await press(row(palette, "Cycle 12"))
        await expect(palette).toBeHidden()
        await expect.poll(() => rows.cycle).toEqual({ task_uuid: T, cycle_id: CYCLE.id })
        palette = await openPalette(page)
        await press(row(palette, "Move to cycle…"))
        await expect(row(palette, "Cycle 12")).toContainText("Current")
        await page.keyboard.press("Escape")
        await expect(palette).toBeHidden()

        // The Milestone row's, the same way.
        palette = await openPalette(page)
        await press(row(palette, "Move to milestone…"))
        await page_(palette, "Move to milestone…")
        await expect(palette.locator("[cmdk-item]").first()).toContainText("No milestone")
        await expect(row(palette, "No milestone")).toContainText("Current")
        await reviewShot(page, "paletteTask-milestone", theme)
        await press(row(palette, "Beta"))
        await expect(palette).toBeHidden()
        await expect.poll(() => rows.milestone).toEqual({ task_uuid: T, milestone_id: BETA.id })
        palette = await openPalette(page)
        await press(row(palette, "Move to milestone…"))
        await expect(row(palette, "Beta")).toContainText("Current")
      })
    })
  }
}

test.describe("at 1280, a viewer", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test("someone the task's panel doesn't let edit is offered its copies and no change, typed or not", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const sent: Sent = []
    await openTask(page, testInfo, sent, "light", VIEWER)
    const palette = await openPalette(page)
    const lead = palette.locator("[cmdk-group]").first()
    await expect(lead.locator("[cmdk-group-heading]")).toHaveText("This task")
    await expect(row(lead, "Copy link")).toHaveCount(1)
    await expect(row(lead, "Copy branch name")).toHaveCount(1)
    for (const label of ["Change status…", "Set priority…", "Assign to…"]) await expect(row(palette, label)).toHaveCount(0)
    await palette.locator("[cmdk-input]").fill("priority")
    await expect(row(palette, "Copy link")).toHaveCount(0)
    await expect(row(palette, "Set priority…")).toHaveCount(0)
    expect(sent).toHaveLength(0)
  })
})

// H1b: ⌘K acts on the selected tasks, as Linear's does on the selected issues. The list's selection bar
// (components/task/BulkTaskBar) offers its own fields, with its keys, listed first under how many are selected; a
// pick is the bar's own change (one /task/bulk for the tasks this person may change). The bar is a computer's
// (KeyboardList hides it on a phone), so this runs at 1280.
const T2 = "7a5c00a8-0000-4000-8000-000000000002"
const second = { ...task, task_uuid: T2, task_name: "Draft the pricing FAQ" }
/** What a project admin may do, as /project/info answers it. */
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }

/** The project's backlog with its two tasks, and every read its page makes; /task/bulk keeps what it's sent. */
async function openBacklog(page: Page, testInfo: TestInfo, theme: string) {
  const state: { bulk: unknown[] } = { bulk: [] }
  const admin = { ...project, project_access: ADMIN }
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/${P}/backlog`]: { msg: "ok", data: { backlog: { cycles: [], tasks: [task, second], count: 2, estimate_minutes: 0 }, schedule: null, can_edit: true, can_plan: true } },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...admin, project_task_count: 2, project_tasks: [] }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: admin },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: admin },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", ...fields },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [BETA], can_manage: true } },
    [`/project/${P}/timeline`]: { msg: "ok", data: { tasks: [task, second], total: 2, can_edit: true, project_access: ADMIN } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    // The list reads ahead the task each focus lands on (KeyboardList's prefetch): the first, then the second.
    [`/task/info/${T}`]: infoOf(task),
    [`/task/info/${T2}`]: infoOf(second),
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...admin, project_tasks_backlog: [], project_tasks_todo: [task, second], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 2, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    "/user/botKinds": { msg: "ok", data: {} },
    "/task/bulk": (_url: URL, request: Request) => {
      state.bulk.push(request.postDataJSON())
      return { msg: "ok", data: { refused: [] } }
    },
    "/entities": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: { notices: [] } },
    "/search/unifiedSearch": { msg: "ok", data: { page: [] } },
    ...TASK_PANEL_READS,
  })
  await page.goto(`/app/project/${P}?tab=backlog`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-backlog]")).toBeVisible({ timeout: 60_000 })
  return state
}

for (const theme of SHOT_THEMES) {
  test.describe(`at 1280, a selection, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("⌘K offers the selection's fields first, with the bar's keys; a pick is the bar's own change; a cleared selection takes them back (H1b)", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo, theme)
      await page.locator(`[data-task-id="${T}"]`).focus()
      await page.keyboard.press("x")
      await page.keyboard.press("j")
      await page.keyboard.press("x")
      await expect(page.getByRole("toolbar", { name: "2 tasks selected" })).toBeVisible()

      // With nothing typed, the selection's fields lead, each with the key the bar shows, in the bar's order.
      let palette = await openPalette(page)
      const lead = palette.locator("[cmdk-group]").first()
      await expect(lead.locator("[cmdk-group-heading]")).toHaveText("2 tasks selected")
      const fields = lead.locator("[cmdk-item]")
      await expect(fields).toHaveText([/^Change status…\s*S/, /^Assign to…\s*A/, /^Add or remove tag…\s*T/, /^Set priority…\s*P/, /^Set due date…\s*D/, /^Move to cycle…\s*⇧ C/, /^Move to milestone…\s*⇧ M/])
      await expect(row(lead, "Change status…")).toHaveAttribute("aria-selected", "true")
      await expect(row(lead, "Set due date…").locator(".palette-mark .lucide-calendar-days")).toHaveCount(1)
      await reviewShot(page, "paletteSelection-lead", theme)

      // A priority picked on its page is the bar's own change: one request for both tasks, and its toast.
      await row(lead, "Set priority…").click()
      await expect(palette.getByPlaceholder("Set priority…")).toBeVisible()
      await expect(palette.locator("[cmdk-item]").filter({ hasText: "Current" })).toHaveCount(0)
      await row(palette, "High").click()
      await expect(palette).toBeHidden()
      await expect.poll(() => state.bulk).toEqual([{ task_uuids: [T, T2], op: "priority", value: "high" }])
      await expect(page.getByText("Set 2 tasks to High priority", { exact: true })).toBeVisible()

      // The milestones are read as their page opens, under the key the bar's own picker reads.
      palette = await openPalette(page)
      await row(palette.locator("[cmdk-group]").first(), "Move to milestone…").click()
      await expect(palette.getByPlaceholder("Move to milestone…")).toBeVisible()
      await expect(palette.locator("[cmdk-item]").first()).toContainText("No milestone")
      await reviewShot(page, "paletteSelection-milestone", theme)
      await row(palette, "Beta").click()
      await expect(palette).toBeHidden()
      await expect.poll(() => state.bulk.at(-1)).toEqual({ task_uuids: [T, T2], op: "milestone", value: BETA.id })
      await expect(page.getByText("Put 2 tasks in Beta", { exact: true })).toBeVisible()

      // Esc clears the selection, and the palette leads with nothing of it.
      await page.locator(`[data-task-id="${T}"]`).focus()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("toolbar", { name: /selected/ })).toBeHidden()
      palette = await openPalette(page)
      await expect(palette.getByText("2 tasks selected")).toHaveCount(0)
      await expect(row(palette, "Set due date…")).toHaveCount(0)
    })
  })
}
