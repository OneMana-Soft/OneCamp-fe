import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend, withStatus } from "./stubbedApp"

// A task's approval (package 9 R2) on its page, in a real browser on the
// stubbed app: waiting for 2 of 2, one answered; the approver's answers; a
// late yes to a request its task went on without; on a computer and a phone,
// light and dark. With SHOTS_DIR set, saved for review.

const P = "7c4d2e1a-3b5f-4a6c-9d8e-0f1a2b3c4d5e"
const TASK = "7a5c00e3-0000-4000-8000-0000000000a1"
const NONE = "0001-01-01T00:00:00Z"
const MAYA = { user_uuid: "8a1b2c3d-4e5f-4061-8a7b-9c0d1e2f3a4b", user_name: "maya", user_full_name: "Maya Chen" }
const JONAS = { user_uuid: "9b2c3d4e-5f60-4172-9b8c-0d1e2f3a4b5c", user_name: "jonas", user_full_name: "Jonas Weber" }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, MAYA, JONAS] }

/** What the page asked for that this file didn't answer, named if a shot fails on it. */
const unanswered: string[] = []

/** A move to Done waiting for 2 of 2, Maya's yes in, and the reader may answer. */
const WAITING = {
  msg: "ok",
  data: {
    id: "a1", project_id: P, task_id: TASK, to_status: "done", to_name: "Done", requested_by: SAM.user_uuid, approvers: [MAYA.user_uuid, SAM.user_uuid],
    needed: 2, state: "pending", created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    decisions: [{ user_id: MAYA.user_uuid, verdict: "approve", comment: "Numbers match the plans.", decided_at: new Date().toISOString() }],
    can_decide: true, can_withdraw: true,
  },
}

/** The same move once the task went on without it (to In review, by another path): closed as moved on. */
const MOVED_ON = { msg: "ok", data: { ...WAITING.data, state: "moved_on", decided_at: new Date().toISOString(), can_decide: false, can_withdraw: false } }

/** What "Ask for approval" answers: the task itself, asked of Maya in words (R2b). */
const ASKED = {
  id: "a2", resource_kind: "task", resource_id: TASK, project_id: P, task_id: TASK, to_status: "", to_name: "",
  ask: "Are the new numbers final? Legal signed off on the wording.", requested_by: SAM.user_uuid, approvers: [MAYA.user_uuid],
  needed: 1, client: false, state: "pending", created_at: new Date().toISOString(), decisions: [], can_decide: false, can_withdraw: true,
}

/** Tomorrow at 5 in the afternoon, the browser's time. */
function tomorrowAtFive() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(17, 0, 0, 0)
  return d.toISOString()
}

/** The same ask wanting the client too, by tomorrow at 5: Maya has said yes. */
const FOR_THE_CLIENT = {
  ...ASKED, id: "a3", client: true, due_at: tomorrowAtFive(),
  decisions: [{ user_id: MAYA.user_uuid, verdict: "approve", comment: "", decided_at: new Date().toISOString() }],
}

/** The task's page on the stubbed app, its approval read answered as `approval`: an answer, or a function of the request. */
async function stubTask(page: Page, testInfo: TestInfo, theme: "light" | "dark", approval: unknown) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        task_uuid: TASK, task_name: "Publish the pricing page", task_status: "inReview", task_priority: "high", task_label: "copy, pricing",
        task_due_date: "2026-10-24T00:00:00Z", task_start_date: "", task_created_at: "2026-10-01T09:00:00Z", task_status_since: "2026-10-18T09:00:00Z",
        task_deleted_at: NONE, task_sub_task_count: 0, task_comment_count: 0, task_assignee: SAM, task_description: "<p>The Business tier's new numbers.</p>",
        task_project: project, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [],
      },
    },
    [`/task/approval/${TASK}`]: approval,
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    // The task page's other side reads (its history, links, time and the
    // rest), which this check doesn't look at: answered empty. The longest
    // prefix wins, so the answers above still stand.
    "/task/": { msg: "ok", data: null },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
  })
  page.on("response", (r) => {
    if (r.status() === 404) unanswered.push(new URL(r.url()).pathname)
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function openTask(page: Page, testInfo: TestInfo, theme: "light" | "dark", approval: unknown = WAITING) {
  await stubTask(page, testInfo, theme, approval)
  await expect(page.locator("[data-task-approval]")).toBeVisible({ timeout: 60_000 })
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test"), `unanswered: ${unanswered.join(", ")}`).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`a task's approval ${label}, ${theme}`, () => {
      test.use(use)

      test("says it waits for 1 of 2, who answered and what they said, and offers the approver its answers at 44px on a phone", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, theme)
        const card = page.locator("[data-task-approval]")
        await expect(card.getByText("Waiting for approval · 1 of 2")).toBeVisible()
        await expect(card.getByText("Numbers match the plans.")).toBeVisible()
        const approve = card.getByRole("button", { name: /Approve/ })
        await expect(approve).toBeVisible()
        if (label === "on a phone") expect((await approve.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over).toBeLessThanOrEqual(0)
        await card.scrollIntoViewIfNeeded()
        await shot(page, "task-approval", theme)
        await card.getByRole("button", { name: "Ask for changes" }).click()
        await expect(card.getByRole("textbox", { name: "What needs to change" })).toBeVisible()
        await shot(page, "task-approval-changes", theme)
      })

      test("asks for approval from the task's menu, a sheet on a phone, and the card says what is asked at once", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let sent: Record<string, unknown> | null = null
        await stubTask(page, testInfo, theme, (url: URL, request: Request) => {
          if (request.method() === "POST" && url.pathname.endsWith("/ask")) {
            sent = request.postDataJSON()
            return { msg: "ok", data: ASKED }
          }
          return { msg: "ok", data: sent ? ASKED : null }
        })
        if (label === "on a phone") {
          await page.getByRole("button", { name: "Task options" }).click({ timeout: 60_000 })
          await page.getByRole("dialog", { name: "Task actions" }).getByRole("button", { name: "Ask for approval" }).click()
        } else {
          await page.getByRole("button", { name: "More task actions" }).click({ timeout: 60_000 })
          await page.getByRole("menuitem", { name: "Ask for approval" }).click()
        }
        const sheet = page.getByRole("dialog", { name: "Ask for approval" })
        await sheet.getByRole("button", { name: /^maya/ }).click()
        await sheet.getByRole("textbox", { name: /What you ask/ }).fill(ASKED.ask)
        const ask = sheet.getByRole("button", { name: "Ask", exact: true })
        if (label === "on a phone") expect((await ask.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await noSideScroll(page)
        await shot(page, "task-approval-ask", theme)
        await ask.click()
        await expect(sheet).toHaveCount(0)
        expect(sent).toMatchObject({ approvers: [MAYA.user_uuid], needed: 1, client: false, ask: ASKED.ask })
        const card = page.locator("[data-task-approval]")
        await expect(card).toContainText(ASKED.ask)
        await card.scrollIntoViewIfNeeded()
        await shot(page, "task-approval-asked", theme)
      })

      test("a yes that comes after the task went on without its request reads it again: closed, and where the task is", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let closed = false
        await stubTask(page, testInfo, theme, (url: URL, request: Request) => {
          if (request.method() === "POST" && url.pathname.endsWith("/decide")) {
            closed = true
            return withStatus(409, { msg: "That request is closed now." })
          }
          return closed ? MOVED_ON : WAITING
        })
        const card = page.locator("[data-task-approval]")
        await expect(card.getByText("Waiting for approval · 1 of 2")).toBeVisible({ timeout: 60_000 })
        await card.getByRole("button", { name: /Approve/ }).click()
        await expect(card.getByText("Closed: the task moved to In review")).toBeVisible()
        // One toast, saying it closed, never that someone answered it.
        await expect(page.getByText("That request is closed now.", { exact: true })).toHaveCount(1)
        await expect(page.getByText("That request is closed now.", { exact: true })).toBeVisible()
        await expect(card.getByRole("button")).toHaveCount(0)
        await noSideScroll(page)
        await card.scrollIntoViewIfNeeded()
        await shot(page, "task-approval-moved-on", theme)
      })

      test("an ask that wants the client says so once its approvers are done, with what is asked and by when", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openTask(page, testInfo, theme, { msg: "ok", data: FOR_THE_CLIENT })
        const card = page.locator("[data-task-approval]")
        await expect(card).toContainText("Waiting for the client")
        await expect(card).toContainText(FOR_THE_CLIENT.ask)
        await expect(card).toContainText("Due tomorrow")
        await noSideScroll(page)
        await card.scrollIntoViewIfNeeded()
        await shot(page, "task-approval-client", theme)
      })
    })
  }
}
