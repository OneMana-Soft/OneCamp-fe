import { expect, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend, type Answers } from "./stubbedApp"

/**
 * A project board with three columns on a laptop, every read the project page
 * makes answered (so no "Not found" toast lands beside a menu), for the menu
 * and overlay checks (boardCardMenu, sideMenus, overlayRest) and the Undo of
 * what its admins delete (undoAfterDelete).
 */
export const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
const NONE = "0001-01-01T00:00:00Z"
const NAMES = ["Draft launch email", "Fix login redirect on Safari", "Review pricing page copy"]
const card = (i: number, status: string) => ({
  task_uuid: `00000000-0000-4000-8000-${({ todo: "1", inProgress: "2", done: "3" } as Record<string, string>)[status]}${String(i).padStart(11, "0")}`,
  task_name: `${status === "todo" ? "" : `${status} `}${NAMES[i % NAMES.length]}`,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_due_date: NONE,
  task_start_date: NONE,
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Website relaunch", project_is_admin: true },
})
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }

/** The board, its reads answered here, in a theme; `answers` adds or replaces reads (stubBackend's). Returns the moves it sends. */
export async function openBoard(page: Page, testInfo: TestInfo, theme: "light" | "dark", answers: Answers = {}) {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    // The first-run keyboard tip, which would rise in the corner mid-test.
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: NAMES.map((_, i) => card(i, "todo")),
        project_tasks_in_progress: [card(0, "inProgress")],
        project_tasks_in_review: [],
        project_tasks_done: [card(0, "done")],
        project_tasks_canceled: [],
        project_tasks_done_count: 1,
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    // The project page's other reads, answered empty, so no "Not found"
    // toast lands beside the menu.
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: false } },
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: false } },
    // Nothing to go on yet: the forecast says no date.
    [`/project/${P}/forecast`]: {
      msg: "ok",
      data: { project_uuid: P, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, open: 0, unit: "tasks", per_week: 0, weeks: 0, held_by: [], held_count: 0 },
    },
    // A card's panel: the milestone it's in.
    "/task/milestone/": { msg: "ok", data: null },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: { notices: [] } },
    ...Object.fromEntries(
      [...NAMES.map((_, i) => card(i, "todo")), card(0, "inProgress"), card(0, "done")].map((t) => [
        `/task/info/${t.task_uuid}`,
        { msg: "ok", data: { ...t, task_project: { ...project }, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_blocked_by: [], task_blocks: [] } },
      ]),
    ),
    "/task/moveTask": { msg: "ok", data: {} },
    ...answers,
  })
  const moves: { task_status: string; task_uuid: string }[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/task/moveTask")) moves.push(JSON.parse(r.postData() ?? "{}"))
  })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-board] [data-task-id]").first()).toBeVisible({ timeout: 60_000 })
  return moves
}
