import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// linear-03: a project's work has types (Task, Bug, Feature and the project's
// own), and its list and board are filtered and grouped by them. The filter
// goes to the server as ?filters= with task_work_type (business/WorkTaxonomy
// FilterClause), and this stand-in answers it as the server does: only the
// chosen types, a plain task being a Task. Grouped by type, the list puts each
// task under its type's header and the board makes a column of each type, each
// with its type's glyph; a card dropped in another type's column takes that
// type (POST /task/type). On a phone, the Sort and filter sheet has a Type tab.

const P = "9e0a0000-0000-4000-8000-0000000000e3"
const NONE = "0001-01-01T00:00:00Z"
const ACCESS = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const type = (builtin: string, name: string) => ({ id: `t-${builtin}`, builtin, name, icon: builtin })
const TYPES = [type("task", "Task"), type("bug", "Bug"), type("feature", "Feature")]
const BUG = TYPES[1]
const FEATURE = TYPES[2]

type Work = { task_uuid: string; task_name: string; task_status: string; task_work_type: (typeof TYPES)[number] | null } & Record<string, unknown>

const fresh = (): Work[] =>
  ([
    ["Write the launch announcement", "todo", null],
    ["Fix the signup confirmation email", "todo", BUG],
    ["Set up SSO for the pilot customer", "inProgress", FEATURE],
    ["Plan the webinar", "inProgress", null],
  ] as const).map(([name, status, kind], i) => ({
    task_uuid: `7a5c00e3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    task_name: name,
    task_status: status,
    task_work_type: kind,
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_start_date: "",
    task_rank: (i + 1) * 1024,
    task_created_at: "2026-10-01T09:00:00Z",
    task_status_since: "2026-10-01T09:00:00Z",
    task_deleted_at: NONE,
    task_sub_task_count: 0,
    task_comment_count: 0,
    task_assignee: SAM,
    task_project: { project_uuid: P, project_name: "Q4 launch" },
    task_access: { edit: true, delete: true, comment: true, log_time: true },
  }))

/** The stand-in server: its tasks, each list read's filters, and each type it was sent. */
type Server = { tasks: Work[]; reads: (string | null)[]; boardReads: (string | null)[]; retypes: Record<string, unknown>[] }

/** The server's type filter (WorkTaxonomy.FilterClause): the chosen types; Task's id takes every plain task. */
function filtered(tasks: Work[], filters: string | null): Work[] {
  const chosen = (JSON.parse(filters || "[]") as { id: string; value: string[] }[]).find((f) => f.id === "task_work_type")?.value
  if (!chosen?.length) return tasks
  return tasks.filter((t) => chosen.includes(t.task_work_type?.id ?? TYPES[0].id))
}

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openProject(page: Page, testInfo: TestInfo, server: Server, tab: "list" | "kanban") {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ACCESS }
  const column = (status: string, url: URL) => filtered(server.tasks, url.searchParams.get("filters")).filter((t) => t.task_status === status)
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: (url: URL) => {
      server.reads.push(url.searchParams.get("filters"))
      const tasks = filtered(server.tasks, url.searchParams.get("filters"))
      return { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 }
    },
    [`/project/taskListForKanban/${P}`]: (url: URL) => {
      server.boardReads.push(url.searchParams.get("filters"))
      return {
        msg: "ok",
        data: {
          ...project,
          project_tasks_backlog: [],
          project_tasks_todo: column("todo", url),
          project_tasks_in_progress: column("inProgress", url),
          project_tasks_in_review: [],
          project_tasks_done: [],
          project_tasks_canceled: [],
          project_tasks_done_count: 0,
          project_tasks_canceled_count: 0,
          project_column_counts: { backlog: 0, todo: column("todo", url).length, inProgress: column("inProgress", url).length, inReview: 0, done: 0, canceled: 0 },
        },
      }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: TYPES, icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    "/task/info/": (url: URL) => {
      const t = server.tasks.find((x) => url.pathname.endsWith(x.task_uuid)) ?? server.tasks[0]
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  // A task's type is set as POST /task/type (lib/work/keysApi setTaskType); "" makes it plain.
  await page.route(/\/task\/type$/, async (route) => {
    const request = route.request()
    const headers = cors(request)
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const body = request.postDataJSON() as { task_uuid: string; type_id: string }
    server.retypes.push(body)
    const kind = TYPES.find((t) => t.id === body.type_id && t.builtin !== "task") ?? null
    server.tasks = server.tasks.map((t) => (t.task_uuid === body.task_uuid ? { ...t, task_work_type: kind } : t))
    return route.fulfill({ status: 200, headers, json: { msg: "ok", data: { task_work_type: kind } } })
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const newServer = (): Server => ({ tasks: fresh(), reads: [], boardReads: [], retypes: [] })
const typeFilterOf = (filters: string | null) => (JSON.parse(filters || "[]") as { id: string; value: string[] }[]).find((f) => f.id === "task_work_type")?.value

test.describe("a project's work by type at 1280 (linear-03)", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("the list is filtered by type on the server, and named in a chip", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server = newServer()
    await openProject(page, testInfo, server, "list")
    const rows = page.locator("[data-grouped-list] [data-task-id]")
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    await expect(rows).toHaveCount(4)

    await page.getByRole("button", { name: "Filter" }).click()
    // Named by its label alone (its glyph is for the eye): never "Task Type".
    const facet = page.getByRole("menuitem", { name: "Type", exact: true })
    await facet.hover()
    await expect(facet).toHaveAttribute("aria-expanded", "true")
    // The project's types, built-in ones first, each named once and drawn with its glyph.
    const sub = page.locator(`[id="${await facet.getAttribute("aria-controls")}"]`)
    await expect(sub.getByRole("menuitemcheckbox")).toHaveText(["Task", "Bug", "Feature"])
    for (const t of TYPES) await expect(sub.getByRole("menuitemcheckbox", { name: t.name, exact: true }).locator(`[data-type-glyph="${t.icon}"]`)).toBeVisible()
    await sub.getByRole("menuitemcheckbox", { name: "Bug", exact: true }).click()
    await expect(sub.getByRole("menuitemcheckbox", { name: "Bug", exact: true })).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)

    // The read carries the type to the server, and the list shows its answer.
    await expect.poll(() => typeFilterOf(server.reads.at(-1) ?? null)).toEqual([BUG.id])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText("Fix the signup confirmation email")
    // The chip says it in words, with Bug's glyph.
    const chip = page.getByText("Type is Bug", { exact: true })
    await expect(chip).toBeVisible()
    await expect(chip.locator('xpath=..').locator('[data-type-glyph="bug"]')).toBeVisible()

    // Cleared from its chip, the list is whole again (its first read, kept, or read again without the type).
    await page.getByRole("button", { name: "Clear the type filter" }).click()
    await expect(page.getByText("Type is Bug", { exact: true })).toHaveCount(0)
    await expect(rows).toHaveCount(4)
  })

  test("the list grouped by type puts each task under its type, Task first", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server = newServer()
    await openProject(page, testInfo, server, "list")
    await expect(page.locator("[data-grouped-list] [data-task-id]").first()).toBeVisible({ timeout: 60_000 })
    // The stand-in project has no keys, and its Bug still shows its type on the row (V-459).
    await expect(page.locator("[data-grouped-list] [data-task-id]").filter({ hasText: "Fix the signup confirmation email" }).getByRole("img", { name: "Bug" })).toBeVisible()

    await page.getByRole("button", { name: "Display" }).click()
    await page.getByRole("combobox", { name: "Grouping" }).click()
    await page.getByRole("option", { name: "Type" }).click()
    await page.keyboard.press("Escape")

    const groups = page.locator("[data-grouped-list] section[data-group]")
    await expect(groups).toHaveCount(3)
    expect(await groups.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(["Task", "Bug", "Feature"])
    const group = (name: string) => page.locator(`[data-grouped-list] section[data-group][aria-label="${name}"]`)
    // Each header draws its type's glyph beside its name, said once; plain work is a Task.
    for (const t of TYPES) {
      await expect(group(t.name).locator(`[data-group-header] [data-type-glyph="${t.icon}"]`)).toBeVisible()
      await expect(group(t.name).locator("[data-group-header]").getByRole("img", { name: t.name })).toHaveCount(0)
    }
    await expect(group("Task").locator("[data-task-id]")).toHaveCount(2)
    await expect(group("Bug").locator("[data-task-id]")).toHaveText([/Fix the signup confirmation email/])
    await expect(group("Feature").locator("[data-task-id]")).toHaveText([/Set up SSO for the pilot customer/])
  })

  test("the board grouped by type has a column per type, and a card dropped in one takes its type", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server = newServer()
    await openProject(page, testInfo, server, "kanban")
    await expect(page.locator('[data-board] [data-column="todo"] [data-task-id]').first()).toBeVisible({ timeout: 60_000 })
    // No keys in this project: the Bug's card still carries its type on its top line (V-459).
    await expect(page.locator("[data-board] [data-task-id]").filter({ hasText: "Fix the signup confirmation email" }).getByRole("img", { name: "Bug" })).toBeVisible()

    await page.getByRole("button", { name: "Display" }).click()
    await page.getByRole("menuitemcheckbox", { name: "Type", exact: true }).click()
    await page.keyboard.press("Escape")

    const col = (id: string) => page.locator(`[data-board] [data-column="${id}"]`)
    await expect(col(BUG.id).locator("[data-task-id]")).toHaveText([/Fix the signup confirmation email/], { timeout: 30_000 })
    expect(await page.locator("[data-board] [data-column-slot]").evaluateAll((els) => els.map((el) => el.getAttribute("data-column-slot")))).toEqual(TYPES.map((t) => t.id))
    // Each column's head draws its type's glyph beside its name, which says the type once (CR-208 F1).
    for (const t of TYPES) {
      await expect(col(t.id).locator(`[data-column-head] [data-type-glyph="${t.icon}"]`)).toBeVisible()
      await expect(col(t.id).locator("[data-column-head]").getByRole("heading", { name: t.name, exact: true })).toBeVisible()
    }
    await expect(col(TYPES[0].id).locator("[data-task-id]")).toHaveCount(2)
    await expect(col(FEATURE.id).locator("[data-task-id]")).toHaveText([/Set up SSO for the pilot customer/])

    // A plain task carried into Bug's column becomes a Bug.
    const card = col(TYPES[0].id).locator("[data-task-id]").filter({ hasText: "Plan the webinar" })
    const from = (await card.boundingBox())!
    const to = (await col(BUG.id).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 3 })
    await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 16 })
    await expect(page.locator(".work-drag-overlay")).toBeVisible()
    await page.mouse.up()
    await expect.poll(() => server.retypes).toEqual([{ task_uuid: server.tasks[3].task_uuid, type_id: BUG.id }])
    await expect(col(BUG.id).locator("[data-task-id]").filter({ hasText: "Plan the webinar" })).toBeVisible()
    await expect(col(TYPES[0].id).locator("[data-task-id]")).toHaveCount(1)
  })
})

test.describe("a project's work by type on a phone at 390 (linear-03)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the Sort and filter sheet has a Type tab, and its choice reaches the server", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server = newServer()
    await openProject(page, testInfo, server, "list")
    const rows = page.locator("[data-phone-task-row]")
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    await expect(rows).toHaveCount(4)
    // No keys in this project: the phone row still shows the Bug's type (V-459).
    await expect(rows.filter({ hasText: "Fix the signup confirmation email" }).getByRole("img", { name: "Bug" })).toBeVisible()

    await page.getByRole("button", { name: "Filter tasks" }).tap()
    const sheet = page.locator('[data-vaul-drawer][data-state="open"]')
    await expect(sheet.getByText("Sort and filter", { exact: true })).toBeVisible()
    await sheet.getByText("Type", { exact: true }).tap()
    // The project's types, read while the sheet is open.
    await expect(sheet.getByRole("checkbox", { name: "Bug" })).toBeVisible({ timeout: 15_000 })
    await expect(sheet.getByRole("checkbox", { name: "Task" })).toBeVisible()
    await expect(sheet.getByRole("checkbox", { name: "Feature" })).toBeVisible()
    await sheet.getByRole("checkbox", { name: "Feature" }).tap()
    await sheet.getByRole("button", { name: "Apply" }).tap()
    await expect(sheet).toHaveCount(0)

    await expect.poll(() => typeFilterOf(server.reads.at(-1) ?? null)).toEqual([FEATURE.id])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText("Set up SSO for the pilot customer")

    // Opened again, the sheet shows the type still chosen.
    await page.getByRole("button", { name: "Filter tasks" }).tap()
    await sheet.getByText("Type", { exact: true }).tap()
    await expect(sheet.getByRole("checkbox", { name: "Feature" })).toBeChecked()
  })
})
