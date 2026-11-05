import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Dashboards (B9-b3: jira-08, asana-08, linear-32), on a production build.
// Yours opens with its widgets worked out (a number, a weekly chart and a
// breakdown) laid side by side on a computer and in one column, in the same
// order, on a phone; its keeper adds a widget, which goes in the next free
// place; a reader it is only shared with sees no way to change it. With
// SHOTS_DIR set, each is saved for review, light and dark.

const P = "9e0a0000-0000-4000-8000-0000000000b9"
const D = "d0a50000-0000-4000-8000-0000000000b3"
const dashboard = { id: D, scope: "mine", name: "Weekly review", shared: false, created_by: SAM.user_uuid, created_at: "2026-11-02T09:00:00Z", updated_at: "2026-11-02T09:00:00Z" }
const widgets = [
  { id: "a0000000-0000-4000-8000-000000000001", kind: "metric", title: "", query: { measure: "open", weeks: 12 }, x: 0, y: 0, w: 3, h: 2 },
  { id: "a0000000-0000-4000-8000-000000000002", kind: "throughput", title: "", query: { weeks: 4 }, x: 3, y: 0, w: 6, h: 4 },
  { id: "a0000000-0000-4000-8000-000000000003", kind: "breakdown", title: "", query: { by: "project", weeks: 12 }, x: 0, y: 4, w: 6, h: 4 },
]
const counts = { to_do: 4, in_progress: 2, in_review: 1, overdue: 2, done: 5 }
const data = [
  { id: widgets[0].id, kind: "metric", data: { measure: "open", value: 7 } },
  { id: widgets[1].id, kind: "throughput", data: { weeks: ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"], done: [1, 2, 0, 2], added: [3, 1, 1, 0] } },
  { id: widgets[2].id, kind: "breakdown", data: { by: "project", rows: [{ project_uuid: P, project_name: "Spring fair", ...counts }] } },
]

/** The dashboard answered, kept by the reader or only shared with them; every widget added is kept. */
async function open(page: Page, testInfo: TestInfo, theme: "light" | "dark", keeps: boolean) {
  const added: unknown[] = []
  await visit(page, testInfo, theme, {
    [`/project/dashboards/${D}/data`]: { msg: "ok", data: { widgets: data } },
    [`/project/dashboards/${D}/widgets`]: (_: URL, request: { postDataJSON(): unknown }) => {
      const body = request.postDataJSON() as Record<string, unknown>
      added.push(body)
      return { msg: "ok", data: { ...body, id: "a0000000-0000-4000-8000-000000000009" } }
    },
    [`/project/dashboards/${D}`]: { msg: "ok", data: { dashboard: keeps ? dashboard : { ...dashboard, scope: "workspace", shared: true }, widgets, can_keep: keeps } },
    "/project/dashboards": { msg: "ok", data: keeps ? { mine: [dashboard], workspace: [], can_keep_workspace: false } : { mine: [], workspace: [{ ...dashboard, scope: "workspace", shared: true }], can_keep_workspace: false } },
  })
  const number = page.locator(`[data-widget-id="${widgets[0].id}"]`)
  await expect(number).toContainText("7", { timeout: 60_000 })
  await expect(page.locator(`[data-widget-id="${widgets[1].id}"] svg`).first()).toBeVisible()
  await expect(page.locator(`[data-widget-id="${widgets[2].id}"]`).getByRole("row", { name: /Spring fair/ })).toBeVisible()
  return added
}

const box = async (page: Page, i: number) => (await page.locator(`[data-widget-id="${widgets[i].id}"]`).boundingBox())!

const listOf = (mine: unknown[]) => ({ msg: "ok", data: { mine, workspace: [], can_keep_workspace: false } })

/** The keeper's dashboard and its figures (an answer, or a function of the request for one that changes or comes late). */
const one = (d: typeof dashboard, w: unknown[], figures: unknown) => ({
  [`/project/dashboards/${D}/data`]: typeof figures === "function" ? figures : { msg: "ok", data: figures },
  [`/project/dashboards/${D}`]: { msg: "ok", data: { dashboard: d, widgets: w, can_keep: true } },
})

/** An answer held until the test lets it go: the page shows itself loading meanwhile. */
function held() {
  let go = () => {}
  const gone = new Promise<void>((resolve) => (go = resolve))
  return { gone, go }
}

/** The page with the shell's reads answered and these. */
async function visit(page: Page, testInfo: TestInfo, theme: string, answers: Record<string, unknown>) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: P, project_name: "Spring fair", is_admin: 1, open: 7, done: 5, overdue: 2, due_soon: 0 }] } },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    ...answers,
  })
  await page.goto("/app/project/dashboards", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  test.describe(`dashboards at 1280 (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("yours lays its widgets on the grid, and a widget added takes the next free place", async ({ page }, testInfo) => {
      const added = await open(page, testInfo, theme, true)
      const [n, t, b] = [await box(page, 0), await box(page, 1), await box(page, 2)]
      expect(t.x).toBeGreaterThan(n.x + n.width - 1)
      expect(Math.abs(t.y - n.y)).toBeLessThan(2)
      expect(b.y).toBeGreaterThan(t.y + t.height - 1)
      await expect(page.getByText("Only you")).toBeVisible()
      await reviewShot(page, "dashboard-1280", theme)
      await page.getByRole("button", { name: "Add widget" }).first().click()
      const dialog = page.getByRole("dialog", { name: "Add a widget" })
      await dialog.getByRole("combobox", { name: "Number" }).click()
      await page.getByRole("option", { name: "Overdue" }).click()
      await dialog.getByRole("button", { name: "Add widget" }).click()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ kind: "metric", title: "", query: { measure: "overdue", weeks: 12 }, x: 6, y: 4, w: 3, h: 2 })
      await expect(dialog).toHaveCount(0)
    })

    test("a reader it is shared with reads it and can't change it", async ({ page }, testInfo) => {
      await open(page, testInfo, theme, false)
      await expect(page.getByText("Everyone in the workspace")).toBeVisible()
      await expect(page.getByRole("button", { name: "Add widget" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: /: more$/ })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "New dashboard" })).toHaveCount(1)
    })
  })

  test.describe(`dashboards at 390 with touch (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("yours is one column in the same order, and a widget is added from the sheet", async ({ page }, testInfo) => {
      const added = await open(page, testInfo, theme, true)
      const [n, t, b] = [await box(page, 0), await box(page, 1), await box(page, 2)]
      expect(t.y).toBeGreaterThan(n.y + n.height - 1)
      expect(b.y).toBeGreaterThan(t.y + t.height - 1)
      expect(n.width).toBeGreaterThan(300)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      // DB-114 F1: the phone bar offers no project's Connected or Filter tasks on this page of the projects' own.
      await expect(page.locator("[data-phone-bar]").getByRole("button", { name: "Filter tasks" })).toHaveCount(0)
      await reviewShot(page, "dashboard-390", theme)
      await page.getByRole("button", { name: "Add widget" }).first().tap()
      const sheet = page.getByRole("dialog", { name: "Add a widget" })
      await expect(sheet.getByRole("button", { name: "Add widget" })).toBeInViewport()
      await reviewShot(page, "dashboard-add-sheet", theme)
      await sheet.getByRole("button", { name: "Add widget" }).tap()
      await expect.poll(() => added.length).toBe(1)
      expect(added[0]).toMatchObject({ kind: "metric", query: { measure: "open", weeks: 12 }, x: 6, y: 4, w: 3, h: 2 })
    })

    test("a reader on a phone reads it with no way to add, arrange or remove", async ({ page }, testInfo) => {
      await open(page, testInfo, theme, false)
      await expect(page.getByRole("button", { name: "Add widget" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: /: more$/ })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Rename and share" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Delete dashboard" })).toHaveCount(0)
      await reviewShot(page, "dashboard-reader", theme)
    })
  })

  // The page's other states (DB-114's GAPS, B9-b3): empty, error, loading and
  // the keyboard's focus, at both widths, each with the page's own words.
  for (const phone of [false, true]) {
    test.describe(`dashboards' states at ${phone ? "390 with touch" : "1280"} (${theme})`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 860 }, colorScheme: theme })

      test("no dashboard yet offers New dashboard", async ({ page }, testInfo) => {
        await visit(page, testInfo, theme, { "/project/dashboards": listOf([]) })
        await expect(page.getByText("No dashboards yet")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "New dashboard" }).first()).toBeVisible()
        await reviewShot(page, "state-empty-list", theme)
      })

      test("an empty dashboard asks its keeper for a widget", async ({ page }, testInfo) => {
        await visit(page, testInfo, theme, { ...one(dashboard, [], { widgets: [] }), "/project/dashboards": listOf([dashboard]) })
        await expect(page.getByText("Nothing on this dashboard yet")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "Add widget" })).toHaveCount(2)
        await reviewShot(page, "state-empty-dashboard", theme)
      })

      test("a list that can't be read offers Try again, which reads it again", async ({ page }, testInfo) => {
        let reads = 0
        await visit(page, testInfo, theme, { ...one(dashboard, widgets, { widgets: data }), "/project/dashboards": () => (++reads === 1 ? withStatus(503, { msg: "unavailable" }) : listOf([dashboard])) })
        const again = page.getByRole("button", { name: "Try again" })
        await expect(again).toBeVisible({ timeout: 60_000 })
        await reviewShot(page, "state-error-list", theme)
        await again.click()
        await expect(page.locator(`[data-widget-id="${widgets[0].id}"]`)).toContainText("7", { timeout: 60_000 })
      })

      test("a dashboard that can't be read offers Try again", async ({ page }, testInfo) => {
        await visit(page, testInfo, theme, { [`/project/dashboards/${D}`]: withStatus(503, { msg: "unavailable" }), "/project/dashboards": listOf([dashboard]) })
        await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 60_000 })
        await reviewShot(page, "state-error-dashboard", theme)
      })

      test("a widget the server couldn't work out says why, and figures that didn't come say so", async ({ page }, testInfo) => {
        let fail = false
        const why = "This widget reads a project you can't see."
        await visit(page, testInfo, theme, {
          ...one(dashboard, widgets, () => (fail ? withStatus(503, { msg: "unavailable" }) : { msg: "ok", data: { widgets: [data[0], { id: widgets[1].id, kind: "throughput", error: why }, data[2]] } })),
          "/project/dashboards": listOf([dashboard]),
        })
        await expect(page.locator(`[data-widget-id="${widgets[1].id}"]`).getByRole("status")).toHaveText(why, { timeout: 60_000 })
        await expect(page.locator(`[data-widget-id="${widgets[0].id}"]`)).toContainText("7")
        await reviewShot(page, "state-error-widget", theme)
        fail = true
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(page.getByText("This widget couldn't load just now.")).toHaveCount(3, { timeout: 60_000 })
        await reviewShot(page, "state-error-figures", theme)
      })

      test("the list, then the widgets' figures, show where they will be while they come", async ({ page }, testInfo) => {
        const list = held()
        const figures = held()
        await visit(page, testInfo, theme, {
          ...one(dashboard, widgets, async () => {
            await figures.gone
            return { msg: "ok", data: { widgets: data } }
          }),
          "/project/dashboards": async () => {
            await list.gone
            return listOf([dashboard])
          },
        })
        await expect(page.locator('div.grid[aria-busy="true"]')).toBeVisible({ timeout: 60_000 })
        await expect(page.locator("[data-dashboard]")).toHaveCount(0)
        await reviewShot(page, "state-loading-list", theme)
        list.go()
        await expect(page.locator("[data-dashboard-grid]")).toHaveAttribute("aria-busy", "true", { timeout: 60_000 })
        await reviewShot(page, "state-loading-figures", theme)
        figures.go()
        await expect(page.locator(`[data-widget-id="${widgets[0].id}"]`)).toContainText("7", { timeout: 60_000 })
        await expect(page.locator("[data-dashboard-grid]")).not.toHaveAttribute("aria-busy")
      })

      // The keyboard's focus, on a computer (registered there only: a gate fails on a skip).
      if (!phone) test("the keyboard reaches Add widget and a widget's menu, and shows where it is", async ({ page }, testInfo) => {
        await visit(page, testInfo, theme, { ...one(dashboard, widgets, { widgets: data }), "/project/dashboards": listOf([dashboard]) })
        await expect(page.locator(`[data-widget-id="${widgets[0].id}"]`)).toContainText("7", { timeout: 60_000 })
        // From the control before each, Tab: the ring is the keyboard's (focus-visible), never a click's.
        const add = page.getByRole("button", { name: "Add widget" })
        await page.getByRole("button", { name: "Delete dashboard" }).focus()
        await page.keyboard.press("Tab")
        await expect(add).toBeFocused()
        await reviewShot(page, "state-focus-add", theme)
        const more = page.locator(`[data-widget-id="${widgets[1].id}"]`).getByRole("button", { name: /: more$/ })
        await page.locator(`[data-widget-id="${widgets[0].id}"]`).getByRole("button", { name: /: more$/ }).focus()
        await page.keyboard.press("Tab")
        await expect(more).toBeFocused()
        await reviewShot(page, "state-focus-more", theme)
        await page.keyboard.press("Enter")
        await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused()
        await reviewShot(page, "state-focus-menu", theme)
        await page.keyboard.press("Escape")
        await expect(more).toBeFocused()
      })
    })
  }
}
