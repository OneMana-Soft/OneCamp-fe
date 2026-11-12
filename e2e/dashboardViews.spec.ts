import { readFileSync } from "node:fs"
import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Dashboards over saved views, a CSV from every chart, and Add to dashboard
// (B9-b4: asana-08, linear-32), on a production build. A keeper adds a widget
// whose source is one of their saved views: it keeps the view's id alone, and
// on a dashboard others open the editor says only they will see its numbers
// (V-557). A widget over a view says which it reads, and its chart downloads
// as CSV. Reports' Add to dashboard puts the report's question on a dashboard
// the reader keeps, in its next place, from the keyboard as from a pointer; it
// says while it loads, when the dashboards can't be read, and makes one of the
// reader's own when they keep none. A saved view goes on a dashboard from the
// list's Display menu (by keyboard, the menu staying open beneath the dialog)
// and from the phone's filter drawer (the sheet over the drawer). Picking a
// project's dashboard keeps what was chosen and typed (CR-B14 M1, M3). At 1280,
// and at 390 with touch, where the dialogs are sheets. With SHOTS_DIR set,
// each is saved for review, light and dark.

const P = "9e0a0000-0000-4000-8000-0000000000b9"
const D = "d0a50000-0000-4000-8000-0000000000b4"
const OWN = "d0a50000-0000-4000-8000-0000000000c4"
const V = "7e000000-0000-4000-8000-0000000000b4"
const W = "a0000000-0000-4000-8000-0000000000b4"
const W2 = "a0000000-0000-4000-8000-0000000000c4"
const at = "2026-11-02T09:00:00Z"
const team = { id: D, scope: "workspace", name: "Team pulse", shared: true, created_by: SAM.user_uuid, created_at: at, updated_at: at }
const own = { id: OWN, scope: "mine", name: "My dashboard", shared: false, created_by: SAM.user_uuid, created_at: at, updated_at: at }
const weeks = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]
const overView = { id: W, kind: "throughput", title: "Launch pace", query: { view: V, weeks: 4 }, x: 0, y: 0, w: 6, h: 4 }
// A number over the same view (its tile says what it reads on its note line). Each widget's next place flows after
// both (lib/dashboards flowPlaces): the chart 6 wide, the number 3, so a 3-wide one goes at x 9 and a 6-wide one under them.
const overViewNumber = { id: W2, kind: "metric", title: "Open launch work", query: { view: V, weeks: 4, measure: "open" }, x: 0, y: 4, w: 3, h: 2 }
const figures = [
  { id: W, kind: "throughput", view: "Launch work", data: { weeks, done: [1, 2, 0, 2], added: [3, 1, 1, 0] } },
  { id: W2, kind: "metric", view: "Launch work", data: { measure: "open", value: 3 } },
]
// Another reader of the workspace's dashboard: each widget over the view says so in its place (the server's word).
const unreadable = "This widget reads a saved view only its owner can see."
const asReader = {
  [`/project/dashboards/${D}/data`]: { msg: "ok", data: { widgets: [W, W2].map((id, i) => ({ id, kind: i ? "metric" : "throughput", error: unreadable })) } },
  [`/project/dashboards/${D}`]: { msg: "ok", data: { dashboard: { ...team, created_by: "0b0e0000-0000-4000-8000-0000000000b4" }, widgets: [overView, overViewNumber], can_keep: false } },
}
const launch = { id: V, scope: "mine", name: "Launch work", state: { filters: [{ id: "task_priority", value: ["high"] }], sort: [] } }
const counts = { to_do: 1, in_progress: 0, in_review: 0, overdue: 0, done: 0 }
const report = {
  weeks,
  done: [1, 2, 0, 2],
  added: [3, 1, 1, 0],
  hours: null,
  open: 1,
  overdue: 0,
  due_this_week: 0,
  done_total: 5,
  projects: [{ project_uuid: P, project_name: "Spring fair", ...counts }],
  people: [{ user_uuid: SAM.user_uuid, user_name: "Sam Rivera", ...counts }],
  priorities: [],
  all_projects: [{ project_uuid: P, project_name: "Spring fair" }],
  truncated: false,
}
const kept = { msg: "ok", data: { mine: [], workspace: [team], can_keep_workspace: true } }
const note = /only you will see this widget's numbers/i
type Req = { method(): string; postDataJSON(): unknown }

/** The workspace's dashboard (kept by the reader, its widget over a view), the reader's own once made; every widget added is kept, by dashboard. */
function dashboards(added: { to: string; body: Record<string, unknown> }[], lists: unknown = kept) {
  const widgets = (to: string) => (_: URL, request: Req) => {
    const body = request.postDataJSON() as Record<string, unknown>
    added.push({ to, body })
    return { msg: "ok", data: { ...body, id: "a0000000-0000-4000-8000-000000000009" } }
  }
  return {
    [`/project/dashboards/${D}/data`]: { msg: "ok", data: { widgets: figures } },
    [`/project/dashboards/${D}/widgets`]: widgets(D),
    [`/project/dashboards/${D}`]: { msg: "ok", data: { dashboard: team, widgets: [overView, overViewNumber], can_keep: true } },
    [`/project/dashboards/${OWN}/widgets`]: widgets(OWN),
    [`/project/dashboards/${OWN}`]: { msg: "ok", data: { dashboard: own, widgets: [], can_keep: true } },
    "/project/dashboards": (url: URL, request: Req) => (request.method() === "POST" ? { msg: "ok", data: own } : typeof lists === "function" ? lists(url, request) : lists),
  }
}

async function visit(page: Page, testInfo: TestInfo, theme: string, address: string, answers: Record<string, unknown>) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: P, project_name: "Spring fair", is_admin: 1, open: 1, done: 5, overdue: 0, due_soon: 0 }] } },
    "/project/report": { msg: "ok", data: report },
    "/task/views": { msg: "ok", data: [launch] },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    ...answers,
  })
  await page.goto(address, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

// A project's own dashboard, kept by the reader: offered when Reports reads that one project (CR-B14 M3).
const FAIR = "d0a50000-0000-4000-8000-0000000000d4"
const fair = { id: FAIR, scope: "project", project_id: P, name: "Fair board", shared: true, created_by: SAM.user_uuid, created_at: at, updated_at: at }
const inFair = { [`/project/${P}/dashboards`]: { msg: "ok", data: { dashboards: [fair], can_keep: true } } }
const oneProject = (page: Page) => page.addInitScript((p) => localStorage.setItem("oc_report_projects", JSON.stringify([p])), P)

// The project's task list, where its saved views are (the Display menu's view rows; the phone's filter drawer).
const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00b4-0000-4000-8000-000000000001",
  task_name: "Book the venue",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Spring fair" },
}
const LIST = `/app/project/${P}?tab=list`
const listAnswers = (added: { to: string; body: Record<string, unknown> }[]) => ({
  ...dashboards(added),
  [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 },
  [`/project/taskListForKanban/${P}`]: { msg: "ok", data: { ...project, project_tasks_todo: [task], project_tasks_done_count: 0 } },
  [`/project/info/${P}`]: { msg: "ok", data: project },
  [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
  [`/project/${P}/statuses`]: { msg: "ok", data: null },
  [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
  [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
  [`/project/${P}/tags`]: { msg: "ok", data: [] },
  [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
  [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
  [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
  [`/project/${P}/dashboards`]: { msg: "ok", data: { dashboards: [], can_keep: true } },
})

/** Whether a tap or a click at the middle of `el` reaches it: nothing is drawn over it. */
const onTop = (el: Element) => {
  const r = el.getBoundingClientRect()
  return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
}

const REPORTS = "/app/project?view=reports"
const DASHBOARD = `/app/project/dashboards?d=${D}`

/** Another reader opens the dashboard: a note in each view widget's place, and no way to change it. */
async function readerSees(page: Page, testInfo: TestInfo, theme: string, shot: string) {
  await visit(page, testInfo, theme, DASHBOARD, { ...dashboards([]), ...asReader })
  await expect(page.locator(`[data-widget-id="${W}"]`)).toContainText(unreadable, { timeout: 60_000 })
  await expect(page.locator(`[data-widget-id="${W2}"]`)).toContainText(unreadable)
  await expect(page.getByRole("button", { name: "Add widget" })).toHaveCount(0)
  await reviewShot(page, shot, theme)
}

/** Picks one of a select's options, by pointer or by touch. */
async function choose(page: Page, scope: ReturnType<Page["getByRole"]>, box: string, option: string, touch = false) {
  const trigger = scope.getByRole("combobox", { name: box })
  await (touch ? trigger.tap() : trigger.click())
  const item = page.getByRole("option", { name: option })
  await (touch ? item.tap() : item.click())
}

/**
 * Picks one of a select's options by keyboard: Enter opens the list, the typed
 * letters find the option and Enter takes it. The letters go only once the open
 * list has placed its own focus, as a person sees the list before typing: keys
 * sent while it is still opening are not the list's yet (b3gate1, 5 Nov: both
 * 1280 runs kept an old option).
 */
async function chooseByKeys(page: Page, select: ReturnType<Page["getByRole"]>, typed: string, option: string) {
  await select.focus()
  await page.keyboard.press("Enter")
  await expect(page.locator('[role="listbox"] [role="option"]:focus')).toHaveCount(1)
  await page.keyboard.type(typed)
  await expect(page.getByRole("option", { name: option })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(select).toContainText(option)
}

for (const theme of SHOT_THEMES) {
  test.describe(`dashboards over saved views at 1280 (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("another reader sees a note in a view widget's place", async ({ page }, testInfo) => {
      await readerSees(page, testInfo, theme, "dashboard-view-reader-1280")
    })

    test("a widget over a saved view says which it reads, downloads its CSV, and another is added from a view", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      await visit(page, testInfo, theme, DASHBOARD, dashboards(added))
      const card = page.locator(`[data-widget-id="${W}"]`)
      await expect(card).toContainText("From Launch work", { timeout: 60_000 })
      // A number over the view says so on its note line (DESIGN-BUILD F3).
      await expect(page.locator(`[data-widget-id="${W2}"]`)).toContainText("From Launch work")
      await reviewShot(page, "dashboard-view-widget-1280", theme)
      await card.getByRole("button", { name: "Launch pace: more" }).click()
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download CSV" }).click()])
      expect(download.suggestedFilename()).toBe("onecamp-launch-pace.csv")
      expect(readFileSync((await download.path())!, "utf8")).toBe("Week starting,Done,Added\n2026-10-12,1,3\n2026-10-19,2,1\n2026-10-26,0,1\n2026-11-02,2,0\n")

      await page.getByRole("button", { name: "Add widget" }).first().click()
      const dialog = page.getByRole("dialog", { name: "Add a widget" })
      await choose(page, dialog, "Reads", "A saved view")
      await choose(page, dialog, "Saved view", "Launch work")
      await expect(dialog.getByText(note)).toBeVisible()
      await reviewShot(page, "dashboard-view-source-1280", theme)
      await dialog.getByRole("button", { name: "Add widget" }).click()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toEqual({ to: D, body: { kind: "metric", title: "", query: { view: V, weeks: 12, measure: "open" }, x: 9, y: 0, w: 3, h: 2 } })
    })

    test("Reports puts its question on a dashboard, from the keyboard, in the next free place", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      await visit(page, testInfo, theme, REPORTS, dashboards(added))
      const add = page.getByRole("button", { name: "Add to dashboard" })
      await expect(add).toBeEnabled({ timeout: 60_000 })
      await add.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog", { name: "Add to a dashboard" })
      await expect(dialog.getByRole("combobox", { name: "Dashboard" })).toContainText("Team pulse")
      await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused()
      await expect(dialog).toHaveCSS("outline-style", "none")
      await expect(dialog.getByText("Everyone in the workspace")).toBeVisible()
      await reviewShot(page, "add-to-dashboard-1280", theme)
      // Escape closes it and gives the focus back to the way in.
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(add).toBeFocused()
      await reviewShot(page, "add-to-dashboard-focus-1280", theme)
      await page.keyboard.press("Enter")
      await expect(dialog.getByRole("combobox", { name: "Shows" })).toContainText("Done and added")
      await dialog.getByRole("button", { name: "Add widget" }).click()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toEqual({ to: D, body: { kind: "throughput", title: "", query: { weeks: 12 }, x: 0, y: 4, w: 6, h: 4 } })
      await expect(page.getByText("Added to Team pulse", { exact: true })).toBeVisible()
      await expect(dialog).toHaveCount(0)
    })

    test("Add to dashboard says while it loads, when the dashboards can't be read, and makes the reader one", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      let release = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      let failing = true
      const lists = async () => {
        await held
        return failing ? withStatus(500, { msg: "down" }) : { msg: "ok", data: { mine: [], workspace: [team], can_keep_workspace: false } }
      }
      await visit(page, testInfo, theme, REPORTS, dashboards(added, lists))
      const add = page.getByRole("button", { name: "Add to dashboard" })
      await expect(add).toBeEnabled({ timeout: 60_000 })
      await add.click()
      const dialog = page.getByRole("dialog", { name: "Add to a dashboard" })
      await expect(dialog.getByText("Loading your dashboards…")).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Add widget" })).toBeDisabled()
      await reviewShot(page, "add-to-dashboard-loading-1280", theme)
      release()
      await expect(dialog.getByText("Couldn't load your dashboards.")).toBeVisible({ timeout: 30_000 })
      await reviewShot(page, "add-to-dashboard-error-1280", theme)
      failing = false
      await dialog.getByRole("button", { name: "Try again" }).click()
      await expect(dialog.getByText(/You keep no dashboard yet/)).toBeVisible()
      await expect(dialog.getByRole("textbox", { name: "Dashboard" })).toHaveValue("My dashboard")
      await reviewShot(page, "add-to-dashboard-empty-1280", theme)
      await dialog.getByRole("button", { name: "Add widget" }).click()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ to: OWN, body: { kind: "throughput", x: 0, y: 0 } })
      await expect(page.getByText("Added to My dashboard", { exact: true })).toBeVisible()
    })

    // CR-B14 M1 (a): the dialog is drawn inside the Display popover, and the view's button shows only on hover or a key's focus.
    test("a saved view goes on a dashboard from the Display menu, by keyboard, and the menu stays open beneath", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      await visit(page, testInfo, theme, LIST, listAnswers(added))
      await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Display" }).focus()
      await page.keyboard.press("Enter")
      const menu = page.getByRole("button", { name: "Export CSV" })
      await expect(menu).toBeVisible({ timeout: 30_000 })
      const addView = page.getByRole("button", { name: "Add Launch work to a dashboard" })
      await expect(addView).toHaveCSS("opacity", "0")
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Add Launch work to a dashboard")) break
        await page.keyboard.press("Tab")
      }
      await expect(addView).toBeFocused()
      await expect(addView).toHaveCSS("opacity", "1")
      // The menu's positioner, held now: under the modal the menu is hidden from roles (aria-hidden), not from the page.
      const menuLayer = await menu.evaluateHandle((el) => el.closest("[data-radix-popper-content-wrapper]")!)
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog", { name: "Add to a dashboard" })
      await expect(dialog.locator("[data-widget-view]")).toContainText("Launch work", { timeout: 30_000 })
      await expect(dialog.getByRole("button", { name: "Choose another view" })).toBeVisible()
      // DESIGN-BUILD-116 F5: the dialog and its scrim lie over the menu that asked for it, which stays open beneath,
      // dimmed. Its positioner stands in <body> beside them, so their layers decide what is drawn on top.
      const under = await menuLayer.evaluate((el) => Number(getComputedStyle(el).zIndex))
      const over = await dialog.evaluate((el) => ({
        dialog: Number(getComputedStyle(el).zIndex),
        scrim: Number(getComputedStyle(document.querySelector(".v3-overlay")!).zIndex),
      }))
      expect(over.scrim, "the dialog's scrim over the Display menu").toBeGreaterThan(under)
      expect(over.dialog, "the dialog over the Display menu").toBeGreaterThan(under)
      await reviewShot(page, "add-view-display-1280", theme)
      // Escape closes the dialog alone: the focus is back on the view's button, in the menu still open.
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(addView).toBeFocused()
      await expect(menu).toBeVisible()
      await reviewShot(page, "add-view-display-focus-1280", theme)
      await page.keyboard.press("Enter")
      await expect(dialog.locator("[data-widget-view]")).toContainText("Launch work")
      await dialog.getByRole("button", { name: "Add widget" }).click()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toEqual({ to: D, body: { kind: "metric", title: "", query: { view: V, weeks: 12, measure: "open" }, x: 9, y: 0, w: 3, h: 2 } })
    })

    // CR-B14 M3: a project's dashboard reads its own project, but picking one never draws the dialog again.
    test("picking a project's dashboard keeps what was chosen and typed, and Escape gives the focus back", async ({ page }, testInfo) => {
      await oneProject(page)
      await visit(page, testInfo, theme, REPORTS, { ...dashboards([]), ...inFair })
      const add = page.getByRole("button", { name: "Add to dashboard" })
      await expect(add).toBeEnabled({ timeout: 60_000 })
      await add.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog", { name: "Add to a dashboard" })
      const name = dialog.getByRole("textbox", { name: "Name" })
      await expect(name).toBeFocused()
      await page.keyboard.type("Fair cycle")
      const drawn = (await dialog.elementHandle())!
      const shows = dialog.getByRole("combobox", { name: "Shows" })
      await chooseByKeys(page, shows, "Control", "Control chart")
      const to = dialog.getByRole("combobox", { name: "Dashboard" })
      await chooseByKeys(page, to, "Fair", "Fair board")
      expect(await drawn.evaluate((el) => el.isConnected)).toBe(true)
      await expect(shows).toContainText("Control chart")
      await expect(name).toHaveValue("Fair cycle")
      await reviewShot(page, "add-to-project-dashboard-1280", theme)
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(add).toBeFocused()
    })
  })

  test.describe(`dashboards over saved views at 390 with touch (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("another reader sees a note in a view widget's place", async ({ page }, testInfo) => {
      await readerSees(page, testInfo, theme, "dashboard-view-reader-390")
    })

    test("Reports' Add to dashboard is a sheet, and a widget is added from a saved view", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      await visit(page, testInfo, theme, REPORTS, dashboards(added))
      const add = page.getByRole("button", { name: "Add to dashboard" })
      await expect(add).toBeEnabled({ timeout: 60_000 })
      await add.scrollIntoViewIfNeeded()
      await add.tap()
      const sheet = page.getByRole("dialog", { name: "Add to a dashboard" })
      await expect(sheet.getByRole("button", { name: "Add widget" })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "add-to-dashboard-390", theme)
      await sheet.getByRole("button", { name: "Add widget" }).tap()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ to: D, body: { kind: "throughput", query: { weeks: 12 } } })

      await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator(`[data-widget-id="${W}"]`)).toContainText("From Launch work", { timeout: 60_000 })
      await expect(page.locator(`[data-widget-id="${W2}"]`)).toContainText("From Launch work")
      await reviewShot(page, "dashboard-view-widget-390", theme)
      await page.getByRole("button", { name: "Add widget" }).first().tap()
      const editor = page.getByRole("dialog", { name: "Add a widget" })
      await choose(page, editor, "Reads", "A saved view", true)
      await choose(page, editor, "Saved view", "Launch work", true)
      await expect(editor.getByText(note)).toBeVisible()
      await expect(editor.getByRole("button", { name: "Add widget" })).toBeInViewport()
      await reviewShot(page, "dashboard-view-source-390", theme)
      await editor.getByRole("button", { name: "Add widget" }).tap()
      await expect.poll(() => added.length).toBe(2)
      expect(added[1]).toMatchObject({ to: D, body: { kind: "metric", query: { view: V, weeks: 12, measure: "open" } } })
    })

    // CR-B14 M1 (b): the dialog is drawn inside the filter drawer, and comes up as a sheet over it.
    test("a saved view goes on a dashboard from the filter drawer, as a sheet over it", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      await visit(page, testInfo, theme, LIST, listAnswers(added))
      await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Filter tasks" }).tap()
      const drawer = page.locator("[data-vaul-drawer]")
      await drawer.getByText("Views", { exact: true }).tap()
      await drawer.getByRole("button", { name: "Add Launch work to a dashboard" }).tap()
      const sheet = page.getByRole("dialog", { name: "Add to a dashboard" })
      const addWidget = sheet.getByRole("button", { name: "Add widget" })
      await expect(sheet.locator("[data-widget-view]")).toContainText("Launch work", { timeout: 30_000 })
      await expect(addWidget).toBeInViewport()
      await expect(drawer).toBeVisible()
      expect(await addWidget.evaluate(onTop)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "add-view-drawer-390", theme)
      await addWidget.tap()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ to: D, body: { kind: "metric", query: { view: V, weeks: 12, measure: "open" } } })
    })

    // CR-B14 M3, by touch: picking a project's dashboard keeps what was typed; a key's Escape still gives the focus back.
    test("picking a project's dashboard keeps what was chosen and typed, and Escape gives the focus back", async ({ page }, testInfo) => {
      await oneProject(page)
      await visit(page, testInfo, theme, REPORTS, { ...dashboards([]), ...inFair })
      const add = page.getByRole("button", { name: "Add to dashboard" })
      await expect(add).toBeEnabled({ timeout: 60_000 })
      await add.scrollIntoViewIfNeeded()
      await add.tap()
      const sheet = page.getByRole("dialog", { name: "Add to a dashboard" })
      const name = sheet.getByRole("textbox", { name: "Name" })
      await name.tap()
      await page.keyboard.type("Fair cycle")
      const drawn = (await sheet.elementHandle())!
      await choose(page, sheet, "Shows", "Control chart", true)
      await choose(page, sheet, "Dashboard", "Fair board", true)
      await expect(sheet.getByRole("combobox", { name: "Dashboard" })).toContainText("Fair board")
      expect(await drawn.evaluate((el) => el.isConnected)).toBe(true)
      await expect(sheet.getByRole("combobox", { name: "Shows" })).toContainText("Control chart")
      await expect(name).toHaveValue("Fair cycle")
      await reviewShot(page, "add-to-project-dashboard-390", theme)
      await page.keyboard.press("Escape")
      await expect(sheet).toHaveCount(0)
      await expect(add).toBeFocused()
    })
  })
}

// L32: a breakdown split by Cycle and measuring Effort is kept with its way and
// its measure, and draws each cycle's effort open and done, in points as the
// work was sent with them (the work with no cycle is "No cycle"). At 1280, and
// at 390 with touch, where the dialog is a sheet.
const BW = "a0000000-0000-4000-8000-0000000000d9"
const spread = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const bySlice = (key: string, name: string, done: number, open: number, doneFx: number) =>
  ({ by: "cycle", key, name, cycle: spread, lead: spread, age: spread, open: 1, overdue: 0, done, effort: { open: { points: open, hours: 0 }, done: { points: doneFx, hours: 0 } } })
const cycleSlices = [bySlice("", "", 0, 3, 0), bySlice("c4", "Cycle 4", 2, 5, 8)]
for (const phone of [false, true]) {
  test.describe(`a breakdown by cycle measuring effort${phone ? " at 390 with touch" : " at 1280"}`, () => {
    test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })

    test("is added from the dashboard, and draws each cycle's effort open and done", async ({ page }, testInfo) => {
      const added: { to: string; body: Record<string, unknown> }[] = []
      const ours = () => added.filter((a) => a.to === D).map((a) => ({ ...a.body, id: BW }))
      await visit(page, testInfo, "light", DASHBOARD, {
        ...dashboards(added),
        [`/project/dashboards/${D}/data`]: () => ({ msg: "ok", data: { widgets: [...figures, ...ours().map(() => ({ id: BW, kind: "breakdown", data: { by: "cycle", measure: "effort", slices: cycleSlices } }))] } }),
        [`/project/dashboards/${D}`]: () => ({ msg: "ok", data: { dashboard: team, widgets: [overView, overViewNumber, ...ours()], can_keep: true } }),
      })
      const tap = (l: ReturnType<Page["getByRole"]>) => (phone ? l.tap() : l.click())
      await expect(page.locator(`[data-widget-id="${W}"]`)).toContainText("From Launch work", { timeout: 60_000 })
      await tap(page.getByRole("button", { name: "Add widget" }).first())
      const dialog = page.getByRole("dialog", { name: "Add a widget" })
      await choose(page, dialog, "Shows", "Breakdown", phone)
      await choose(page, dialog, "Split", "By cycle", phone)
      await choose(page, dialog, "Measure", "Effort", phone)
      await expect(dialog.getByRole("button", { name: "Add widget" })).toBeInViewport()
      await tap(dialog.getByRole("button", { name: "Add widget" }))
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ to: D, body: { kind: "breakdown", title: "", query: { weeks: 12, by: "cycle", measure: "effort" }, w: 6, h: 4 } })

      const table = page.locator(`[data-widget-id="${BW}"] table[data-breakdown="cycle"][data-measure="effort"]`)
      await expect(table).toBeVisible({ timeout: 30_000 })
      await expect(table.locator("thead th")).toHaveText(["Cycle", "Effort open", "Effort done"])
      const rows = table.locator("tbody tr")
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0).locator("th, td")).toHaveText(["Cycle 4", "5 pt", "8 pt"])
      await expect(rows.nth(1).locator("th, td")).toHaveText(["No cycle", "3 pt", "0 pt"])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  })
}
