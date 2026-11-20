import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, TASK_PANEL_READS, expectEveryCallAnswered, reviewShot, stubBackend } from "./stubbedApp"

// V-670 (13 Nov): the server keeps a pull request's review on the task
// (business/GitHub updateTaskReviewState: "approved", "changes_requested" or
// "commented"), and the task's Development card reads it in the Pull request
// row, after the state word and before the checks, as a dot and words: on a
// phone too, where the row wraps rather than clips. Any other value, or none,
// shows nothing. Display only: it rides the task's own read. Every call the
// page makes is answered; with SHOTS_DIR set, each view is saved for review
// (pr-review-<name>-<width>-<theme>.png) and dark runs too.

const P = "9e0a0000-0000-4000-8000-0000000000f6"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00f6-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: admin }

// Three tasks, each with a pull request: approved with its checks passing,
// changes requested with its checks failing, and not reviewed yet.
const TASKS = [
  { name: "Ship the pricing page", pr: 128, review: "approved", checks: "success" },
  { name: "Fix the invoice totals", pr: 131, review: "changes_requested", checks: "failure" },
  { name: "Write the launch post", pr: 134, review: "", checks: "in_progress" },
] as const

function taskInfo(i: number) {
  const t = TASKS[i]
  return {
    msg: "ok",
    data: {
      task_uuid: id(i),
      task_name: t.name,
      task_key: `Q4-${i + 1}`,
      task_status: "inProgress",
      task_priority: "medium",
      task_label: "",
      task_due_date: "",
      task_start_date: "",
      task_created_at: "2026-11-02T09:00:00Z",
      task_status_since: "2026-11-02T09:00:00Z",
      task_deleted_at: NONE,
      task_sub_task_count: 0,
      task_comment_count: 0,
      task_assignee: SAM,
      task_created_by: SAM,
      task_description: "<p>What it needs.</p>",
      task_project: { ...project },
      task_access: { view: true, edit: true, delete: true, comment: true, log_time: true },
      task_sub_tasks: [],
      task_comments: [],
      task_activities: [],
      task_attachments: [],
      task_collaborators: [],
      task_github_branch: `feature/q4-${i + 1}`,
      task_github_pr_url: `https://github.com/onemana/app/pull/${t.pr}`,
      task_github_pr_number: t.pr,
      task_github_pr_state: "open",
      task_github_pr_check_status: t.checks,
      task_github_pr_review_state: t.review,
    },
  }
}

/** The task page (its panel), opened on its own address. */
async function openTask(page: Page, testInfo: TestInfo, i: number) {
  const answers: Record<string, unknown> = {
    ...TASK_PANEL_READS,
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/milestone/": { msg: "ok", data: null },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/restriction": { msg: "ok", data: { restricted: false, people: [], can_change: true } },
    // The card's own read beside the task's: the last sync went through.
    "/task/github-sync-status/": { msg: "ok", data: { status: "synced", attempts: 1 } },
    [`/task/info/${id(i)}`]: taskInfo(i),
    [`/task/${id(i)}/links`]: { links: [], count: 0 },
  }
  await stubBackend(page, testInfo, answers)
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem("onecamp:demo-lead-dismissed", "1")
  })
  await page.goto(`/app/task/${id(i)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const card = page.locator("[data-task-panel]").getByRole("region", { name: "Development" })
  const prRow = card.locator('[data-dev-row="pr"]')
  await expect(prRow.getByRole("link", { name: new RegExp(`onemana/app#${TASKS[i].pr}`) })).toBeVisible({ timeout: 60_000 })
  await prRow.scrollIntoViewIfNeeded()
  return prRow
}

/** The row's words in reading order: the state, then the review, then the checks; and nothing wider than the page. */
async function expectReadsInOrder(page: Page, prRow: Locator, words: string[]) {
  const text = (await prRow.textContent()) ?? ""
  const at = words.map((w) => text.indexOf(w))
  expect(at.every((n) => n >= 0), `${words.join(", ")} in "${text}"`).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  const width = page.viewportSize()!.width
  for (const w of words) {
    const box = await prRow.getByText(w, { exact: true }).boundingBox()
    expect(box, w).not.toBeNull()
    expect(box!.x + box!.width, `${w} inside the page`).toBeLessThanOrEqual(width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true)
}

const shot = (page: Page, name: string, theme: string) => reviewShot(page, `pr-review-${name}`, theme)

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["at 1280", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
    ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`a pull request's review in the Development card ${where}, ${theme}`, () => {
      test.use(use)

      test("an approved pull request reads Approved between its state and its checks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const prRow = await openTask(page, testInfo, 0)
        await expect(prRow.getByText("Approved", { exact: true })).toBeVisible()
        await expectReadsInOrder(page, prRow, ["Open", "Approved", "Checks passing"])
        await shot(page, "approved", theme)
        await expectEveryCallAnswered(page)
      })

      test("requested changes read Changes requested, before the failing checks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const prRow = await openTask(page, testInfo, 1)
        await expect(prRow.getByText("Changes requested", { exact: true })).toBeVisible()
        await expectReadsInOrder(page, prRow, ["Open", "Changes requested", "Checks failing"])
        await shot(page, "changes", theme)
        await expectEveryCallAnswered(page)
      })

      test("a pull request with no review shows no review words, only its state and checks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const prRow = await openTask(page, testInfo, 2)
        await expect(prRow.getByText("Checks running", { exact: true })).toBeVisible()
        await expect(prRow.getByText(/^(Approved|Changes requested|Reviewed)$/)).toHaveCount(0)
        await expectReadsInOrder(page, prRow, ["Open", "Checks running"])
        await expectEveryCallAnswered(page)
      })
    })
  }
}
