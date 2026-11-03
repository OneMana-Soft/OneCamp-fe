import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM as STUB_SAM, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { SCHEMES, SCREENS, press, screenUse, type Screen } from "./screens"

/**
 * Keeping task templates (linear-09, as Linear's issue templates): a project's admin makes, edits and deletes the
 * project's own in its tools (Delete with Undo), and a workspace admin the workspace's in Admin › Permissions. A
 * template is its type's default, asks for a field before a task is made, and presets a status and an assignee: a
 * person in a project, an AI teammate anywhere. Then New task, opened on its picker by Alt+C on the project's list (a
 * phone taps the Template chip), makes a task from one; the workspace's AI teammate preset shows on the Assignee chip
 * with their tag, though they aren't one of the project's people. On a computer and on a phone by touch, light and dark.
 */
const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
// The signed-in admin, a project member, named as the server names one: user_name is the name every picker shows.
const SAM = { ...STUB_SAM, user_name: "Sam Rivera" }
const ADMIN = { ...SAM, user_is_admin: true }
// An AI teammate: listed with the teammates (/user/dm-ai-targets), never among a project's people.
const ADA = { user_uuid: "ad0a0000-0000-4000-8000-00000000ada1", user_name: "Ada", user_full_name: "Ada", is_bot: true, user_bot_kind: "agent" }
const project = {
  project_uuid: P,
  project_name: "Website relaunch",
  project_key: "WEB",
  project_is_admin: true,
  project_is_member: true,
  project_team: { team_name: "Product" },
  project_members: [SAM],
}
const type = (builtin: string, name: string) => ({ id: `type-${builtin}`, builtin, name, icon: builtin })
const TYPES = [type("task", "Task"), type("bug", "Bug")]
// A project's field as the server sends it (business/TaskField's View), filter id included.
const CUSTOMER = { id: "f1", project_id: P, name: "Customer", type: "text", options: [], on_card: false, position: 0, filter_id: "field_f1" }

interface Template {
  id: string
  project_id: string
  name: string
  description?: string
  default_for?: string
  shape: Record<string, unknown>
}

/**
 * Task templates as the server keeps them (business/TaskTemplate): a project's list holds its own and the
 * workspace's; one default per type in a place; a delete can be undone; a read names the preset assignee while they
 * may have the project's tasks (assignee_who); make answers 422 with what the template requires and wasn't given.
 */
function templatesServer(seed: Template[]) {
  const kept = [...seed]
  const gone = new Map<string, { t: Template; at: number }>()
  const writes: { path: string; body: Record<string, unknown> }[] = []
  const made: Record<string, unknown>[] = []
  let next = 1
  const shown = (t: Template) => {
    const who = [SAM, ADA].find((u) => u.user_uuid === t.shape.assignee)
    return { ...t, ...(who && { assignee_who: who }) }
  }
  const answer = (place: string) => (url: URL, request: Request) => {
    const base = place ? `/project/${place}/task-templates` : "/project/task-templates"
    const path = url.pathname.slice(url.pathname.indexOf(base))
    const [id, what] = path.slice(base.length).split("/").filter(Boolean).map(decodeURIComponent)
    const listed = kept.filter((t) => !t.project_id || t.project_id === place)
    if (request.method() === "GET") {
      if (!id) {
        const defaults = Object.fromEntries(listed.filter((t) => t.default_for && (t.project_id === place || !listed.some((o) => o.project_id === place && o.default_for === t.default_for))).map((t) => [t.default_for, t.id]))
        const summary = (t: Template) => ({ id: t.id, project_id: t.project_id, name: t.name, description: t.description, default_for: t.default_for })
        return { msg: "ok", data: { templates: listed.map(summary), defaults, can_manage: true, can_manage_workspace: true, types: TYPES } }
      }
      const t = listed.find((x) => x.id === id)
      return t ? { msg: "ok", data: shown(t) } : withStatus(404, { msg: "That template was deleted a moment ago." })
    }
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    writes.push({ path, body })
    const t = kept.find((x) => x.id === id)
    if (what === "restore") {
      const was = gone.get(id)
      if (!was) return withStatus(404, { msg: "It can't be brought back." })
      kept.splice(was.at, 0, was.t)
      gone.delete(id)
      return { msg: "ok" }
    }
    if (id && !t) return withStatus(404, { msg: "That template was deleted a moment ago." })
    if (t && what === "make") {
      const fields = (body.fields ?? {}) as Record<string, unknown>
      const missing = ((t.shape.required ?? []) as string[]).filter((r) => (r.startsWith("field:") ? !fields[r.slice(6)] : !body[r]))
      if (missing.length) return withStatus(422, { msg: "This template asks for more", missing })
      made.push({ template: id, ...body })
      return { msg: "ok", data: { task_id: "00000000-0000-4000-8000-0000000000a9", subtasks: ((t.shape.subtasks ?? []) as unknown[]).length } }
    }
    if (t && what === "delete") {
      gone.set(id, { t, at: kept.indexOf(t) })
      kept.splice(kept.indexOf(t), 1)
      return { msg: "ok" }
    }
    // One default per type in a place: a new default takes the place of the last.
    if (body.default_for) for (const o of kept) if (o !== t && o.project_id === place && o.default_for === body.default_for) o.default_for = ""
    if (t) return { msg: "ok", data: shown(Object.assign(t, body)) }
    const added = { ...(body as Omit<Template, "id" | "project_id">), id: `tt${next++}`, project_id: place }
    kept.push(added)
    return { msg: "ok", data: shown(added) }
  }
  return { answer, writes, made }
}

type Server = ReturnType<typeof templatesServer>

/** The project page, New task, and Admin › Permissions as one admin of both sees them, with the templates kept by `server`. */
async function stub(page: Page, testInfo: TestInfo, server: Server) {
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: ADMIN },
    "/project/projectListByAdminUID": { msg: "ok", data: [project] },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [CUSTOMER], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: TYPES, icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] },
    },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    // On a phone the project page reads its entity (the offline outbox's read), answered as the board specs do.
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: project.project_name }, topic: `project/${P}` }] },
    [`/project/${P}/task-templates`]: server.answer(P),
    "/project/task-templates": server.answer(""),
    // Admin › Permissions' other cards, answered empty.
    "/admin/policies": { msg: "ok", data: [] },
    "/admin/capabilities": { msg: "ok", data: [] },
    "/project/plan/": { msg: "ok", data: { categories: [], statuses: [], labels: [], colors: [] } },
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [ADA] },
    "/user/botKinds": { msg: "ok", data: { [ADA.user_uuid]: "agent" } },
    "/notices": { msg: "ok", data: [] },
  })
}

/** Picks `option` in a select (the assignee's too), and waits for the trigger to show it. */
async function choose(screen: Screen, page: Page, trigger: Locator, option: RegExp) {
  await press(screen, trigger)
  await press(screen, page.getByRole("option", { name: option }))
  await expect(trigger).toContainText(option)
}

/** The editor's footer stays on the screen while its body scrolls (a phone's sheet pins it). */
async function expectFooterOnScreen(page: Page, editor: Locator) {
  const save = editor.getByRole("button", { name: "Save template" })
  const box = (await save.boundingBox())!
  const height = page.viewportSize()!.height
  expect(box.y + box.height, "Save template is on the screen").toBeLessThanOrEqual(height)
}

/**
 * A phone's template row puts its badge under the name, so the name keeps the row's width (DESIGN-BUILD-100, 3 Nov:
 * at 390 "Feature br…" was cut beside a whole "Default for Feature").
 */
async function expectBadgeUnderName(list: Locator, name: string, badge: string) {
  const row = list.getByRole("listitem").filter({ hasText: name })
  const [title, tag] = [row.getByText(name, { exact: true }), row.getByText(badge, { exact: true })]
  const [t, b] = [(await title.boundingBox())!, (await tag.boundingBox())!]
  expect(b.y, `the badge is under the name: ${JSON.stringify({ t, b })}`).toBeGreaterThanOrEqual(t.y + t.height - 1)
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth), "the name is whole").toBe(true)
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`Task templates kept, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))
      const at = screen.hasTouch ? "390" : "1280"

      test("a project's admin makes, edits and deletes the project's templates, and New task makes a task from one", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        // The workspace's template an admin made in Admin › Permissions: an AI teammate is its assignee.
        const server = templatesServer([{ id: "w1", project_id: "", name: "Agent triage", description: "Ada sorts what came in", shape: { name: "Triage: ", assignee: ADA.user_uuid, status: "todo" } }])
        await stub(page, testInfo, server)
        await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const actions = page.getByRole("button", { name: "Project actions" })
        await expect(actions).toBeVisible({ timeout: 60_000 })
        await press(screen, actions)
        await press(screen, page.getByRole("menuitem", { name: "Task templates" }))

        // The project's own (none yet) and the workspace's.
        const manager = page.getByRole("dialog", { name: "Task templates" })
        await expect(manager.getByText("No templates of its own yet.")).toBeVisible({ timeout: 30_000 })
        await expect(manager.getByRole("list", { name: "The workspace's templates" })).toContainText("Agent triage")
        await reviewShot(page, `task-templates-list-${at}`, scheme)

        // A new one: Bug's default, a preset status and person, a body in Markdown with its preview, a sub-task, and the
        // Customer it asks for before a task is made.
        await press(screen, manager.getByRole("button", { name: "New template" }))
        const editor = page.getByRole("dialog", { name: "New task template" })
        await editor.getByLabel("Template name").fill("Bug report")
        await editor.getByLabel("What it's for").fill("Steps, what you saw, what you expected")
        await editor.getByLabel("Task name").fill("Bug: ")
        await choose(screen, page, editor.getByRole("combobox", { name: "Type" }), /^Bug$/)
        await press(screen, editor.getByRole("switch", { name: "The default for its type" }))
        await expect(editor.getByText("New Bug tasks start from this template")).toBeVisible()
        await choose(screen, page, editor.getByRole("combobox", { name: "Priority" }), /^High$/)
        await choose(screen, page, editor.getByRole("combobox", { name: "Status" }), /^In progress$/)
        // The field draws the person's initials before the name, as New task's chip does.
        await choose(screen, page, editor.getByRole("combobox", { name: /^Assignee/ }), /Sam Rivera/)
        // "Ask for Labels" (its switch) is named with it.
        await editor.getByLabel("Labels", { exact: true }).fill("bug")
        const body = editor.getByRole("textbox", { name: "Description" })
        await press(screen, body)
        await body.fill("### Steps to see it\n\n1. Export the board")
        const preview = editor.getByRole("region", { name: "Preview" })
        await expect(preview.getByRole("heading", { name: "Steps to see it" })).toBeVisible()
        await expect(preview.getByRole("listitem")).toHaveText("Export the board")
        await press(screen, editor.getByRole("button", { name: "Add a sub-task" }))
        await editor.getByLabel("Sub-task 1", { exact: true }).fill("Reproduce") // not "Remove sub-task 1"
        await press(screen, editor.getByRole("switch", { name: "Ask for Customer" }))
        await expectFooterOnScreen(page, editor)
        await reviewShot(page, `task-templates-editor-${at}`, scheme)
        await press(screen, editor.getByRole("button", { name: "Save template" }))
        const own = manager.getByRole("list", { name: "This project's templates" })
        await expect(own).toContainText("Bug report", { timeout: 30_000 })
        await expect(own).toContainText("Default for Bug")
        if (screen.hasTouch) await expectBadgeUnderName(own, "Bug report", "Default for Bug")
        expect(server.writes).toHaveLength(1)
        expect(server.writes[0]).toMatchObject({
          path: `/project/${P}/task-templates`,
          body: {
            name: "Bug report",
            description: "Steps, what you saw, what you expected",
            default_for: "type-bug",
            shape: { name: "Bug: ", type: "type-bug", priority: "high", status: "inProgress", assignee: SAM.user_uuid, tags: "bug", subtasks: [{ name: "Reproduce" }], required: ["field:f1"] },
          },
        })
        expect((server.writes[0].body.shape as Record<string, unknown>).description).toBe("<h3>Steps to see it</h3><ol><li><p>Export the board</p></li></ol>")

        // Edited: it starts in review now; the body goes back as it came.
        await press(screen, manager.getByRole("button", { name: "Edit Bug report" }))
        const edit = page.getByRole("dialog", { name: "Edit “Bug report”" })
        await expect(edit.getByLabel("Template name")).toHaveValue("Bug report", { timeout: 30_000 })
        await expect(edit.getByRole("combobox", { name: /^Assignee/ })).toContainText("Sam Rivera")
        await choose(screen, page, edit.getByRole("combobox", { name: "Status" }), /^In review$/)
        await press(screen, edit.getByRole("button", { name: "Save template" }))
        await expect.poll(() => server.writes.length, { timeout: 30_000 }).toBe(2)
        expect(server.writes[1]).toMatchObject({
          path: `/project/${P}/task-templates/tt1`,
          body: { name: "Bug report", default_for: "type-bug", shape: { status: "inReview", assignee: SAM.user_uuid, description: "<h3>Steps to see it</h3><ol><li><p>Export the board</p></li></ol>", required: ["field:f1"] } },
        })
        await expect(own).toContainText("Default for Bug")

        // One made by mistake is deleted, Undo brings it back, and it goes again.
        await press(screen, manager.getByRole("button", { name: "New template" }))
        await page.getByRole("dialog", { name: "New task template" }).getByLabel("Template name").fill("Scratch")
        await press(screen, page.getByRole("button", { name: "Save template" }))
        await expect(own).toContainText("Scratch", { timeout: 30_000 })
        await press(screen, manager.getByRole("button", { name: "Delete Scratch" }))
        await expect(own).not.toContainText("Scratch", { timeout: 30_000 })
        const deleted = page.locator(".toast-card").filter({ hasText: "Deleted template “Scratch”" })
        await press(screen, deleted.getByRole("button", { name: "Undo" }))
        await expect(own).toContainText("Scratch", { timeout: 30_000 })
        await press(screen, manager.getByRole("button", { name: "Delete Scratch" }))
        await expect(own).not.toContainText("Scratch", { timeout: 30_000 })
        expect(server.writes.map((w) => w.path).slice(2)).toEqual([
          `/project/${P}/task-templates`,
          `/project/${P}/task-templates/tt2/delete`,
          `/project/${P}/task-templates/tt2/restore`,
          `/project/${P}/task-templates/tt2/delete`,
        ])
        await press(screen, manager.getByRole("button", { name: "Done" }))
        await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 })

        // New task on its picker: Alt+C on the project's list, or the Template chip on a phone.
        if (screen.hasTouch) {
          await page.goto("/app/create/task?project=web", { waitUntil: "domcontentloaded", timeout: 120_000 })
          await expect(page.getByRole("button", { name: /Website relaunch/ })).toBeVisible({ timeout: 60_000 })
          await press(screen, page.getByRole("button", { name: "Template" }))
        } else {
          await page.keyboard.press("Alt+KeyC")
        }
        const options = page.getByRole("option")
        await expect(options.filter({ hasText: "Bug report" })).toBeVisible({ timeout: 30_000 })
        await expect(options.filter({ hasText: "Agent triage" })).toBeVisible()

        // The workspace's template: its AI teammate isn't one of the project's people, and the chip names them, tagged.
        await press(screen, options.filter({ hasText: "Agent triage" }))
        const agent = page.getByRole("button", { name: "Assignee: Ada, AI teammate" })
        await expect(agent).toBeVisible({ timeout: 30_000 })
        await expect(agent.locator('[data-principal-tag="ai"]')).toBeVisible()
        await expect(agent.locator("[data-agent-avatar]")).toBeVisible()
        await reviewShot(page, `task-templates-agent-chip-${at}`, scheme)

        // The project's own: its type, status and person; Create asks for the Customer first, then makes it.
        await press(screen, page.getByRole("button", { name: "Template: Agent triage" }))
        await press(screen, page.getByRole("option").filter({ hasText: "Bug report" }))
        await expect(page.getByRole("button", { name: "Template: Bug report" })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByRole("button", { name: "Assignee: Sam Rivera" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Status: In review" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Type: Bug" })).toBeVisible()
        const title = page.getByLabel("Task title")
        await expect(title).toHaveValue("Bug: ")
        await title.fill("Bug: export drops rows")
        const create = page.getByRole("button", { name: "Create task" })
        await press(screen, create)
        await expect(page.getByRole("alert").filter({ hasText: "This template asks for" })).toContainText("Customer", { timeout: 30_000 })
        await page.getByLabel("Customer").fill("Acme")
        await press(screen, create)
        await expect.poll(() => server.made.length, { timeout: 30_000 }).toBe(1)
        expect(server.made[0]).toMatchObject({ template: "tt1", name: "Bug: export drops rows", status: "inReview", assignee: SAM.user_uuid, type: "type-bug", fields: { f1: "Acme" } })
        // Nothing the project couldn't take (no left_off) and no Create more: New task closes, as after any task it makes
        // (a computer's dialog; a phone's page goes back to the project). "Created" shows only while the form stays.
        if (screen.hasTouch) await expect(page).toHaveURL(new RegExp(`/app/project/${P}`), { timeout: 30_000 })
        else await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 })
        await expectEveryCallAnswered(page)
      })

      test("a workspace admin makes, edits and deletes the workspace's templates in Admin › Permissions", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        const server = templatesServer([])
        await stub(page, testInfo, server)
        await page.goto("/app/admin?tab=permissions", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const section = page.locator("#task-templates")
        await expect(section.getByText("No templates yet. Make one for the tasks your teams start most.")).toBeVisible({ timeout: 60_000 })
        await section.scrollIntoViewIfNeeded()
        await press(screen, section.getByRole("button", { name: "New template" }))

        // Every project's: a built-in type, a built-in status, and an AI teammate (people are per project).
        const editor = page.getByRole("dialog", { name: "New task template" })
        await editor.getByLabel("Template name").fill("Agent triage")
        await editor.getByLabel("What it's for").fill("Ada sorts what came in")
        await choose(screen, page, editor.getByRole("combobox", { name: "Type" }), /^Task$/)
        await press(screen, editor.getByRole("switch", { name: "The default for its type" }))
        await choose(screen, page, editor.getByRole("combobox", { name: "Status" }), /^To do$/)
        const assignee = editor.getByRole("combobox", { name: /^Assignee/ })
        await press(screen, assignee)
        await expect(page.getByRole("option", { name: /^Ada/ })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByRole("option", { name: /Sam Rivera/ })).toHaveCount(0)
        await press(screen, page.getByRole("option", { name: /^Ada/ }))
        await expect(assignee).toContainText("Ada")
        await expectFooterOnScreen(page, editor)
        await reviewShot(page, `task-templates-workspace-editor-${at}`, scheme)
        await press(screen, editor.getByRole("button", { name: "Save template" }))
        const list = section.getByRole("list", { name: "The workspace's templates" })
        await expect(list).toContainText("Agent triage", { timeout: 30_000 })
        await expect(list).toContainText("Default for Task")
        expect(server.writes[0]).toMatchObject({
          path: "/project/task-templates",
          body: { name: "Agent triage", description: "Ada sorts what came in", default_for: "type-task", shape: { type: "type-task", status: "todo", assignee: ADA.user_uuid } },
        })

        // Edited: its tasks start in progress; Ada stays.
        await press(screen, list.getByRole("button", { name: "Edit Agent triage" }))
        const edit = page.getByRole("dialog", { name: "Edit “Agent triage”" })
        await expect(edit.getByRole("combobox", { name: /^Assignee/ })).toContainText("Ada", { timeout: 30_000 })
        await choose(screen, page, edit.getByRole("combobox", { name: "Status" }), /^In progress$/)
        await press(screen, edit.getByRole("button", { name: "Save template" }))
        await expect.poll(() => server.writes.length, { timeout: 30_000 }).toBe(2)
        expect(server.writes[1]).toMatchObject({ path: "/project/task-templates/tt1", body: { default_for: "type-task", shape: { status: "inProgress", assignee: ADA.user_uuid } } })

        // Deleted, back with Undo, and gone again.
        await press(screen, list.getByRole("button", { name: "Delete Agent triage" }))
        await expect(section.getByText("No templates yet. Make one for the tasks your teams start most.")).toBeVisible({ timeout: 30_000 })
        const deleted = page.locator(".toast-card").filter({ hasText: "Deleted template “Agent triage”" })
        await press(screen, deleted.getByRole("button", { name: "Undo" }))
        await expect(list).toContainText("Agent triage", { timeout: 30_000 })
        await press(screen, list.getByRole("button", { name: "Delete Agent triage" }))
        await expect(section.getByText("No templates yet. Make one for the tasks your teams start most.")).toBeVisible({ timeout: 30_000 })
        expect(server.writes.map((w) => w.path).slice(2)).toEqual(["/project/task-templates/tt1/delete", "/project/task-templates/tt1/restore", "/project/task-templates/tt1/delete"])
        await expectEveryCallAnswered(page)
      })
    })
  }
}
