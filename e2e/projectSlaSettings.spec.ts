import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SCHEMES, SCREENS, screenUse } from "./screens"
import { SAM, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// A project's SLA settings (linear-24 W2), on the stubbed app: an admin turns SLAs on and off, adds a rule and sets the
// business clock's week; a member reads them with every control off; a guest, whose GET /sla is a 403, is offered no SLAs
// entry (V-1011); and a report offers the "sla" slice only where the server sent SLA slices.
const P = "9e0a0000-0000-4000-8000-0000000052a2"
type Who = "admin" | "member" | "guest"
const project = (who: Who) => ({
  project_uuid: P,
  project_name: "Support desk",
  project_key: "SUP",
  project_is_admin: who === "admin",
  // A guest is in the project (a workspace guest) yet reads no SLA state: the server refuses GET /sla.
  project_is_member: true,
  project_members: [SAM],
})
const spread = (n: number, p50: number) => ({ n, p25: p50 / 2, p50, p85: p50 * 2, p95: p50 * 3 })
const none = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const slice = (by: string, key: string, name: string) => ({ by, key, name, cycle: spread(1, 30), lead: spread(1, 60), age: none })
/** A report: the server sends SLA slices only where the reader reads SLA state (sla false: a guest's, or SLAs off). */
const report = (sla: boolean) => ({
  weeks: ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"], done: [1, 0, 1, 1], added: [2, 1, 0, 1], hours: null, open: 3, overdue: 0,
  due_this_week: 1, done_total: 3, projects: [], people: [], priorities: [], all_projects: [{ project_uuid: P, project_name: "Support desk" }], truncated: false,
  insights: {
    cycle: spread(2, 30), lead: spread(3, 60), triage: spread(1, 5), age: spread(3, 100), in_status: [{ status: "todo", ...spread(3, 10) }], points: [], points_capped: false,
    slices: [slice("project", P, "Support desk"), ...(sla ? [slice("sla", "breached", "Breached"), slice("sla", "", "")] : [])],
  },
})
const rule = (id: string, name: string, rank: number, target: number, more: Record<string, unknown> = {}) =>
  ({ id, project_uuid: P, name, priorities: [], labels: [], type_ids: [], sources: [], target_minutes: target, clock: "business", starts: "created", rank, ...more })
const policy = (on: boolean) => ({ key: "projects.sla", kind: "bool", label: "SLAs", help: "", value: on, default: false, is_set: true })

/** The project's work types as GET /types answers them, the built-in ones first (V-1063). */
const INCIDENT = "7e000000-0000-4000-8000-0000000000c3"
const TYPES = [
  { id: "7e000000-0000-4000-8000-0000000000c1", builtin: "task", name: "Task", icon: "task" },
  { id: "7e000000-0000-4000-8000-0000000000c2", builtin: "bug", name: "Bug", icon: "bug" },
  { id: INCIDENT, name: "Incident", icon: "flame", own: true },
]

async function open(page: Page, testInfo: TestInfo, who: Who, { rules = true, defaults = false, types = false } = {}) {
  const writes: { method: string; path: string; body: unknown }[] = []
  // A rule added is kept, as the server keeps it, and read back with the rest.
  const added: ReturnType<typeof rule>[] = []
  let on = true
  let reads = 0
  // defaults: the project never saved a rule, so it shows the defaults by their fixed ids (business/SLA Defaults, virtual),
  // with the lists they never fill written as null, as the server writes a Go nil slice (LIVE wZ39n broke on it, 17 Nov).
  const virtual = defaults ? { virtual: true, labels: null, type_ids: null, sources: null } : {}
  const view = () => ({
    on,
    rules: rules ? [rule("r1", "Urgent first answer", 1, 60, { priorities: ["urgent"], ...virtual }), rule("r2", "Everything else", 2, 2880, { clock: "calendar", ...virtual }), ...added] : added,
    defaults,
    hours: { days: [1], start: "09:00", end: "17:00", tz: "Asia/Kolkata", week: { "1": [{ start: "09:00", end: "17:00" }] } },
    hours_set: true,
    can_manage: who === "admin",
  })
  const wrote = (url: URL, request: Request) => {
    const body = request.postData()
    writes.push({ method: request.method(), path: url.pathname, body: body ? JSON.parse(body) : undefined })
  }
  await stubBackend(page, testInfo, {
    [`/project/${P}/sla`]: (url: URL, request: Request) => {
      if (request.method() === "GET" && url.pathname.endsWith("/sla")) reads++
      if (who === "guest") return withStatus(403, { msg: "You can't see this project's SLAs." })
      if (request.method() === "GET") return { msg: "ok", data: view() }
      wrote(url, request)
      if (request.method() === "POST") {
        const b = JSON.parse(request.postData() || "{}") as { name: string; target_minutes: number; type_ids?: string[] }
        added.push(rule("r3", b.name, 3, b.target_minutes, { type_ids: b.type_ids ?? [] }))
        return { msg: "ok", data: added[added.length - 1] }
      }
      return { msg: "ok", data: view() }
    },
    [`/project/${P}/policies`]: (url: URL, request: Request) => {
      if (request.method() === "GET") return { msg: "ok", data: [policy(on)] }
      wrote(url, request)
      on = !!(JSON.parse(request.postData() || "{}") as { value?: boolean }).value
      return { msg: "ok", data: policy(on) }
    },
    [`/project/${P}?`]: { msg: "ok", data: { ...project(who), project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    // A policy or rule change asks every read of the project again, its task lists among them.
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project(who), project_task_count: 0, project_tasks: [] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: { msg: "ok", data: { ...project(who), project_tasks_todo: [], project_tasks_done_count: 0 } },
    [`/project/info/${P}`]: { msg: "ok", data: project(who) },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project(who) },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project(who) },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: types ? TYPES : null, icons: [] },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/${P}/releases`]: { msg: "ok", data: { releases: [], can_edit: false } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    "/notices": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: who === "guest" ? "view" : "edit", data: { project_name: "Support desk" }, topic: `project/${P}` }] },
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { writes, slaReads: () => reads }
}

/**
 * The SLAs entry: an item in the project's "Project actions" menu. On a computer only "Time logged" sits beside
 * that menu; on a phone every tool is in it.
 */
const slaEntry = (page: Page) => page.getByRole("button", { name: "SLAs", exact: true }).or(page.getByRole("menuitem", { name: "SLAs" }))
const timeEntry = (page: Page) => page.getByRole("button", { name: /Time logged/ }).or(page.getByRole("menuitem", { name: /Time logged/ }))
async function openTools(page: Page, touch: boolean) {
  const menu = page.getByRole("button", { name: "Project actions" })
  await expect(menu).toBeVisible({ timeout: 60_000 })
  await (touch ? menu.tap() : menu.click())
}
async function openSettings(page: Page, touch: boolean) {
  await openTools(page, touch)
  const entry = slaEntry(page).first()
  await expect(entry).toBeVisible({ timeout: 30_000 })
  await (touch ? entry.tap() : entry.click())
  const dialog = page.getByRole("dialog", { name: /SLAs/ })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`SLA settings, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
      })

      test("an admin turns SLAs off and on, adds a rule, and sets the business week", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { writes } = await open(page, testInfo, "admin")
        const touch = !!screen.hasTouch
        const press = (l: ReturnType<Page["locator"]>) => (touch ? l.tap() : l.click())
        const dialog = await openSettings(page, touch)
        await expect(dialog.getByRole("group", { name: "Rule 1: Urgent first answer" })).toBeVisible()
        await reviewShot(page, "sla-settings-admin", scheme)

        // Each of the business week's ranges reads on one line, from -> until (CR-346 F6), at 390 too.
        // Measured together, once the drawer has come to rest (its slide moves both).
        const gap = async () => {
          const [from, until] = await Promise.all([dialog.getByLabel("Monday: from").boundingBox(), dialog.getByLabel("Monday: until").boundingBox()])
          return from && until ? Math.abs(from.y - until.y) : 99
        }
        await expect.poll(gap).toBeLessThan(2)

        await press(dialog.getByRole("switch", { name: /SLAs on/ }))
        await expect.poll(() => writes.some((w) => w.method === "PUT" && w.path.endsWith("/policies/projects.sla"))).toBe(true)

        await press(dialog.getByRole("button", { name: /Add a rule/ }))
        // The form's choices: the house chips under captions that say what choosing none means (CR-346 F7).
        await expect(dialog.getByText("Priorities, none is any", { exact: true })).toBeVisible()
        // A project with no work types (the list written as null) draws no type picker (V-1063).
        await expect(dialog.getByRole("group", { name: /Work types/ })).toHaveCount(0)
        await reviewShot(page, "sla-settings-rule-adding", scheme)
        await dialog.getByLabel("Rule name").fill("Billing tickets")
        await dialog.getByLabel(/Target, hours/).fill("4")
        await press(dialog.getByRole("button", { name: "Save rule" }))
        await expect.poll(() => writes.find((w) => w.method === "POST")?.body).toMatchObject({ name: "Billing tickets", target_minutes: 240 })

        // The business week: Tuesday joins Monday, and the week is saved as the server reads it.
        await press(dialog.getByRole("switch", { name: "Work on Tuesdays" }))
        await press(dialog.getByRole("button", { name: /Save hours/ }))
        await expect
          .poll(() => writes.find((w) => w.method === "PUT" && w.path.endsWith("/sla/hours"))?.body)
          .toMatchObject({ hours: { week: { "1": expect.any(Array), "2": expect.any(Array) } } })
        await expectEveryCallAnswered(page)
      })

      test("an admin picks a rule's work types, and the rule the server reads back names them (V-1063)", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { writes } = await open(page, testInfo, "admin", { types: true })
        const touch = !!screen.hasTouch
        const press = (l: ReturnType<Page["locator"]>) => (touch ? l.tap() : l.click())
        const dialog = await openSettings(page, touch)
        await press(dialog.getByRole("button", { name: /Add a rule/ }))
        const kinds = dialog.getByRole("group", { name: "Work types, none is any" })
        await expect(kinds.getByRole("button")).toHaveText(["Task", "Bug", "Incident"])
        await dialog.getByLabel("Rule name").fill("Incidents")
        await dialog.getByLabel(/Target, hours/).fill("2")
        await press(kinds.getByRole("button", { name: "Incident" }))
        await expect(kinds.getByRole("button", { name: "Incident" })).toHaveAttribute("aria-pressed", "true")
        // Nothing scrolls sideways, at 390 too: the chips wrap.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screen.width)
        expect(await kinds.evaluate((g) => g.scrollWidth - g.clientWidth)).toBeLessThanOrEqual(0)
        await reviewShot(page, "sla-rule-types", scheme)
        await press(dialog.getByRole("button", { name: "Save rule" }))
        await expect.poll(() => writes.find((w) => w.method === "POST")?.body).toMatchObject({ name: "Incidents", target_minutes: 120, type_ids: [INCIDENT] })
        // Read back with the rest, the rule's caption names its type.
        await expect(dialog.getByRole("group", { name: "Rule 3: Incidents" })).toContainText("· Incident", { timeout: 30_000 })
        await reviewShot(page, "sla-rule-types-saved", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a member's first load asks nothing about SLAs, and the settings read with no controls drawn", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { writes, slaReads } = await open(page, testInfo, "member")
        // The project's page asks for its SLA settings only once its tools open (CR-346 F1).
        await expect(page.getByRole("button", { name: "Project actions" })).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(1_500)
        expect(slaReads()).toBe(0)
        const dialog = await openSettings(page, !!screen.hasTouch)
        expect(slaReads()).toBeGreaterThan(0)
        await expect(dialog.getByText(/Only the project's admins can change/)).toBeVisible()
        await expect(dialog.getByRole("switch", { name: /SLAs on/ })).toBeDisabled()
        await expect(dialog.getByRole("button", { name: /Add a rule/ })).toHaveCount(0)
        // No rule actions and no hours controls: the week reads as words (CR-346 F5).
        await expect(dialog.getByRole("group", { name: "Rule 1: Urgent first answer" }).getByRole("button")).toHaveCount(0)
        await expect(dialog.getByRole("switch", { name: /^Work on/ })).toHaveCount(0)
        await expect(dialog.getByRole("button", { name: /range|Copy|Save hours/ })).toHaveCount(0)
        await expect(dialog.locator('[data-hours-day="1"]')).toContainText(/9:00|09:00/)
        await reviewShot(page, "sla-settings-member", scheme)
        expect(writes).toEqual([])
      })

      test("an admin's project with no rules says so and offers to add one", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await open(page, testInfo, "admin", { rules: false })
        const dialog = await openSettings(page, !!screen.hasTouch)
        await expect(dialog.getByText(/No SLA rules yet/)).toBeVisible()
        await reviewShot(page, "sla-settings-empty", scheme)
      })

      test("removing a default rule asks first, and its confirm says the defaults become the project's own", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { writes } = await open(page, testInfo, "admin", { defaults: true })
        const touch = !!screen.hasTouch
        const dialog = await openSettings(page, touch)
        const remove = dialog.getByRole("group", { name: "Rule 2: Everything else" }).getByRole("button", { name: "Remove" })
        await (touch ? remove.tap() : remove.click())
        const ask = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: /Remove the SLA rule/ })).last()
        await expect(ask).toContainText(/defaults become this project's own/, { timeout: 30_000 })
        await reviewShot(page, "sla-settings-remove-default", scheme)
        expect(writes.some((w) => w.method === "DELETE")).toBe(false)
        const yes = ask.getByRole("button", { name: "Remove rule" })
        await (touch ? yes.tap() : yes.click())
        await expect.poll(() => writes.some((w) => w.method === "DELETE" && w.path.endsWith("/sla/rules/r2"))).toBe(true)
      })

      test("a guest (GET /sla is a 403) is offered no SLAs entry, and the project works", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const { slaReads } = await open(page, testInfo, "guest")
        // The guest's tools, with the menu open where there is one: "Time logged" is there, SLAs is not.
        const touch = !!screen.hasTouch
        if (touch) await openTools(page, true)
        await expect(timeEntry(page).first()).toBeVisible({ timeout: 60_000 })
        const menu = page.getByRole("button", { name: "Project actions" })
        if (!touch && (await menu.count()) > 0) {
          await menu.click()
          await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 30_000 })
        }
        // The tools asked, and the 403 offers nothing.
        await expect.poll(() => slaReads()).toBeGreaterThan(0)
        await expect(slaEntry(page)).toHaveCount(0)
      })
    })
  }
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`the SLA slice in reports, ${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))
      for (const sla of [true, false]) {
        test(sla ? "a member slices how long work takes by SLA" : "a report with no SLA slices (a guest's, SLAs off) never offers it", async ({ page }, testInfo) => {
          test.setTimeout(240_000)
          await page.addInitScript((t) => localStorage.setItem("ui-theme", t), scheme)
          await stubBackend(page, testInfo, {
            "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: P, project_name: "Support desk", is_admin: 0, open: 3, done: 3, overdue: 0, due_soon: 1 }] } },
            "/project/report": { msg: "ok", data: report(sla) },
            "/goal/list": { msg: "ok", data: { goals: [] } },
            "/notices": { msg: "ok", data: [] },
          })
          await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
          const touch = !!screen.hasTouch
          const press = (l: ReturnType<Page["locator"]>) => (touch ? l.tap() : l.click())
          const tab = page.getByRole("tab", { name: /Reports/ })
          await expect(tab).toBeVisible({ timeout: 60_000 })
          await press(tab)
          const slices = page.getByRole("region", { name: "By slice" })
          await expect(slices).toBeVisible({ timeout: 30_000 })
          await slices.scrollIntoViewIfNeeded()
          await press(slices.getByRole("combobox", { name: "Slice by" }))
          if (!sla) {
            await expect(page.getByRole("option", { name: "By person" })).toBeVisible()
            await expect(page.getByRole("option", { name: "By SLA" })).toHaveCount(0)
            return
          }
          await press(page.getByRole("option", { name: "By SLA" }))
          await expect(slices.locator("tbody th")).toHaveText(["Breached", "No SLA"])
          await reviewShot(page, "sla-report-slice", scheme)
        })
      }
    })
  }
}
