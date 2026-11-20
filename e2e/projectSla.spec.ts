import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SCHEMES, SCREENS, screenUse } from "./screens"
import { SAM, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// SLAs on a project's rows (linear-24 W1), on the stubbed app: the chip on a list's row and a board's card, the
// Filter's SLA facet (a drawer on a phone), grouping by SLA, the SLA sort the server runs, and a guest, whose
// GET /sla is a 403, offered none of it while the list works as before (V-1011).

const P = "9e0a0000-0000-4000-8000-0000000051a1"
const T = (i: number) => `7a5c51a1-0000-4000-8000-${String(i).padStart(12, "0")}`
const HOUR = 3_600_000
const at = (ms: number) => new Date(Date.now() + ms).toISOString()

const project = (member: boolean) => ({
  project_uuid: P,
  project_name: "Support desk",
  project_key: "SUP",
  project_is_admin: false,
  project_is_member: member,
  project_members: [SAM],
})
const row = (i: number, name: string, sla?: Record<string, string>) => ({
  task_uuid: T(i),
  task_key: `SUP-${i}`,
  task_name: name,
  task_status: "todo",
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
  task_project: { project_uuid: P, project_name: "Support desk" },
  ...(sla ? { task_sla: sla } : {}),
})
/** A member's rows: one breached, one at risk, one on track and one with no SLA. A guest's: the same, the SLA left out (H1). */
const rows = (member: boolean) => [
  row(1, "Fix the checkout timeout", member ? { state: "breached", due_at: at(-2 * HOUR), risk_at: at(-8 * HOUR) } : undefined),
  row(2, "Answer the billing ticket", member ? { state: "at_risk", due_at: at(3 * HOUR), risk_at: at(-HOUR) } : undefined),
  row(3, "Update the help article", member ? { state: "on_track", due_at: at(120 * HOUR), risk_at: at(96 * HOUR) } : undefined),
  row(4, "Tidy the backlog"),
]
const slaFilterOf = (filters: string | null) => (JSON.parse(filters || "[]") as { id: string; value: string[] }[]).find((f) => f.id === "task_sla")?.value

async function open(page: Page, testInfo: TestInfo, { member = true, tab = "list" }: { member?: boolean; tab?: string } = {}) {
  const reads: { filters: string | null; sorting: string | null }[] = []
  const slaReads: string[] = []
  const tasks = rows(member)
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project(member)] },
    // The list: the project's rows, or, filtered by SLA, the rows in the states chosen.
    [`/project/taskList/${P}`]: (url: URL) => {
      const filters = url.searchParams.get("filters")
      reads.push({ filters, sorting: url.searchParams.get("sorting") })
      const chosen = slaFilterOf(filters)
      const list = chosen ? tasks.filter((t) => chosen.includes(t.task_sla?.state ?? "none")) : tasks
      return { msg: "ok", data: { ...project(member), project_task_count: list.length, project_tasks: list }, pageCount: 1 }
    },
    // The project's SLA view: on for a member; a guest is refused it (403).
    [`/project/${P}/sla`]: () => {
      slaReads.push(member ? "member" : "guest")
      return member ? { msg: "ok", data: { on: true } } : withStatus(403, { msg: "You can't see this project's SLAs." })
    },
    [`/project/info/${P}`]: { msg: "ok", data: project(member) },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project(member) },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project(member) },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/${P}/releases`]: { msg: "ok", data: { releases: [], can_edit: false } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project(member), project_tasks_backlog: [], project_tasks_todo: tasks, project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] },
    },
    "/notices": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: member ? "edit" : "view", data: { project_name: "Support desk" }, topic: `project/${P}` }] },
  })
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { reads, slaReads }
}

const rowOf = (page: Page, i: number) => page.locator(`[data-task-id="${T(i)}"]`)

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`SLAs on rows, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
      })

      test("a member's rows carry their SLA, and the SLA filter reaches the server and lists what it answers", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { reads } = await open(page, testInfo)
        await expect(rowOf(page, 4).first()).toBeVisible({ timeout: 60_000 })
        // The breached and the at-risk rows draw their chip in its band; the row with no SLA draws none.
        await expect(rowOf(page, 1).first().locator('[data-sla="breached"]')).toBeVisible({ timeout: 15_000 })
        await expect(rowOf(page, 2).first().locator('[data-sla="high"]')).toBeVisible()
        await expect(rowOf(page, 4).first().locator("[data-sla]")).toHaveCount(0)
        await reviewShot(page, "sla-row", scheme)
        if (screen.hasTouch) {
          await page.getByRole("button", { name: "Filter tasks" }).tap()
          const sheet = page.locator('[data-vaul-drawer][data-state="open"]')
          await sheet.getByText("SLA", { exact: true }).tap()
          await expect(sheet.getByRole("checkbox", { name: "No SLA" })).toBeVisible({ timeout: 15_000 })
          await sheet.getByRole("checkbox", { name: "Breached" }).tap()
          await reviewShot(page, "sla-facet-drawer", scheme)
          await sheet.getByRole("button", { name: "Apply" }).tap()
          await expect(sheet).toHaveCount(0)
        } else {
          await page.getByRole("button", { name: "Filter" }).click()
          const facet = page.getByRole("menuitem", { name: "SLA", exact: true })
          await facet.hover()
          const sub = page.locator(`[id="${await facet.getAttribute("aria-controls")}"]`)
          await expect(sub.getByRole("menuitemcheckbox")).toHaveText(["Breached", "At risk", "On track", "Met", "No SLA"])
          await sub.getByRole("menuitemcheckbox", { name: "Breached", exact: true }).click()
          await reviewShot(page, "sla-facet", scheme)
          await page.keyboard.press("Escape")
          await page.keyboard.press("Escape")
        }
        await expect.poll(() => slaFilterOf(reads.at(-1)?.filters ?? null)).toEqual(["breached"])
        if (!screen.hasTouch) await expect(page.getByText("SLA is Breached", { exact: true })).toBeVisible()
        await expect(rowOf(page, 1).first()).toContainText("Fix the checkout timeout")
        await expect(rowOf(page, 4)).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })

      test("a member sorts by SLA, breaches soonest, and on a computer groups the list by SLA", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { reads } = await open(page, testInfo)
        await expect(rowOf(page, 4).first()).toBeVisible({ timeout: 60_000 })
        if (screen.hasTouch) {
          await page.getByRole("button", { name: "Filter tasks" }).tap()
          const sheet = page.locator('[data-vaul-drawer][data-state="open"]')
          await sheet.getByText("Sort", { exact: true }).tap()
          await sheet.getByRole("radio", { name: "SLA, breaches soonest" }).tap()
          await sheet.getByRole("button", { name: "Apply" }).tap()
          await expect(sheet).toHaveCount(0)
        } else {
          await page.getByRole("button", { name: "Display" }).click()
          await page.getByRole("combobox", { name: "Grouping" }).click()
          await page.getByRole("option", { name: "SLA", exact: true }).click()
          await page.getByRole("combobox", { name: "Ordering" }).click()
          await page.getByRole("option", { name: "SLA, breaches soonest", exact: true }).click()
          // One way only (the server reads no direction for it): no Ascending or Descending is offered (W1 FIX C).
          await expect(page.getByRole("button", { name: /^(Ascending|Descending)$/ })).toHaveCount(0)
          await page.keyboard.press("Escape")
          // Breached first, then at risk, on track and the rows with no SLA, each under its own heading.
          for (const label of ["Breached", "At risk", "On track", "No SLA"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
          await reviewShot(page, "sla-grouped", scheme)
        }
        await expect.poll(() => JSON.parse(reads.at(-1)?.sorting ?? "null")).toEqual([{ id: "task_sla", desc: false }])
        await expectEveryCallAnswered(page)
      })

      test("a board's card carries its SLA", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, { tab: "kanban" })
        await expect(page.getByText("Tidy the backlog").first()).toBeVisible({ timeout: 60_000 })
        await expect(page.locator('[data-sla="breached"]').first()).toBeVisible({ timeout: 15_000 })
        await expect(page.locator('[data-sla="high"]').first()).toBeVisible()
        // At risk reads apart from on track by its glyph, not by hue alone (W1 FIX B).
        await expect(page.locator('[data-sla="high"] [data-glyph="alert"]').first()).toBeAttached()
        // A phone's board scrolls sideways: the shot holds To do's card and its chip.
        await page.locator('[data-sla="breached"]').first().scrollIntoViewIfNeeded()
        await reviewShot(page, "sla-card", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a guest (GET /sla is a 403) is offered no SLA chip, facet, grouping or sort, and the list works", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { reads, slaReads } = await open(page, testInfo, { member: false })
        await expect(rowOf(page, 4).first()).toBeVisible({ timeout: 60_000 })
        for (const i of [1, 2, 3]) await expect(rowOf(page, i).first()).toBeVisible()
        await expect(page.locator("[data-sla]")).toHaveCount(0)
        if (screen.hasTouch) {
          await page.getByRole("button", { name: "Filter tasks" }).tap()
          const sheet = page.locator('[data-vaul-drawer][data-state="open"]')
          await expect.poll(() => slaReads.length).toBeGreaterThan(0)
          await expect(sheet.getByText("Priority", { exact: true })).toBeVisible()
          await expect(sheet.getByText("SLA", { exact: true })).toHaveCount(0)
          await sheet.getByText("Sort", { exact: true }).tap()
          await expect(sheet.getByRole("radio").first()).toBeVisible()
          await expect(sheet.getByRole("radio", { name: "SLA, breaches soonest" })).toHaveCount(0)
        } else {
          await page.getByRole("button", { name: "Filter" }).click()
          await expect.poll(() => slaReads.length).toBeGreaterThan(0)
          await expect(page.getByRole("menuitem", { name: "Priority", exact: true })).toBeVisible()
          await expect(page.getByRole("menuitem", { name: "SLA", exact: true })).toHaveCount(0)
          await page.keyboard.press("Escape")
          await page.getByRole("button", { name: "Display" }).click()
          await page.getByRole("combobox", { name: "Grouping" }).click()
          await expect(page.getByRole("option", { name: "Status", exact: true })).toBeVisible()
          await expect(page.getByRole("option", { name: "SLA", exact: true })).toHaveCount(0)
          await page.keyboard.press("Escape")
          await page.getByRole("combobox", { name: "Ordering" }).click()
          await expect(page.getByRole("option").first()).toBeVisible()
          await expect(page.getByRole("option", { name: "SLA", exact: true })).toHaveCount(0)
          await page.keyboard.press("Escape")
        }
        // No list read ever carried an SLA filter or sort, and the rows are all there.
        expect(reads.every((r) => !slaFilterOf(r.filters) && !(r.sorting ?? "").includes("task_sla"))).toBe(true)
        await expect(rowOf(page, 1).first()).toContainText("Fix the checkout timeout")
        await expectEveryCallAnswered(page)
      })
    })
  }
}
