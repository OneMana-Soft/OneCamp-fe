import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { displayNameOf } from "../lib/personName"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { expectTouchSize, TOUCH_PX } from "./touchTarget"

// linear-15: a project's plan on its home: where it stands among the five
// status categories (the workspace's own statuses sit in them), its priority,
// its lead, its start and target at a chosen resolution, and its labels, as a
// row of chips under the line that counts its work. Its admins and members
// change it from each chip's picker (a sheet on a phone), its admins choose
// the lead, and a viewer reads it. A change shows at once; a refusal puts it
// back and says the server's words. The row holds its height from the first
// paint. Linear keeps team statuses and labels for Business; every plan has
// them here.

const P = "9e0a0000-0000-4000-8000-0000000000c7"
const OZ = { ...SAM, user_uuid: "5a0a0000-0000-4000-8000-0000000000d1", user_name: "oz", user_full_name: "Oz Ito", user_project_role: "member" }
const GIL = { ...SAM, user_uuid: "5a0a0000-0000-4000-8000-0000000000d2", user_name: "gil", user_full_name: "Gil Guest", is_external: true }
type Role = "admin" | "member" | "viewer"
const accessOf = (role: Role) => ({
  role,
  view: true,
  comment: role !== "viewer",
  create_tasks: role !== "viewer",
  edit_tasks: role === "viewer" ? "none" : "all",
  delete_tasks: role === "admin" ? "all" : "none",
  log_time: role !== "viewer",
  post_updates: role !== "viewer",
  add_files: role !== "viewer",
  manage: role === "admin",
  manage_people: role === "admin",
  archive: role === "admin",
})

const CATEGORIES = [
  { key: "planned", name: "Planned", color: "slate" },
  { key: "in_progress", name: "In progress", color: "amber" },
  { key: "paused", name: "Paused", color: "orange" },
  { key: "done", name: "Done", color: "green" },
  { key: "cancelled", name: "Cancelled", color: "red" },
]
const REVIEW = { id: "e1a00000-0000-4000-8000-000000000001", name: "In review", category: "in_progress", color: "violet", position: 0 }
const LAUNCH = { id: "f1a00000-0000-4000-8000-000000000001", name: "Launch", color: "rose" }
const START_AFTER_TARGET = "A project can't start after its target."

interface Plan {
  lead: { user_uuid: string; name: string } | null
  start: { date: string; resolution: string } | null
  target: { date: string; resolution: string } | null
  priority: string
  status: { category: string; id?: string; name: string; color: string }
  labels: { id: string; name: string; color: string }[] | null
}
const fresh = (): Plan => ({ lead: null, start: null, target: null, priority: "", status: { category: "in_progress", name: "In progress", color: "amber" }, labels: null })

/** The server's plan and labels as the test holds them, and every change it was sent. */
interface Server {
  role: Role
  plan: Plan
  labels: { id: string; name: string; color: string }[]
  posts: Record<string, unknown>[]
  /** Held until released: the plan still on its way. */
  reading?: Promise<void>
  /** While set, every read of the plan fails, as a dropped server would. */
  failing?: boolean
  /** How many times the plan was read. */
  reads: number
  /** How many times the project's members were read (/project/membersInfo). */
  memberReads: number
  /** Held until released: the members still on their way. */
  membersHeld?: Promise<void>
  /** While set, every read of the members fails. */
  membersFailing?: boolean
}
const serverOf = (role: Role, plan = fresh()): Server => ({ role, plan, labels: [LAUNCH], posts: [], reads: 0, memberReads: 0 })

/** The change as business/ProjectPlan's Save makes it (the dates come snapped already). */
function apply(s: Server, c: Record<string, unknown>) {
  const p = { ...s.plan }
  if ("status" in c) {
    const own = [REVIEW].find((x) => x.id === c.status)
    const cat = CATEGORIES.find((x) => x.key === (c.status ?? "in_progress"))
    p.status = own ? { category: own.category, id: own.id, name: own.name, color: own.color } : { category: cat!.key, name: cat!.name, color: cat!.color }
  }
  if ("priority" in c) p.priority = (c.priority as string) ?? ""
  if ("lead_uuid" in c) p.lead = c.lead_uuid ? { user_uuid: c.lead_uuid as string, name: displayNameOf([SAM, OZ].find((m) => m.user_uuid === c.lead_uuid)) } : null
  if ("start" in c) p.start = c.start as Plan["start"]
  if ("target" in c) p.target = c.target as Plan["target"]
  if ("labels" in c || "new_labels" in c) {
    const made = ((c.new_labels as { name: string; color: string }[] | undefined) ?? []).map((l, i) => ({ id: `f1a00000-0000-4000-8000-00000000010${i}`, ...l }))
    s.labels = [...s.labels, ...made]
    p.labels = [...s.labels.filter((l) => ((c.labels as string[] | undefined) ?? []).includes(l.id)), ...made]
  }
  s.plan = p
}

async function openProject(page: Page, testInfo: TestInfo, s: Server) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: s.role === "admin" ? 1 : 0, project_is_member: 1, project_members: [SAM, OZ, GIL], project_access: accessOf(s.role) }
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    // The laptop's project page also reads its board, cycles, goals and notices: answered, so no stub toast covers a shot.
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 0, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    // As a live server answers it: the project's own fields, its members null (DB-93, 2 Nov). The lead's picker reads
    // them from /project/membersInfo at every width; a phone's once read them from here and listed only "No lead".
    [`/project/info/${P}`]: { msg: "ok", data: { ...project, project_members: null } },
    [`/project/membersInfo/${P}`]: async () => {
      s.memberReads++
      if (s.membersHeld) await s.membersHeld
      if (s.membersFailing) return withStatus(503, { msg: "The server is busy." })
      return { msg: "ok", data: project }
    },
    [`/project/${P}/glance`]: { msg: "ok", data: { open: 0, done: 0, overdue: 0, due_this_week: 0 } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    "/notices": { msg: "ok", data: [] },
    "/project/plan/registry": () => ({ msg: "ok", data: { categories: CATEGORIES, statuses: [REVIEW], labels: s.labels, colors: [] } }),
    // The plan, as controllers/ProjectPlan answers it: admins and members edit, admins choose the lead.
    [`/project/${P}/plan`]: async (_url: URL, request: Request) => {
      if (request.method() === "GET") {
        if (s.reading) await s.reading
        s.reads++
        if (s.failing) return withStatus(503, { msg: "The server is busy." })
        return { msg: "ok", data: { plan: s.plan, can_edit: s.role !== "viewer", can_lead: s.role === "admin" } }
      }
      const change = (request.postDataJSON() ?? {}) as Record<string, unknown>
      s.posts.push(change)
      const start = (change.start ?? s.plan.start) as Plan["start"]
      const target = (change.target ?? s.plan.target) as Plan["target"]
      if (start && target && start.date > target.date) return withStatus(400, { msg: START_AFTER_TARGET })
      apply(s, change)
      return { msg: "ok", data: { plan: s.plan } }
    },
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
  ] as const) {
    test.describe(`a project's plan ${where}, ${theme}`, () => {
      test.use(use)
      const phone = use.viewport.width < 500
      const press = (target: Locator) => (phone ? target.tap() : target.click())
      const strip = (page: Page) => page.locator("[data-project-plan]").first()
      const chip = (page: Page, field: string) => strip(page).locator(`[data-plan-field="${field}"]`)
      const picker = (page: Page) => page.getByRole("dialog").last()
      const option = (page: Page, name: string | RegExp) => picker(page).getByRole("option", { name })

      test("an admin sets where it stands, its priority, its lead, a quarter target and labels, each shown at once", async ({ page }, testInfo) => {
        const s = serverOf("admin")
        await openProject(page, testInfo, s)
        await expect(chip(page, "status")).toHaveText("In progress", { timeout: 60_000 })
        // Whole on the screen, inside the 16 px gutter, the row scrolling sideways rather than wrapping on a phone.
        await expect(chip(page, "status")).toBeInViewport({ ratio: 1 })
        await reviewShot(page, "project-plan-empty-admin", theme)

        await press(chip(page, "status"))
        await expect(option(page, "In review")).toBeVisible()
        await reviewShot(page, "project-plan-status-picker", theme)
        await press(option(page, "Paused"))
        await expect(chip(page, "status")).toHaveText("Paused")
        await expect.poll(() => s.posts.at(-1)).toEqual({ status: "paused" })

        await press(chip(page, "priority"))
        await press(option(page, /^High/))
        await expect(chip(page, "priority")).toHaveAccessibleName("Priority: high")

        // The members are read as the lead's picker opens (main, 2 Nov 21:2x): a phone's page reads none before it;
        // a laptop's reads them for its member stack, under the same key, so the picker never reads them again.
        if (!phone) await expect.poll(() => s.memberReads).toBeGreaterThan(0)
        const membersBefore = s.memberReads
        if (phone) expect(membersBefore).toBe(0)
        await press(chip(page, "lead"))
        // Its admins and members only: a guest never leads. Each is named by the one rule (lib/personName), the
        // display name first, as the server names the lead: Gil Guest is "gil", Oz Ito is "oz".
        await expect(option(page, "oz")).toBeVisible()
        expect(s.memberReads).toBe(phone ? 1 : membersBefore)
        await expect(option(page, "gil")).toHaveCount(0)
        await press(option(page, "oz"))
        await expect(chip(page, "lead")).toHaveAccessibleName("Lead: oz")
        await expect.poll(() => s.posts.at(-1)).toEqual({ lead_uuid: OZ.user_uuid })

        await press(chip(page, "dates"))
        await expect(picker(page).getByRole("radio", { name: /^Target/ })).toHaveAttribute("aria-checked", "true")
        await expect(picker(page).getByRole("radio", { name: "Quarter" })).toHaveAttribute("aria-checked", "true")
        await reviewShot(page, "project-plan-dates-picker", theme)
        const year = Number(await picker(page).locator("[data-plan-year]").getAttribute("data-plan-year"))
        await press(picker(page).getByRole("button", { name: "Q3", exact: true }))
        await expect(chip(page, "dates")).toHaveText(`Target Q3 ${year}`)
        await expect.poll(() => s.posts.at(-1)).toEqual({ target: { date: `${year}-09-30`, resolution: "quarter" } })
        // The start, a month: one year said once.
        await press(picker(page).getByRole("radio", { name: /^Start/ }))
        await press(picker(page).getByRole("radio", { name: "Month" }))
        await press(picker(page).getByRole("button", { name: "Feb", exact: true }))
        await expect(chip(page, "dates")).toHaveText(`Feb → Q3 ${year}`)
        await expect.poll(() => s.posts.at(-1)).toEqual({ start: { date: `${year}-02-01`, resolution: "month" } })
        await page.keyboard.press("Escape")

        await press(chip(page, "labels"))
        await press(option(page, "Launch"))
        await expect(chip(page, "labels")).toHaveText(/Launch/)
        // A new label, made as it's given: it joins the workspace's list.
        await picker(page).getByRole("combobox").fill("Ops")
        await press(option(page, "Make “Ops”"))
        await expect(chip(page, "labels")).toHaveText(/Ops/)
        await expect.poll(() => s.posts.at(-1)).toMatchObject({ labels: [LAUNCH.id], new_labels: [{ name: "Ops" }] })
        // Read once the picker shuts: on a phone it is a sheet, and the page behind a sheet is hidden from a screen reader.
        await page.keyboard.press("Escape")
        await expect(chip(page, "labels")).toHaveAccessibleName("Labels: Launch, Ops")
        await reviewShot(page, `project-plan-admin-${phone ? "390" : "1280"}`, theme)

        // The server holds what was set, so a reload reads it back the same: the dates at their resolutions, the
        // lead, the labels (DB-93: one phone leg on LIVE lost its dates in a network stall; its re-run kept them).
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(chip(page, "dates")).toHaveText(`Feb → Q3 ${year}`, { timeout: 60_000 })
        expect(s.plan.start).toEqual({ date: `${year}-02-01`, resolution: "month" })
        expect(s.plan.target).toEqual({ date: `${year}-09-30`, resolution: "quarter" })
        await expect(chip(page, "lead")).toHaveAccessibleName("Lead: oz")
        await expect(chip(page, "labels")).toHaveAccessibleName("Labels: Launch, Ops")
      })

      test("a refusal puts the change back and says the server's words", async ({ page }, testInfo) => {
        const s = serverOf("admin", { ...fresh(), target: { date: "2027-03-31", resolution: "quarter" } })
        await openProject(page, testInfo, s)
        await press(chip(page, "dates"))
        await press(picker(page).getByRole("radio", { name: /^Start/ }))
        await press(picker(page).getByRole("radio", { name: "Year" }))
        await press(picker(page).getByRole("button", { name: "The year after" }))
        await press(picker(page).getByRole("button", { name: "2028", exact: true }))
        await expect(page.locator(".toast-card").filter({ hasText: START_AFTER_TARGET })).toBeVisible()
        await reviewShot(page, "project-plan-refusal", theme)
        await expect(chip(page, "dates")).toHaveText("Target Q1 2027")
      })

      test("a member changes the plan but not its lead, and a viewer reads it with nothing to press", async ({ page }, testInfo) => {
        const set = { ...fresh(), lead: { user_uuid: SAM.user_uuid, name: "Sam" }, priority: "urgent" }
        await openProject(page, testInfo, serverOf("member", set))
        await expect(chip(page, "status")).toHaveText("In progress", { timeout: 60_000 })
        await expect(strip(page).getByRole("button", { name: /^Status/ })).toBeVisible()
        await expect(strip(page).getByRole("button", { name: /^Lead/ })).toHaveCount(0)
        await expect(chip(page, "lead")).toHaveText(/Sam/)
        await expect(chip(page, "labels")).toHaveAccessibleName("Add labels")

        await openProject(page, testInfo, serverOf("viewer", set))
        await expect(chip(page, "lead")).toHaveText(/Sam/, { timeout: 60_000 })
        await expect(strip(page).getByRole("button")).toHaveCount(0)
        // What isn't set shows only to whoever may set it.
        await expect(chip(page, "labels")).toHaveCount(0)
        await expect(chip(page, "dates")).toHaveCount(0)
        await reviewShot(page, "project-plan-viewer", theme)

        // An empty plan to a viewer: a quiet row, never a choice they can't make.
        await openProject(page, testInfo, serverOf("viewer"))
        await expect(chip(page, "status")).toHaveText("In progress", { timeout: 60_000 })
        await expect(strip(page).getByRole("button")).toHaveCount(0)
        await expect(strip(page)).not.toContainText("Set ")
        await reviewShot(page, "project-plan-empty-viewer", theme)
      })

      // DB-71: on a set date the picker lights its period and ends in Clear, a thumb's size in the phone's sheet.
      test("on a set date the dates picker lights its quarter and offers Clear at a thumb's size", async ({ page }, testInfo) => {
        const s = serverOf("admin", { ...fresh(), target: { date: "2027-03-31", resolution: "quarter" } })
        await openProject(page, testInfo, s)
        await expect(chip(page, "dates")).toBeVisible({ timeout: 60_000 })
        await press(chip(page, "dates"))
        await expect(picker(page).getByRole("button", { name: "Q1", exact: true })).toHaveAttribute("aria-pressed", "true")
        const clear = picker(page).getByRole("button", { name: "Clear the target" })
        expectTouchSize((await clear.boundingBox())!.height, "Clear is below a thumb's size", phone ? TOUCH_PX : 28)
        await reviewShot(page, "project-plan-dates-set", theme)
        await press(clear)
        await expect.poll(() => s.posts.at(-1)).toEqual({ target: null })
      })

      test("a failed read says so in the row's place, and Try again reads it again", async ({ page }, testInfo) => {
        const s = serverOf("admin")
        s.failing = true
        await openProject(page, testInfo, s)
        const again = strip(page).getByRole("button", { name: "Try again" })
        await expect(again).toBeVisible({ timeout: 60_000 })
        // One line at the row's own height (DB-71: the house's part retry, as the forecast chip beside it), never
        // the page-sized ErrorState: 44 px for a thumb on a phone, the row's 28 on a computer.
        await expect(again).toHaveText("Couldn't load the project's plan. Try again")
        expect((await strip(page).boundingBox())!.height).toBeLessThanOrEqual(phone ? 44 : 28)
        await reviewShot(page, "project-plan-read-failed", theme)
        const before = s.reads
        s.failing = false
        await press(again)
        await expect(chip(page, "status")).toHaveText("In progress")
        expect(s.reads).toBeGreaterThan(before)
      })

      test("the lead's picker says it's reading the members, and a failed read offers Try again", async ({ page }, testInfo) => {
        const s = serverOf("admin")
        let release = () => {}
        s.membersHeld = new Promise<void>((done) => (release = done))
        s.membersFailing = true
        await openProject(page, testInfo, s)
        await press(chip(page, "lead"))
        const reading = picker(page).getByRole("status").filter({ hasText: "Reading the members…" })
        await expect(reading).toBeVisible()
        release()
        // The shell's error state in the list's place, with Try again; the picker stays open on it.
        await expect(picker(page).getByRole("alert")).toContainText("the project's members", { timeout: 60_000 })
        await expect(reading).toHaveCount(0)
        const before = s.memberReads
        s.membersFailing = false
        await press(picker(page).getByRole("button", { name: "Try again" }))
        await expect(option(page, "oz")).toBeVisible()
        expect(s.memberReads).toBeGreaterThan(before)
        await expect(picker(page).getByRole("alert")).toHaveCount(0)
      })

      test("the row holds its height, so the page never moves when the plan arrives", async ({ page }, testInfo) => {
        const s = serverOf("admin")
        let release = () => {}
        s.reading = new Promise((r) => (release = r))
        await openProject(page, testInfo, s)
        const tabs = page.getByRole("tablist").first()
        await expect(tabs).toBeVisible({ timeout: 60_000 })
        await expect(strip(page)).toBeAttached()
        const before = (await tabs.boundingBox())!.y
        release()
        await expect(chip(page, "status")).toHaveText("In progress")
        expect((await tabs.boundingBox())!.y).toBe(before)
      })
    })
  }
}
