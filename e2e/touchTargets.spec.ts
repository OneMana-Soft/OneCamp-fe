import { expect, test } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// A guard over the dense rows on a phone (coordinator, 14 Oct 2026, after QA
// SH-04): every base control takes a tap across at least 44px (app/phone.css
// F3), and where two sit closer than that, the later one would take the taps
// meant for the edge of the first. No two different controls in a dense row
// may reach over each other; a row that does gets spacing on a touch screen
// (a gap of at least 44 minus the size), never a smaller reach. The doc's
// phone bar and selection bar are checked on the doc page's branch (batch 16).

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const P = "9e0a0000-0000-4000-8000-0000000000e3"
const TASK = "7a5c00e3-0000-4000-8000-000000000001"
const NONE = "0001-01-01T00:00:00Z"

test("two reaches that overlap are found, and two that don't are not", () => {
  const box = (name: string, left: number) => ({ name, left, top: 0, right: left + 44, bottom: 44 })
  expect(overlapping([box("Bold", 0), box("Italic", 30)])).toEqual(['"Bold" and "Italic" share 14×44 px'])
  expect(overlapping([box("Bold", 0), box("Italic", 44)])).toEqual([])
})

test("the message box: no two controls reach over each other", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  })
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const composer = page.locator("[data-phone-composer]")
  await expect(composer).toBeVisible({ timeout: 60_000 })
  // Its tools show once the field has focus.
  await composer.locator('[contenteditable="true"]').first().click()
  await expect(page.locator("[data-phone-tools]")).toBeVisible({ timeout: 15_000 })
  expect(overlapping(await reachesIn(page, "[data-phone-composer]"))).toEqual([])
})

test("the task's header: no two controls reach over each other", async ({ page }, testInfo) => {
  const project = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
  await stubBackend(page, testInfo, {
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        task_uuid: TASK,
        task_name: "Write the release notes",
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
        task_description: "<p>What it needs.</p>",
        task_project: project,
        task_sub_tasks: [],
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-header]")).toBeVisible({ timeout: 60_000 })
  expect(overlapping(await reachesIn(page, "[data-task-header]"))).toEqual([])
})
