import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend, type Answers } from "./stubbedApp"

// A task's own fields, typed in the panel's More fields: what's typed is read by lib/tasks/fieldInput, which the
// panel fetches as a field's box takes the focus rather than with the task page (app/firstLoad.test.ts), and is
// saved through /task/field as read. A number is saved as the number, a web address with https:// when it was
// left off, and what isn't one is refused in words with nothing sent.

const P = "9e0a0000-0000-4000-8000-0000000000f1"
const T = "7a5c00f1-0000-4000-8000-000000000001"
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
const field = (id: string, name: string, type: string, position: number) => ({ id, project_id: P, name, type, options: [], on_card: false, position, filter_id: `field:${id}` })
const POINTS = field("f0000000-0000-4000-8000-0000000000f1", "Points", "number", 1)
const SITE = field("f0000000-0000-4000-8000-0000000000f2", "Site", "url", 2)
const fields = { data: { fields: [POINTS, SITE], can_edit: true } }

type Sent = Array<{ task_uuid: string; field_id: string; value: unknown }>

/** The project, its list and the task, whose fields hold `values`; the server keeps the value it's sent and answers it. */
function answersFor(sent: Sent, values: Record<string, unknown> = {}): Answers {
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
    [`/task/info/${T}`]: {
      msg: "ok",
      data: { ...task, task_description: "", task_project: { ...project }, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [], task_fields: values },
      included: { statuses: { data: null }, fields },
    },
    // The server keeps the value it's sent and answers it.
    "/task/field": (_url: URL, request: Request) => {
      const body = request.postDataJSON() as { task_uuid: string; field_id: string; value: unknown }
      sent.push({ task_uuid: body.task_uuid, field_id: body.field_id, value: body.value })
      return { msg: "ok", data: { value: body.value } }
    },
    // The task page's other reads, answered empty, so no "Not in this test" toast lands in a shot.
    [`/project/membersInfo/${P}`]: { msg: "ok", data: { ...project, project_members: [SAM] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    "/notices": { msg: "ok", data: { notices: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
  }
}

test.use({ viewport: { width: 1280, height: 900 } })

test("at 1280, a task's number and link fields save what's typed, as read", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const sent: Sent = []
  await stubBackend(page, testInfo, answersFor(sent))
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByText(task.task_name, { exact: true }).first().click({ timeout: 60_000 })
  const panel = page.locator("[data-task-panel]")
  await expect(panel.getByText(task.task_name).first()).toBeVisible({ timeout: 20_000 })
  await panel.getByRole("button", { name: /More fields/ }).click()

  // A number, as people write one.
  const points = panel.getByLabel("Points", { exact: true })
  await points.click()
  await points.fill("1,234.5")
  await points.press("Enter")
  await expect.poll(() => sent).toContainEqual({ task_uuid: T, field_id: POINTS.id, value: 1234.5 })
  await expect(points).toHaveText(/1,?234\.5/)

  // A web address typed without https://.
  const site = panel.getByLabel("Site", { exact: true })
  await site.click()
  await site.fill("example.com/board")
  await site.press("Enter")
  await expect.poll(() => sent).toContainEqual({ task_uuid: T, field_id: SITE.id, value: "https://example.com/board" })
  await expect(panel.getByRole("link", { name: "Open Site" })).toHaveAttribute("href", "https://example.com/board")

  // What isn't a number is refused in words, and nothing is sent.
  const before = sent.length
  await points.click()
  await points.fill("lots")
  await points.press("Enter")
  await expect(page.getByText("Points wasn't changed").first()).toBeVisible()
  await expect(page.getByText(/Points takes a number/).first()).toBeVisible()
  expect(sent).toHaveLength(before)
})

/** The task page, opened on its own address, as `theme`: its fields hold `values`. */
async function openTask(page: Page, testInfo: TestInfo, sent: Sent, values: Record<string, unknown>, theme: string) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, answersFor(sent, values))
  await page.goto(`/app/task/${T}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const panel = page.locator("[data-task-panel]")
  await expect(panel.getByText(task.task_name).first()).toBeVisible({ timeout: 60_000 })
  return panel
}

// A phone's keyboard Enter goes through the same InlineEdit as a laptop's. The reader of what's typed is fetched as
// the box takes the focus; with no connection it can't be, and that's said with the field keeping its value
// (DESIGN-BUILD-26). Offline matters: online, a chunk that won't load reloads the page instead (lib/chunkRecovery).
for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["at 1280", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`${where}, ${theme}`, () => {
      test.use(use)

      test("offline, a number that can't be read is said and the field keeps its value; back online, Enter saves it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Sent = []
        const panel = await openTask(page, testInfo, sent, { [POINTS.id]: 8 }, theme)
        const press = (target: Locator) => (use.viewport.width < 500 ? target.tap() : target.click())
        await press(panel.getByRole("button", { name: /More fields/ }))
        const points = panel.getByLabel("Points", { exact: true })
        await expect(points).toHaveText("8")

        // No connection before the box first takes the focus, so its reader can't be fetched.
        await page.context().setOffline(true)
        await press(points)
        await points.fill("13")
        await points.press("Enter")
        await expect(page.getByText("Points wasn't changed").first()).toBeVisible()
        await expect(page.getByText("Check your connection and try again.").first()).toBeVisible()
        await expect(points).toHaveText("8")
        expect(sent).toHaveLength(0)
        await reviewShot(page, "taskField-offline", theme)

        // Back online, the same keys save it: the reader is asked for again, and the focus stays on the value.
        await page.context().setOffline(false)
        await press(points)
        await points.fill("13")
        await points.press("Enter")
        await expect.poll(() => sent).toContainEqual({ task_uuid: T, field_id: POINTS.id, value: 13 })
        await expect(points).toHaveText("13")
        await expect(points).toBeFocused()
        await reviewShot(page, "taskField-saved", theme)
      })
    })
  }
}
