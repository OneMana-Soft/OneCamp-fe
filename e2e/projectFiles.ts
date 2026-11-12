import { expect, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend, type Answers } from "./stubbedApp"

/**
 * A project's Files tab with two files, every read the page makes and the
 * file writes answered here, for the tab's own checks (projectFiles) and the
 * reach scan (reachScan).
 */
export const P = "5f11e5a0-0000-4000-8000-0000000000f1"
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
const ADMIN = {
  role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true,
  post_updates: true, add_files: true, manage: true, manage_people: true, archive: true,
}
/** A member who may only read the project (Work Access): no files to add, nothing to link. */
export const READER = { ...ADMIN, role: "viewer", create_tasks: false, edit_tasks: "none", delete_tasks: "none", post_updates: false, add_files: false, manage: false, manage_people: false, archive: false }
const PROJECT = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
const file = (n: number, name: string, type: string, raw: string) => ({
  attachment_uuid: `5f11e5a0-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  attachment_file_name: name, attachment_obj_key: `${SAM.user_uuid}/${n}_${name}`, attachment_size: 48_000,
  attachment_type: type, attachment_raw_type: raw, attachment_created_at: "2026-10-20T09:00:00Z",
})

/**
 * The tab, its reads and the file writes answered here, and `extra`; returns the writes it was sent. The reader is the
 * project's admin unless `access` says otherwise (READER), and the project has two files unless `files` is false; with
 * none, the caller waits for what it expects on the tab.
 */
export async function openFiles(page: Page, testInfo: TestInfo, extra: Answers = {}, { access = ADMIN, files: some = true }: { access?: typeof ADMIN; files?: boolean } = {}) {
  const files = some ? [file(1, "Launch brief.pdf", "document", "application/pdf"), file(2, "Pricing sheet.xlsx", "document", "application/vnd.ms-excel")] : []
  const project = { ...PROJECT, project_is_admin: access.manage ? 1 : 0, project_access: access }
  const writes: { path: string; body: unknown }[] = []
  let n = 10
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
  })
  await stubBackend(page, testInfo, {
    [`/project/attachments/${P}`]: () => ({ msg: "got project attachment list!", data: { ...project, project_attachments: files.slice() } }),
    [`/project/getFile/${P}/`]: { msg: "Got the url!", url: `data:image/png;base64,${PNG.toString("base64")}` },
    "/uploadFile": () => {
      writes.push({ path: "/uploadFile", body: null })
      return { msg: "successfully Uploaded !", object_uuid: `5f11e5a0-0000-4000-8000-0000000001${n++}` }
    },
    "/project/addAttachment": (_url: URL, req: Request) => {
      const body = req.postDataJSON() as { project_attachments: Array<Record<string, unknown>> }
      writes.push({ path: "/project/addAttachment", body })
      for (const a of body.project_attachments) files.push({ ...(a as ReturnType<typeof file>), attachment_obj_key: `${SAM.user_uuid}/${a.attachment_uuid}` })
      return { msg: "ok" }
    },
    "/project/removeAttachment": (_url: URL, req: Request) => {
      const body = req.postDataJSON() as { attachment_obj_key: string }
      writes.push({ path: "/project/removeAttachment", body })
      const at = files.findIndex((f) => f.attachment_uuid === body.attachment_obj_key)
      if (at >= 0) files.splice(at, 1)
      return { status: "success", data: body.attachment_obj_key }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    // The task tab's reads, answered empty, so no shot meets the stub's toast for them.
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...PROJECT, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 0, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    // Nothing to forecast yet, as the server says it: the header's chip says nothing. (A null answer kept the chip's
    // loading slot, a grey bar under the project's line, in every shot.)
    [`/project/${P}/forecast`]: {
      msg: "ok",
      data: { project_uuid: P, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, open: 0, unit: "tasks", per_week: 0, weeks: 0, held_by: [], held_count: 0 },
    },
    "/notices": { msg: "ok", data: { notices: [] } },
    ...extra,
  })
  await page.goto(`/app/project/${P}?tab=attachments`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  if (some) await expect(page.getByText("Launch brief.pdf").first()).toBeVisible({ timeout: 60_000 })
  return { writes }
}
