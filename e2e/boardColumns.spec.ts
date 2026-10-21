import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Board columns in the project's order (design/projects-vs-asana-jira/
// BOARD_COLUMNS_PLAN.md; the owner: "shouldnt user be able to drag and
// rearrange the coloumn"). A project admin drags a column by the grip in its
// head, or moves it from the keys or its menu; the order is the project's, so
// it is saved and comes back after a reload. Done and Cancelled stay after
// the open columns. A member gets no grip and no moves. With SHOTS_DIR set,
// each step is also saved for review, at the viewport and theme it ran in.
// The server here is a stateful stand-in: it keeps the order it was sent.

const P = "9e0a0000-0000-4000-8000-0000000000c0"
const NONE = "0001-01-01T00:00:00Z"
const DEFAULT = ["backlog", "todo", "inProgress", "inReview", "done", "canceled"]
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const MEMBER = { ...ADMIN, role: "member", edit_tasks: "own", delete_tasks: "own", manage: false, manage_people: false, archive: false }

const TASKS = [
  ["Write the launch announcement", "inProgress"],
  ["Review the pricing page copy", "todo"],
  ["Record the product walkthrough", "todo"],
  ["Set up SSO for the pilot customer", "inProgress"],
  ["Plan the webinar", "todo"],
  ["Fix the signup confirmation email", "done"],
].map(([name, status], i) => ({
  task_uuid: `7a5c00c0-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: name,
  task_status: status,
  task_priority: i % 3 ? "medium" : "high",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
}))
const column = (status: string) => TASKS.filter((t) => t.task_status === status)

/** The project's statuses as the server answers them: the built-in six, in the saved order. */
const statuses = (order: string[]) => ({ msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20, order } })

type Server = { order: string[]; saved: string[][]; refuse: boolean }

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openBoard(page: Page, testInfo: TestInfo, access: typeof ADMIN, server: Server) {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: access.manage ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: access }
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo"),
        project_tasks_in_progress: column("inProgress"),
        project_tasks_in_review: [],
        project_tasks_done: column("done"),
        project_tasks_canceled: [],
        project_tasks_done_count: column("done").length,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 3, inProgress: 2, inReview: 0, done: 1, canceled: 0 },
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    // Read each time: after a save, a reload reads what was saved.
    [`/project/${P}/statuses`]: () => statuses(server.order),
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    // A card the pointer passes on its way to a column's head is read ahead (the panel's warm-up).
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? TASKS[0]
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    // The board listens on the project's topic for its statuses (useLiveEntity).
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  // The order's save, after stubBackend so it comes first: keeps what it is
  // sent, or refuses as the server does someone who is no longer an admin.
  await page.route(/\/project\/[^/]+\/statuses\/order$/, async (route) => {
    const request = route.request()
    const headers = cors(request)
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    if (server.refuse) return route.fulfill({ status: 403, headers, json: { msg: "Only the project's admins can change its statuses." } })
    const { order } = request.postDataJSON() as { order: string[] }
    server.saved.push(order)
    server.order = order
    return route.fulfill({ status: 200, headers, json: statuses(order) })
  })
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-board] [data-column="todo"] [data-task-id]').first()).toBeVisible({ timeout: 60_000 })
}

/** The board's columns, left to right. */
const shown = (page: Page) => page.locator("[data-board] [data-column-slot]").evaluateAll((els) => els.map((el) => el.getAttribute("data-column-slot")))
const head = (page: Page, value: string) => page.locator(`[data-board] [data-column="${value}"] [data-column-head]`)

/** Picks a column up by its grip and carries it to x, over the columns' heads. */
async function carry(page: Page, label: string, value: string, x: number) {
  await head(page, value).hover()
  const grip = page.getByRole("button", { name: `Move the ${label} column` })
  await expect(grip).toBeVisible()
  const box = (await grip.boundingBox())!
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Past the board's 5 px before a drag starts, then across.
  await page.mouse.move(from.x + 10, from.y + 4, { steps: 3 })
  await page.mouse.move(x, from.y + 60, { steps: 14 })
}

async function box(page: Page, value: string) {
  return (await page.locator(`[data-board] [data-column="${value}"]`).boundingBox())!
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png, with no stray toast. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`board columns at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("an admin drags a column into place; the order is saved and survives a reload", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { order: DEFAULT, saved: [], refuse: false }
      await openBoard(page, testInfo, ADMIN, server)
      expect(await shown(page)).toEqual(["todo", "inProgress", "done"])
      await head(page, "inProgress").hover()
      await expect(page.getByRole("button", { name: "Move the In progress column" })).toBeVisible()
      await shot(page, "grip", theme)

      // In progress before To do: the line shows the gap, a copy of the head follows the pointer.
      const todo = await box(page, "todo")
      await carry(page, "In progress", "inProgress", todo.x + 24)
      await expect(page.locator("[data-column-drop-line]")).toBeVisible()
      await expect(page.locator("[data-column-lift]")).toBeVisible()
      await expect(page.locator('[data-column="inProgress"]')).toHaveAttribute("data-column-lifted", "pointer")
      await shot(page, "drag", theme)
      await page.mouse.up()

      await expect.poll(() => shown(page)).toEqual(["inProgress", "todo", "done"])
      // The hidden columns keep their places in the project's order.
      expect(server.saved).toEqual([["backlog", "inProgress", "todo", "inReview", "done", "canceled"]])
      await expect(page.locator("[data-column-drop-line]")).toHaveCount(0)
      await shot(page, "dropped", theme)

      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(page.locator('[data-board] [data-column="todo"] [data-task-id]').first()).toBeVisible({ timeout: 60_000 })
      expect(await shown(page)).toEqual(["inProgress", "todo", "done"])
    })

    test("the keys move a column, and the column menu says where it can go", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { order: DEFAULT, saved: [], refuse: false }
      await openBoard(page, testInfo, ADMIN, server)
      const grip = page.getByRole("button", { name: "Move the To do column" })
      await grip.focus()
      await page.keyboard.press("Space")
      await expect(page.locator('[data-column="todo"]')).toHaveAttribute("data-column-lifted", "keys")
      await page.keyboard.press("ArrowRight")
      await expect(page.locator("[data-column-drop-line]")).toBeVisible()
      await shot(page, "keys", theme)
      await page.keyboard.press("Space")
      await expect.poll(() => shown(page)).toEqual(["inProgress", "todo", "done"])
      expect(server.saved).toEqual([["backlog", "inProgress", "todo", "inReview", "done", "canceled"]])
      // The grip keeps the focus through the move, for the next one.
      await expect(grip).toBeFocused()

      // Done stays after the open columns: To do, now next to it, can't pass it.
      await head(page, "todo").hover()
      await page.getByRole("button", { name: "To do column actions" }).click()
      await expect(page.getByRole("menuitem", { name: "Move left" })).toBeEnabled()
      await expect(page.getByRole("menuitem", { name: "Move right" })).toBeDisabled()
      await shot(page, "menu", theme)
      await page.getByRole("menuitem", { name: "Move left" }).click()
      await expect.poll(() => shown(page)).toEqual(["todo", "inProgress", "done"])
      expect(server.saved.at(-1)).toEqual(DEFAULT)
    })
  })
}

test.describe("board columns at 1280: the rules", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("a column can't be dropped past Done: no line, and nothing changes", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server: Server = { order: DEFAULT, saved: [], refuse: false }
    await openBoard(page, testInfo, ADMIN, server)
    const done = await box(page, "done")
    await carry(page, "To do", "todo", done.x + done.width - 16)
    await expect(page.locator("[data-column-lift]")).toBeVisible()
    await expect(page.locator("[data-column-drop-line]")).toHaveCount(0)
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(await shown(page)).toEqual(["todo", "inProgress", "done"])
    expect(server.saved).toEqual([])
  })

  test("a move the server refuses is put back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server: Server = { order: DEFAULT, saved: [], refuse: true }
    await openBoard(page, testInfo, ADMIN, server)
    await head(page, "todo").hover()
    await page.getByRole("button", { name: "To do column actions" }).click()
    await page.getByRole("menuitem", { name: "Move right" }).click()
    await expect(page.getByText("Only the project's admins can change its statuses.").first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => shown(page)).toEqual(["todo", "inProgress", "done"])
  })

  test("a member sees no grip and no moves", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const server: Server = { order: DEFAULT, saved: [], refuse: false }
    await openBoard(page, testInfo, MEMBER, server)
    await head(page, "todo").hover()
    await expect(page.getByRole("button", { name: /^Move the .* column$/ })).toHaveCount(0)
    await page.getByRole("button", { name: "To do column actions" }).click()
    await expect(page.getByRole("menuitem", { name: "Collapse" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: /^Move (left|right)$/ })).toHaveCount(0)
  })
})

for (const theme of ["light", "dark"] as const) {
  test.describe(`board columns at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a phone has no grip; the column menu moves a column", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { order: DEFAULT, saved: [], refuse: false }
      await openBoard(page, testInfo, ADMIN, server)
      await expect(page.getByRole("button", { name: /^Move the .* column$/ })).toHaveCount(0)
      await page.getByRole("button", { name: "To do column actions" }).tap()
      await expect(page.getByRole("menuitem", { name: "Move left" })).toBeDisabled()
      await expect(page.getByRole("menuitem", { name: "Move right" })).toBeEnabled()
      await shot(page, "menu", theme)
      await page.getByRole("menuitem", { name: "Move right" }).tap()
      await expect.poll(() => shown(page)).toEqual(["inProgress", "todo", "done"])
      expect(server.saved).toEqual([["backlog", "inProgress", "todo", "inReview", "done", "canceled"]])
      await shot(page, "moved", theme)
    })
  })
}
