import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SCHEMES, SCREENS, press, screenUse, type Screen } from "./screens"
import { SAM, TASK_PANEL_READS, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// A project's Releases tab (P10-1b web; jira-04, linear-36), on a computer
// (the side sheet) and a phone (the drawer, its actions pinned in its
// footer), light and dark: the list with its states and stage chips, the
// empty tab, a release opened, the admin's changes (a task put in, Mark
// released, Delete with Undo) and a member's view, which offers no change.
// jira-04 Head B: Mark released's drawer moves the unfinished tasks to another
// planned release; the sheet's Burndown view; a task's Release row (More
// fields; a sheet on a phone); and the list's Release filter (the Filter menu
// on a computer, the Sort and filter sheet on a phone), sent as ?filters=,
// and the list it answers. Its states: a release with no tasks, a burndown
// that can't be read (Try again), a refused Mark released; and the keyboard's
// focus on the Release field and on Mark released's choices.

const P = "9e0a0000-0000-4000-8000-0000000010b1"
const R1 = "7e1e0000-0000-4000-8000-000000000001"
const R0 = "7e1e0000-0000-4000-8000-000000000000"
const R2 = "7e1e0000-0000-4000-8000-000000000002"
const T = (i: number) => `7a5c10b1-0000-4000-8000-${String(i).padStart(12, "0")}`
const project = (admin: boolean) => ({
  project_uuid: P,
  project_name: "Website relaunch",
  project_key: "WEB",
  project_is_admin: admin,
  project_is_member: true,
  project_members: [SAM],
})
const task = (i: number, name: string, status = "todo") => ({ task_uuid: T(i), task_key: `WEB-${i}`, task_name: name, task_status: status, source: "manual", added_at: "2026-11-01T09:00:00Z" })

function releases(admin: boolean) {
  const later = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10)
  return [
    {
      id: R2, project_id: P, name: "v2.5", state: "planned", target_date: null, released_at: null, repo: "", tag: "", notes: "",
      progress: { total: 0, started: 0, done: 0 }, stages: [], can_edit: admin, tasks: [] as ReturnType<typeof task>[],
    },
    {
      id: R1, project_id: P, name: "v2.4", state: "planned", target_date: later, released_at: null, repo: "acme/web", tag: "v2.4.0",
      notes: admin ? "" : "The new pricing page, and a faster sign-up.",
      progress: { total: 3, started: 1, done: 1 },
      stages: [
        { provider: "github", repo: "acme/web", kind: "build", name: "CI", status: "success", sha: "4f2a9c1d", url: "https://github.com/acme/web/actions/runs/101", reported_at: "2026-11-06T10:00:00Z" },
        { provider: "github", repo: "acme/web", kind: "deploy", name: "staging", status: "in_progress", sha: "4f2a9c1d", url: "", reported_at: "2026-11-06T10:04:00Z" },
      ],
      can_edit: admin,
      tasks: [task(7, "Ship the pricing page", "done"), task(8, "Speed up sign-up", "inProgress"), task(9, "Write the launch post")],
    },
    {
      id: R0, project_id: P, name: "v2.3", state: "released", target_date: null, released_at: "2026-10-30T09:00:00Z", repo: "", tag: "", notes: "Calendar fixes.",
      progress: { total: 4, started: 0, done: 4 },
      stages: [{ provider: "github", repo: "acme/web", kind: "deploy", name: "production", status: "failure", sha: "9b1c", url: "https://github.com/acme/web/actions/runs/99", reported_at: "2026-10-30T09:10:00Z" }],
      can_edit: admin,
      tasks: [] as ReturnType<typeof task>[],
    },
  ]
}

/** A row of the project's list, as the server sends it. */
const listRow = (i: number, name: string, status: string) => ({
  ...task(i, name, status),
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-11-01T09:00:00Z",
  task_status_since: "2026-11-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Website relaunch" },
})
/** The project's list: v2.4's three tasks and one in no release. */
const LIST = [listRow(7, "Ship the pricing page", "done"), listRow(8, "Speed up sign-up", "inProgress"), listRow(9, "Write the launch post", "todo"), listRow(10, "Translate the pricing page", "todo")]
const IN_V24 = [T(7), T(8), T(9)]

/** v2.4's burndown: three days in, one task done of three, then the fourth put in; nine days to its target. */
function BURNDOWN() {
  const day = (i: number) => new Date(Date.now() + (i - 3) * 86_400_000).toISOString().slice(0, 10)
  const days = Array.from({ length: 13 }, (_, i) => day(i))
  return { days, scope: [3, 3, 3, 4], remaining: [3, 3, 2, 3], ideal: days.map((_, i) => Math.round((30 * (12 - i)) / 12) / 10), tasks: 4, done: 1, open: 3, estimated: 0, hours: 0 }
}
/** v2.5's: no tasks yet, and no target day. */
const EMPTY_BURNDOWN = () => ({ days: [new Date().toISOString().slice(0, 10)], scope: [0], remaining: [0], ideal: null, tasks: 0, done: 0, open: 0, estimated: 0, hours: 0 })

/** The release filter the list's last read carried to the server (?filters=, as task_cycle's). */
const releaseFilterOf = (filters: string | null) => (JSON.parse(filters || "[]") as { id: string; value: string[] }[]).find((f) => f.id === "task_release")?.value

/**
 * The project's server: its releases as the test leaves them, and every write it was sent. Its first
 * `burndownFails` burndown reads answer 500; `shipRefused` is the words it refuses Mark released with.
 */
async function open(
  page: Page,
  testInfo: TestInfo,
  { admin = true, empty = false, path, burndownFails = 0, shipRefused }: { admin?: boolean; empty?: boolean; path?: string; burndownFails?: number; shipRefused?: string } = {},
) {
  const state = { list: empty ? [] : releases(admin), posts: [] as string[], bodies: {} as Record<string, unknown>, reads: [] as (string | null)[], field: [R1], burndownReads: [] as string[] }
  const one = (id: string) => state.list.find((r) => r.id === id)
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project(admin)] },
    // The list: the project's tasks, or, filtered by release, the tasks in the releases named (here v2.4's).
    [`/project/taskList/${P}`]: (url: URL) => {
      const filters = url.searchParams.get("filters")
      state.reads.push(filters)
      const inRelease = releaseFilterOf(filters)
      const tasks = !inRelease ? LIST : LIST.filter((t) => inRelease.includes(R1) && IN_V24.includes(t.task_uuid))
      return { msg: "ok", data: { ...project(admin), project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project(admin) },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project(admin) },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project(admin) },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: admin } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: admin } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: admin } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project(admin), project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] },
    },
    [`/project/${P}/timeline`]: { msg: "ok", data: { tasks: [{ task_uuid: T(10), task_name: "Translate the pricing page", task_status: "todo" }, { task_uuid: T(7), task_name: "Ship the pricing page", task_status: "done" }], total: 2, can_edit: admin } },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: admin ? "admin" : "view", data: { project_name: "Website relaunch" }, topic: `project/${P}` }] },
    [`/project/${P}/releases`]: (url: URL, request: Request) => {
      const rest = url.pathname.split(`/project/${P}/releases`)[1]
      if (request.method() === "GET") {
        if (!rest) return { msg: "ok", data: { releases: state.list.map((r) => ({ ...r, tasks: undefined })), can_edit: admin, next_cursor: "" } }
        if (rest.endsWith("/burndown")) {
          const id = rest.split("/")[1]
          state.burndownReads.push(id)
          if (state.burndownReads.length <= burndownFails) return withStatus(500, { msg: "Something went wrong." })
          return { msg: "ok", data: { release: one(id), burndown: id === R1 ? BURNDOWN() : EMPTY_BURNDOWN() } }
        }
        return { msg: "ok", data: one(rest.slice(1)) }
      }
      state.posts.push(rest)
      state.bodies[rest] = request.postDataJSON()
      const [, id, what] = rest.split("/")
      const r = one(id)!
      if (what === "ship" && shipRefused) return withStatus(409, { msg: shipRefused })
      if (what === "ship") {
        // As the server's ship: the unfinished tasks stay, go to move_to's release, or out of any ("none").
        const to = (state.bodies[rest] as { move_to?: string } | null)?.move_to
        const open = r.tasks.filter((t) => t.task_status !== "done" && t.task_status !== "canceled")
        if (to) r.tasks = r.tasks.filter((t) => !open.includes(t))
        if (to && to !== "none") one(to)!.tasks.push(...open)
        Object.assign(r, { state: "released", released_at: new Date().toISOString() })
        return { msg: "Release marked released.", data: { moved: to ? open.length : 0 } }
      }
      if (what === "delete") state.list = state.list.filter((x) => x.id !== id)
      if (what === "tasks" && !rest.endsWith("/remove")) {
        const ids = (request.postDataJSON() as { task_uuids: string[] }).task_uuids
        r.tasks.push(task(10, "Translate the pricing page"))
        r.progress.total += 1
        return { msg: "ok", data: { added: ids, already: [], refused: [] } }
      }
      return { msg: "ok" }
    },
    "/restore/release/": (url: URL) => {
      state.posts.push(url.pathname)
      state.list = releases(admin)
      return { msg: "Release restored." }
    },
    // A task's Release row: the releases it is in, its project's to offer (one that's out closed to a non-admin), set as a whole.
    "/task/release": (_url: URL, request: Request) => {
      if (request.method() === "POST") state.field = (request.postDataJSON() as { release_ids: string[] }).release_ids
      const list = releases(admin)
      return { msg: "ok", data: { releases: list.filter((r) => state.field.includes(r.id)), options: list, can_edit: true, can_change_released: false } }
    },
    "/task/info/": (url: URL) => ({
      msg: "ok",
      data: { ...task(9, "Write the launch post"), task_uuid: url.pathname.split("/").pop(), task_project: { project_uuid: P, project_name: "Website relaunch" }, task_access: { view: true, edit: true }, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
    }),
    // The task page's other rows, empty: its estimate scale, its project's milestones and its own.
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: admin } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: admin } },
    "/task/milestone/": { msg: "ok", data: null },
    ...TASK_PANEL_READS,
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(path ?? `/app/project/${P}?tab=releases`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return state
}

/** The release's sheet (a computer) or drawer (a phone). */
const sheetOf = (page: Page) => page.getByRole("dialog", { name: "v2.4" })

async function footerPinned(page: Page, screen: Screen, button: ReturnType<Page["getByRole"]>) {
  await expect(button).toBeInViewport({ ratio: 1 })
  if (screen.hasTouch) expect((await button.boundingBox())!.y).toBeGreaterThan(844 / 2)
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`Releases, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("an admin reads the list, opens a release, puts a task in, marks it released and deletes it with Undo", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        const state = await open(page, testInfo)
        const row = page.locator(`[data-release-row="${R1}"]`)
        await expect(row).toBeVisible({ timeout: 60_000 })
        await expect(row).toContainText("Planned")
        await expect(row).toContainText("1 of 3 done")
        await expect(row.locator('[data-stage-chip="ok"]')).toContainText("CI passed")
        await expect(row.locator('[data-stage-chip="running"]')).toContainText("Staging deploying")
        await expect(page.locator(`[data-release-row="${R0}"] [data-stage-chip="failed"]`)).toContainText("Production failed")
        await expect(page.getByRole("button", { name: "New release" })).toBeVisible()
        await reviewShot(page, "releases-list", scheme)

        await press(screen, row)
        const sheet = sheetOf(page)
        await expect(sheet.getByText("Speed up sign-up")).toBeVisible({ timeout: 30_000 })
        await expect(sheet.getByRole("link", { name: /Open the run/ }).first()).toHaveAttribute("href", "https://github.com/acme/web/actions/runs/101")
        const ship = sheet.getByRole("button", { name: "Mark released" })
        await footerPinned(page, screen, ship)
        await reviewShot(page, screen.hasTouch ? "releases-drawer" : "releases-sheet", scheme)

        await press(screen, sheet.getByRole("button", { name: "Add tasks" }))
        // The shared task picker (ProjectTaskPick), a panel of the release's sheet on a phone.
        await expect(page.getByRole("option", { name: /Translate the pricing page/ })).toBeVisible()
        await reviewShot(page, "releases-pick", scheme)
        await press(screen, page.getByRole("option", { name: /Translate the pricing page/ }))
        await expect(sheet.getByText("Translate the pricing page")).toBeVisible()
        // A pick closes the picker (the shared combobox's one-pick rule); the release stays open.
        await expect(page.getByRole("option", { name: /Translate the pricing page/ })).toHaveCount(0)
        await expect(sheet).toBeVisible()

        // The Burndown view: the work going down against an even pace to the target day.
        await press(screen, sheet.getByRole("radio", { name: "Burndown" }))
        // The stat and the legend share the name.
        await expect(sheet.getByText("Ideal pace").first()).toBeVisible({ timeout: 30_000 })
        await expect(sheet.getByText(/tasks? left/).first()).toBeVisible()
        await reviewShot(page, "releases-burndown", scheme)
        await press(screen, sheet.getByRole("radio", { name: "Overview" }))

        // Mark released asks what becomes of the unfinished tasks (jira-04 part 4): here, to v2.5.
        await press(screen, ship)
        const drawer = page.getByRole("dialog", { name: "Mark v2.4 released" })
        await expect(drawer.getByText(/^3 tasks aren't done\./)).toBeVisible()
        for (const name of ["Speed up sign-up", "Write the launch post", "Translate the pricing page"]) await expect(drawer.getByText(name)).toBeVisible()
        await expect(drawer.getByText("Ship the pricing page")).toHaveCount(0)
        await expect(drawer.getByRole("radio")).toHaveCount(3)
        const go = drawer.getByRole("button", { name: "Mark released" })
        await footerPinned(page, screen, go)
        const move = drawer.getByRole("radio", { name: "Move them to v2.5" })
        if (screen.hasTouch) await press(screen, move)
        else {
          // By keyboard: an arrow key from the first choice checks the next, with the focus ring on it.
          // The key is held as a hand holds it: the radio group moves its focus a tick after the keydown, and checks on it only while the key is down.
          await drawer.getByRole("radio", { name: "Keep them in v2.4" }).focus()
          await page.keyboard.down("ArrowDown")
          await expect(move).toBeFocused()
          await page.keyboard.up("ArrowDown")
          await expect(move).toHaveAttribute("aria-checked", "true")
          expect(await move.evaluate((e) => e.matches(":focus-visible"))).toBe(true)
          await reviewShot(page, "releases-ship-focus", scheme)
          // releases-ship is the same frame without the focus, beside which the ring is read.
          await move.evaluate((e) => (e as HTMLElement).blur())
        }
        await expect(move).toHaveAttribute("aria-checked", "true")
        await reviewShot(page, "releases-ship", scheme)
        await press(screen, go)
        await expect(drawer).toHaveCount(0)
        await expect(sheet.getByRole("button", { name: "Mark released" })).toHaveCount(0)
        expect(state.bodies[`/${R1}/ship`]).toEqual({ move_to: R2 })
        await expect(sheet.getByText("Speed up sign-up")).toHaveCount(0)

        await press(screen, sheet.getByRole("button", { name: "Delete" }))
        await expect(sheet).toHaveCount(0)
        expect(state.posts).toContain(`/${R1}/delete`)
        await expect(row).toHaveCount(0)
        await press(screen, page.getByRole("button", { name: "Undo" }))
        await expect(row).toBeVisible()
        expect(state.posts).toContain(`/restore/release/${R1}`)
        await expectEveryCallAnswered(page)
      })

      test("a task's Release row picks from its project's releases, one that's out named so and closed, and saves the whole set", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        const state = await open(page, testInfo, { path: `/app/task/${T(9)}` })
        const more = page.getByRole("button", { name: /More fields/ })
        await expect(more).toBeVisible({ timeout: 60_000 })
        await press(screen, more)
        const box = page.locator('[data-property="release"]').getByRole("combobox", { name: "Release" })
        await expect(box).toHaveText(/v2\.4/, { timeout: 30_000 })
        if (!screen.hasTouch) {
          // The keyboard onto the field: the focus ring on its trigger, read beside the same frame without it.
          await reviewShot(page, "releases-field-unfocused", scheme)
          await box.focus()
          await page.keyboard.press("Shift+Tab")
          await page.keyboard.press("Tab")
          await expect(box).toBeFocused()
          expect(await box.evaluate((e) => e.matches(":focus-visible"))).toBe(true)
          await reviewShot(page, "releases-field-focus", scheme)
        }
        await press(screen, box)
        const next = page.getByRole("option", { name: /v2\.5/ })
        await expect(next).toBeVisible()
        // A release that's out says so in its name, and is closed to a non-admin.
        await expect(page.getByRole("option", { name: "v2.3 · released", exact: true })).toHaveAttribute("aria-disabled", "true")
        if (screen.hasTouch) {
          // A sheet from the foot of the screen, not a popover.
          const b = (await next.boundingBox())!
          expect(b.y).toBeGreaterThan(844 / 3)
        }
        await reviewShot(page, "releases-task-field", scheme)
        await press(screen, next)
        await expect.poll(() => state.field).toEqual([R1, R2])
        await page.keyboard.press("Escape")
        // In the server's order: the project's newest first.
        await expect(box).toHaveText(/v2\.5, v2\.4/)
        await expectEveryCallAnswered(page)
      })

      test("the list's Release filter reaches the server, is named in words, and lists the tasks it answers", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        const state = await open(page, testInfo, { path: `/app/project/${P}?tab=list` })
        const rowOf = (i: number) => page.locator(`[data-task-id="${T(i)}"]`)
        // Unfiltered, the list has the task in no release too.
        await expect(rowOf(10).first()).toBeVisible({ timeout: 60_000 })
        if (screen.hasTouch) {
          const filter = page.getByRole("button", { name: "Filter tasks" })
          await expect(filter).toBeVisible({ timeout: 60_000 })
          await filter.tap()
          const sheet = page.locator('[data-vaul-drawer][data-state="open"]')
          await sheet.getByText("Release", { exact: true }).tap()
          await expect(sheet.getByRole("checkbox", { name: "v2.4" })).toBeVisible({ timeout: 15_000 })
          await expect(sheet.getByRole("checkbox", { name: "No release" })).toBeVisible()
          await sheet.getByRole("checkbox", { name: "v2.4" }).tap()
          await reviewShot(page, "releases-filter", scheme)
          await sheet.getByRole("button", { name: "Apply" }).tap()
          await expect(sheet).toHaveCount(0)
        } else {
          const filter = page.getByRole("button", { name: "Filter" })
          await expect(filter).toBeVisible({ timeout: 60_000 })
          await filter.click()
          const facet = page.getByRole("menuitem", { name: "Release", exact: true })
          await facet.hover()
          const sub = page.locator(`[id="${await facet.getAttribute("aria-controls")}"]`)
          await expect(sub.getByRole("menuitemcheckbox")).toHaveText(["No release", "v2.5", "v2.4", "v2.3"])
          await sub.getByRole("menuitemcheckbox", { name: "v2.4", exact: true }).click()
          await reviewShot(page, "releases-filter", scheme)
          await page.keyboard.press("Escape")
          await page.keyboard.press("Escape")
        }
        await expect.poll(() => releaseFilterOf(state.reads.at(-1) ?? null)).toEqual([R1])
        // The list the server answered: v2.4's tasks, not the one in no release; on a computer under the filter's chip
        // (a phone keeps what's filtered in its Sort and filter sheet).
        if (!screen.hasTouch) await expect(page.getByText("Release is v2.4", { exact: true })).toBeVisible()
        for (const [i, name] of [[7, "Ship the pricing page"], [8, "Speed up sign-up"], [9, "Write the launch post"]] as const) await expect(rowOf(i).first()).toContainText(name)
        await expect(rowOf(10)).toHaveCount(0)
        await reviewShot(page, "releases-filter-result", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a release's burndown with no tasks and one that can't be read, and a refused Mark released", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        const words = "Only the project's admins can mark a release released."
        const state = await open(page, testInfo, { burndownFails: 1, shipRefused: words })

        // v2.4's burndown read answers 500: the shared error state, whose Try again reads it again.
        const row = page.locator(`[data-release-row="${R1}"]`)
        await expect(row).toBeVisible({ timeout: 60_000 })
        await press(screen, row)
        const sheet = sheetOf(page)
        await expect(sheet.getByText("Speed up sign-up")).toBeVisible({ timeout: 30_000 })
        await press(screen, sheet.getByRole("radio", { name: "Burndown" }))
        const again = sheet.getByRole("button", { name: "Try again" })
        await expect(again).toBeVisible({ timeout: 30_000 })
        expect(state.burndownReads).toEqual([R1])
        await reviewShot(page, "releases-burndown-failed", scheme)
        await press(screen, again)
        await expect(sheet.getByText("Ideal pace").first()).toBeVisible({ timeout: 30_000 })
        expect(state.burndownReads).toEqual([R1, R1])
        await press(screen, sheet.getByRole("radio", { name: "Overview" }))

        // Mark released, refused: the server's words in its drawer, which stays; the release stays planned.
        await press(screen, sheet.getByRole("button", { name: "Mark released" }))
        const drawer = page.getByRole("dialog", { name: "Mark v2.4 released" })
        await press(screen, drawer.getByRole("button", { name: "Mark released" }))
        const said = drawer.getByRole("alert")
        await expect(said).toHaveText(words)
        await expect(drawer.getByRole("button", { name: "Mark released" })).toBeEnabled()
        expect(state.posts).toEqual([`/${R1}/ship`])
        await said.scrollIntoViewIfNeeded()
        await reviewShot(page, "releases-ship-refused", scheme)
        await press(screen, drawer.getByRole("button", { name: "Cancel" }))
        await expect(drawer).toHaveCount(0)
        // Still planned: Mark released is still offered (a released release has none).
        await expect(sheet.getByRole("button", { name: "Mark released" })).toBeVisible()
        expect(state.list.find((r) => r.id === R1)!.state).toBe("planned")
        await page.keyboard.press("Escape")
        await expect(sheet).toHaveCount(0)

        // v2.5 has no tasks: its burndown says so in its own words.
        await press(screen, page.locator(`[data-release-row="${R2}"]`))
        const empty = page.getByRole("dialog", { name: "v2.5" })
        await press(screen, empty.getByRole("radio", { name: "Burndown" }))
        await expect(empty.getByText(/^No tasks in this release yet\. Put tasks in it from their Release field/)).toBeVisible({ timeout: 30_000 })
        expect(state.burndownReads).toEqual([R1, R1, R2])
        await reviewShot(page, "releases-burndown-empty", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a member reads a release and is offered no change", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        await open(page, testInfo, { admin: false })
        const row = page.locator(`[data-release-row="${R1}"]`)
        await expect(row).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "New release" })).toHaveCount(0)
        await press(screen, row)
        const sheet = sheetOf(page)
        await expect(sheet.getByText("The new pricing page, and a faster sign-up.")).toBeVisible({ timeout: 30_000 })
        for (const name of ["Delete", "Mark released", "Add tasks", "Draft notes", "Save"]) await expect(sheet.getByRole("button", { name })).toHaveCount(0)
        await expect(sheet.getByRole("button", { name: /^Take / })).toHaveCount(0)
        await footerPinned(page, screen, sheet.getByRole("button", { name: "Close" }).last())
        await reviewShot(page, "releases-member", scheme)
        await expectEveryCallAnswered(page)
      })

      test("no releases yet: what a release is, and New release", async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
        await open(page, testInfo, { empty: true })
        await expect(page.getByText("No releases yet")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "New release" })).toBeVisible()
        await reviewShot(page, "releases-empty", scheme)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
