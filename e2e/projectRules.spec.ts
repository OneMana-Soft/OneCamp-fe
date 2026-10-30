import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"
import templates from "./ruleTemplates.json"
import { bugForm, launchForm } from "./demoForm"

// A project's rules (package 9 R1) in a real browser on the stubbed app: the
// list, the ready-made rules, the builder and the history, on a computer and
// a phone, light and dark. On a phone it is the bottom sheet, its actions
// pinned in view. With SHOTS_DIR set, each state is saved for review.

const P = "7c4d2e1a-3b5f-4a6c-9d8e-0f1a2b3c4d5e"
const MAYA = { user_uuid: "8a1b2c3d-4e5f-4061-8a7b-9c0d1e2f3a4b", user_name: "maya", user_full_name: "Maya Chen" }
const JONAS = { user_uuid: "9b2c3d4e-5f60-4172-9b8c-0d1e2f3a4b5c", user_name: "jonas", user_full_name: "Jonas Weber" }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, MAYA, JONAS] }
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
/** The next time a weekday (0 Sunday) comes round at an hour, on the reader's clock. */
const nextAt = (weekday: number, hour: number) => {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7))
  return d.toISOString()
}

const rules = [
  {
    id: "11111111-1111-4111-8111-111111111111", name: "Share new work out by turns", is_active: true, created_by: MAYA.user_uuid,
    trigger_type: "task_created", trigger_config: {}, conditions: { match: "all", items: [{ field: "assignee", op: "is_empty" }] },
    actions: [{ type: "assign", assign: "round_robin", user_ids: [MAYA.user_uuid, JONAS.user_uuid] }], else_actions: [],
    run_count: 1284, last_run_at: ago(4), updated_at: ago(3000),
  },
  {
    id: "22222222-2222-4222-8222-222222222222", name: "High priority needs a date", is_active: true, created_by: MAYA.user_uuid,
    trigger_type: "task_field_changed", trigger_config: { fields: ["priority"] },
    conditions: { match: "all", items: [{ field: "priority", op: "is", value: "high" }, { field: "due", op: "is_empty" }] },
    actions: [{ type: "set_due", due_in_days: 2 }], else_actions: [], run_count: 37, last_run_at: ago(95), updated_at: ago(3000),
  },
  {
    id: "33333333-3333-4333-8333-333333333333", name: "Done means reviewed", is_active: false, created_by: MAYA.user_uuid,
    trigger_type: "task_status_changed", trigger_config: { to_status: "done" },
    conditions: { match: "all", items: [{ field: "tags", op: "has", value: "needs review" }] },
    actions: [{ type: "set_status", status: "inReview" }, { type: "add_comment", text: "This needs a review before it's done." }],
    else_actions: [{ type: "notify", notify: "creator", text: "{task} is done" }],
    run_count: 9, last_run_at: ago(60 * 26), paused_reason: "Paused: it ran 60 times in a minute", updated_at: ago(3000),
  },
  {
    id: "44444444-4444-4444-8444-444444444444", name: "A review task every Monday", is_active: true, created_by: MAYA.user_uuid,
    trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=MO", at: "09:00", tz: "Europe/London" }, conditions: {},
    actions: [{ type: "create_task", task_name: "Review the week", priority: "medium" }, { type: "set_due", due_in_days: 4 }], else_actions: [],
    run_count: 6, last_run_at: ago(60 * 24 * 2), next_run_at: nextAt(1, 9), updated_at: ago(3000),
  },
  {
    id: "55555555-5555-4555-8555-555555555555", name: "Friday: chase what's overdue", is_active: true, created_by: MAYA.user_uuid,
    trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=FR", at: "16:00", each_task: true, tz: "Europe/London" },
    conditions: { match: "all", items: [{ field: "due", op: "overdue" }] }, actions: [{ type: "notify", notify: "assignee", text: "{task} is overdue" }], else_actions: [],
    run_count: 3, last_run_at: ago(60 * 24 * 4), next_run_at: nextAt(5, 16), updated_at: ago(3000),
  },
]

const runs = [
  { id: "r1", workflow_id: rules[0].id, trigger: "task_created", subject_id: "a1", subject: "Draft the launch FAQ", status: "ok", branch: "then",
    steps: [{ type: "assign", status: "ok", field: "assignee", detail: "assigned", before: "", after: JONAS.user_uuid }], started_at: ago(4) },
  { id: "r2", workflow_id: rules[1].id, trigger: "task_field_changed", subject_id: "a2", subject: "Set up SSO for the pilot customer", status: "ok", branch: "then",
    steps: [{ type: "set_due", status: "ok", field: "due", detail: "due 21 Oct" }], started_at: ago(95) },
  { id: "r3", workflow_id: rules[2].id, trigger: "task_status_changed", subject_id: "a3", subject: "Record the product walkthrough", status: "undone", branch: "then",
    steps: [{ type: "set_status", status: "undone", field: "status", detail: "put back" }], started_at: ago(60 * 26) },
  { id: "r4", workflow_id: rules[0].id, trigger: "task_created", subject_id: "a4", subject: "Book the launch retro", status: "skipped",
    error: "Skipped: the rule's owner can't see this task", steps: [], started_at: ago(60 * 30) },
  { id: "r5", workflow_id: rules[4].id, trigger: "schedule", subject: "4 tasks", status: "ok", matched: 4,
    steps: ["b1", "b2", "b3", "b4"].map((t) => ({ type: "notify", status: "ok", task_id: t, detail: "told 1" })), started_at: ago(60 * 24 * 4) },
]

const statusRules = [
  { project_id: P, status: "inReview", who: "anyone", people: [], required: ["assignee"], approvers: [], approvals_needed: 1, updated_by: MAYA.user_uuid, updated_at: ago(600) },
  { project_id: P, status: "done", who: "admins", people: [], required: ["assignee", "due"], approvers: [MAYA.user_uuid, JONAS.user_uuid], approvals_needed: 2, updated_by: MAYA.user_uuid, updated_at: ago(600) },
]

async function openRules(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  let saved: Array<{ status: string }> = statusRules.map((r) => ({ ...r }))
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/rules/runs`]: { msg: "ok", data: runs },
    [`/project/${P}/rules`]: { msg: "ok", data: { rules, can_manage: true, templates, max: 50, agents: true } },
    // Kept as saved, as the server keeps them: a save is read back.
    [`/project/${P}/statusRules`]: (_url: URL, request: Request) => {
      if (request.method() !== "POST") return { msg: "ok", data: { rules: saved, can_manage: true, max: 40 } }
      const input = request.postDataJSON() as { status: string }
      const rule = { ...input, project_id: P, updated_by: SAM.user_uuid, updated_at: new Date().toISOString() }
      saved = [...saved.filter((r) => r.status !== input.status), rule]
      return { msg: "ok", data: rule }
    },
    // The project's forms, which a rule can run on (package 9 R4).
    [`/project/${P}/forms`]: { msg: "ok", data: { forms: [launchForm, bugForm], can_edit: true } },
    "/notices": { msg: "ok", data: { notices: [] } },
    "/user/dm-ai-targets": {
      msg: "ok",
      data: [
        { user_uuid: "aaaaaaaa-1111-4111-8111-111111111111", user_name: "Triage Bot", is_bot: true },
        { user_uuid: "bbbbbbbb-2222-4222-8222-222222222222", user_name: "Release Scribe", is_bot: true },
      ],
    },
  })
  await page.goto(`/app/project/${P}?tab=kanban&tool=rules`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-project-rules]")).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/**
 * The button is in the window, whole, once the sheet has settled: a pinned
 * footer's action is never under the fold. (A phone's sheet slides up; it is
 * read when it stops.)
 */
async function inView(page: Page, name: RegExp | string) {
  const vp = page.viewportSize()!
  const button = page.getByRole("button", { name }).last()
  await expect
    .poll(async () => {
      const box = await button.boundingBox()
      return box ? box.y + box.height : Infinity
    }, { timeout: 10_000 })
    .toBeLessThanOrEqual(vp.height + 0.5)
  expect((await button.boundingBox())!.y).toBeGreaterThanOrEqual(0)
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`a project's rules ${label}, ${theme}`, () => {
      test.use(use)

      test("the list reads each rule as a sentence, says which stopped and why, and keeps its actions in view", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        const box = page.locator("[data-project-rules]")
        await expect(box.getByText("Share new work out by turns")).toBeVisible()
        await expect(box.getByText("Paused: it ran 60 times in a minute")).toBeVisible()
        await expect(box.getByText("1,284 runs")).toBeVisible()
        await inView(page, /New rule/)
        await noSideScroll(page)
        await shot(page, "rules-list", theme)
      })

      test("the ready-made rules, then the builder with an otherwise branch, read back as one sentence", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("button", { name: /Ready-made/ }).click()
        await expect(page.getByText("Give new work to whoever has least")).toBeVisible()
        // At rest: the pointer that pressed Ready-made isn't over Back.
        await page.mouse.move(0, 0)
        await noSideScroll(page)
        await shot(page, "rules-templates", theme)
        // The last of them: the rules on time and the agent's, in its own hue,
        // clear of the pinned footer.
        const agent = page.locator("[data-rule-template='agent-triages-bugs']")
        await agent.evaluate((el) => el.scrollIntoView({ block: "center" }))
        await expect(agent).toBeVisible()
        await shot(page, "rules-templates-end", theme)
        await page.getByText("Done means reviewed").first().click()
        const builder = page.locator("[data-rule-builder]")
        await expect(builder.locator("[data-rule-step='otherwise']")).toBeVisible()
        await expect(builder.getByText("Reads as")).toBeVisible()
        await inView(page, "Make rule")
        await noSideScroll(page)
        await shot(page, "rules-builder", theme)
      })

      test("a schedule shows its next run, and the builder sets how often, the days and the time", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        const row = page.locator(`[data-rule-row='${rules[3].id}']`)
        await expect(row.getByText(/every Monday at/i)).toBeVisible()
        await expect(row.locator("[data-rule-next]")).toHaveText(/^next /)
        await page.getByRole("button", { name: /New rule/ }).click()
        const builder = page.locator("[data-rule-builder]")
        await builder.getByRole("combobox", { name: "Trigger" }).click()
        await page.getByRole("option", { name: "On a schedule" }).click()
        await expect(builder.locator("[data-rule-schedule]")).toBeVisible()
        // The zone as people say it, never its database name.
        await expect(builder.getByText(/in your time zone: .*GMT/)).toBeVisible()
        await builder.getByRole("button", { name: "Wed", pressed: false }).click()
        await builder.getByLabel("Task").fill("Review the week")
        await expect(builder.getByText(/every Monday and Wednesday at/i).first()).toBeVisible()
        // The name follows the rule until someone types one.
        await expect(builder.getByLabel("Name", { exact: true })).toHaveValue(/^Every Monday and Wednesday at .*: make ‘Review the week’$/)
        // The top of the builder at rest: the dialog scrolled to its start, so
        // its title and the rule read back as one sentence show.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await builder.evaluate((el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== "visible") {
              p.scrollTop = 0
              break
            }
          }
        })
        await expect(builder.getByText("Reads as")).toBeInViewport()
        await page.mouse.move(0, 0)
        await shot(page, "rules-schedule-top", theme)
        await builder.getByRole("radio", { name: "Acts on each task" }).click()
        await expect(builder.locator("[data-rule-step='which tasks']")).toBeVisible()
        await builder.getByRole("combobox", { name: "Action" }).first().click()
        // This edition has no agents: the action list opens without one.
        await expect(page.getByRole("option").first()).toBeVisible()
        await expect(page.getByRole("option", { name: "Ask an agent" })).toHaveCount(0)
        await page.keyboard.press("Escape")
        // At rest for the shot: no pointer over a control and no focus ring.
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await inView(page, "Make rule")
        await noSideScroll(page)
        await shot(page, "rules-schedule", theme)
        // A due date's trigger.
        await builder.getByRole("combobox", { name: "Trigger" }).click()
        await page.getByRole("option", { name: "A task is due soon" }).click()
        await expect(builder.locator("[data-rule-due]")).toBeVisible()
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await shot(page, "rules-due", theme)
      })

      test("a rule runs when a form is sent, and its messages can say each answer", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("button", { name: /New rule/ }).click()
        const builder = page.locator("[data-rule-builder]")
        await builder.getByRole("combobox", { name: "Trigger" }).click()
        await page.getByRole("option", { name: "A form is sent" }).click()
        // The project's first form, to start from.
        await expect(builder.getByRole("combobox", { name: "Form" })).toHaveText("Launch requests")
        await builder.getByRole("combobox", { name: "Action" }).first().click()
        await page.getByRole("option", { name: "Tell someone" }).click()
        await builder.getByLabel("Notice").fill("{answer:what}, from {answer:email}")
        const said = builder.locator("[data-rule-variables]")
        await expect(said).toContainText("{form}")
        await expect(said).toContainText("{answer:soon}")
        await expect(said).toContainText("How soon do you need it?")
        await expect(builder.getByLabel("Name", { exact: true })).toHaveValue("‘Launch requests’ is sent: tell whoever has it")
        await said.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await inView(page, "Make rule")
        await noSideScroll(page)
        await shot(page, "rules-form", theme)
      })

      test("the statuses say what moving a task into each takes, and an admin changes one in place", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("radio", { name: /Statuses/ }).click()
        const done = page.locator("[data-status-rule='done']")
        await expect(done.getByText("Admins only · needs an assignee, a due date · 2 approvals")).toBeVisible()
        await done.getByRole("button", { name: /Change/ }).click()
        await expect(page.locator("[data-status-rule-editor]").getByText("2 of 2")).toBeVisible()
        // The open row at rest: the pointer leaves the toggle, so the shot
        // shows its open state, not its hover halo.
        await page.mouse.move(0, 0)
        await noSideScroll(page)
        await shot(page, "status-rules", theme)
      })

      test("the history says what each run did, with Undo where it changed something", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("radio", { name: /History/ }).click()
        const list = page.getByRole("list", { name: "Runs" })
        await expect(list.getByText("Draft the launch FAQ")).toBeVisible()
        await expect(list.getByText("can't see this task")).toBeVisible()
        await expect(list.getByRole("button", { name: /Undo/ })).toHaveCount(2)
        await expect(list.getByText("Matched 4 · acted on 4")).toBeVisible()
        await noSideScroll(page)
        await shot(page, "rules-history", theme)
      })

      test("a status can want the client's yes too, and its row says so once saved", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("radio", { name: /Statuses/ }).click()
        const review = page.locator("[data-status-rule='inReview']")
        await review.getByRole("button", { name: /Change/ }).click()
        const editor = page.locator("[data-status-rule-editor]")
        await editor.getByRole("button", { name: /The client approves too/ }).click()
        await page.mouse.move(0, 0)
        await noSideScroll(page)
        await shot(page, "status-rules-client", theme)
        await editor.getByRole("button", { name: "Save" }).click()
        await expect(review.getByText("Needs an assignee · the client's approval")).toBeVisible()
      })

      test("a rule can start when a task's approval is answered, and its messages can say who answered and how", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openRules(page, testInfo, theme)
        await page.getByRole("button", { name: /New rule/ }).click()
        const builder = page.locator("[data-rule-builder]")
        await builder.getByRole("combobox", { name: "Trigger" }).click()
        await page.getByRole("option", { name: "An approval is answered" }).click()
        await builder.getByRole("combobox", { name: "How it ends" }).click()
        await page.getByRole("option", { name: "Approved" }).click()
        await builder.getByRole("combobox", { name: "Action" }).first().click()
        await page.getByRole("option", { name: "Tell someone" }).click()
        await builder.getByLabel("Notice").fill("{approver} approved {task}: {comment}")
        const said = builder.locator("[data-rule-variables]")
        await expect(said).toContainText("{approver}")
        await expect(said).toContainText("{outcome}")
        await expect(said).toContainText("{comment}")
        await expect(builder.getByLabel("Name", { exact: true })).toHaveValue(/is approved/)
        await said.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await inView(page, "Make rule")
        await noSideScroll(page)
        await shot(page, "rules-approval-answered", theme)
      })
    })
  }
}
