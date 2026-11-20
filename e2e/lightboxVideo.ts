import { expect, type Locator, type Page, type TestInfo } from "@playwright/test"

import { P as BOARD_P, openBoard } from "./projectBoard"
import { recordedVideo, servedInRanges } from "./recordedVideo"
import { SAM, TASK_PANEL_READS, withStatus } from "./stubbedApp"

// A real task whose read carries a video (Clip.webm, recorded in the page) and
// a document whose address fails, opened in the lightbox from its tile, the
// video loaded and its controls up. The lightbox video specs share it.

const TASK = "00000000-0000-4000-8000-100000011390"
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const clip = (id: string) => ({
  attachment_uuid: id, attachment_file_name: "Clip.webm", attachment_obj_key: `${SAM.user_uuid}/clip.webm`, attachment_size: 48_213,
  attachment_type: "video", attachment_raw_type: "video/webm", attachment_created_at: ago(30),
})
// No object key: its tile reads nothing, so the only read of it is the lightbox's read ahead.
const notes = (id: string) => ({
  attachment_uuid: id, attachment_file_name: "Notes.pdf", attachment_obj_key: "", attachment_size: 12_000,
  attachment_type: "document", attachment_raw_type: "application/pdf", attachment_created_at: ago(20),
})
const CLIP_ID = "00000000-0000-4000-8000-1139000000a1"
const NOTES_ID = "00000000-0000-4000-8000-1139000000a2"
const MEDIA = "https://media.test/clip.webm"

/** The page's own errors, told by the test (V-1139's probe met one per size). */
export const errorsOf = new WeakMap<Page, string[]>()

export async function onTaskPage(page: Page, testInfo: TestInfo, theme: "light" | "dark", touch: boolean) {
  const errors: string[] = []
  errorsOf.set(page, errors)
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)))
  const task = { task_uuid: TASK, task_name: "Draft launch email", task_status: "todo", task_priority: "medium", task_project: { project_uuid: BOARD_P, project_name: "Website relaunch", project_is_admin: true } }
  await openBoard(page, testInfo, theme, {
    ...TASK_PANEL_READS,
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        ...task, task_label: "", task_due_date: "0001-01-01T00:00:00Z", task_start_date: "0001-01-01T00:00:00Z", task_created_at: "2026-10-01T09:00:00Z",
        task_deleted_at: "0001-01-01T00:00:00Z", task_assignee: SAM, task_created_by: SAM, task_description: "", task_sub_tasks: [], task_comments: [],
        task_activities: [], task_attachments: [clip(CLIP_ID), notes(NOTES_ID)], task_collaborators: [], task_blocked_by: [], task_blocks: [],
        task_access: { edit: true, delete: true, comment: true, log_time: true, restrict: true },
      },
    },
    "/restriction": { msg: "ok", data: { task_uuid: TASK, restricted: false, people: [], can_change: true } },
    [`/project/getFile/${BOARD_P}/${CLIP_ID}`]: { msg: "Got the url!", url: MEDIA },
    [`/project/getFile/${BOARD_P}/${NOTES_ID}`]: withStatus(500, { msg: "internal error" }),
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A real video, recorded in the page, served from its own address by ranges, as the store serves it.
  const video = await recordedVideo(page, 640, 360)
  await page.route("https://media.test/**", servedInRanges(video, "video/webm"))
  const tile = page.getByRole("button", { name: "Clip.webm" }).first()
  if (touch) await tile.tap({ timeout: 60_000 })
  else await tile.click({ timeout: 60_000 })
  const box = page.locator("[data-lightbox]")
  await expect.poll(() => box.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBe(640)
  // The controls show while the video is paused; at 1280 a mouse over it, as a person's.
  if (!touch) {
    const v = await boxOf(box.locator("video"))
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2)
  }
  await expect(box.getByRole("button", { name: "Mute", exact: true })).toBeVisible({ timeout: 30_000 })
  // On a phone the lightbox slides up as a sheet: its controls are measured once it stands still.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 10_000 })
}

export type Box = { x: number; y: number; width: number; height: number }
export const boxOf = async (l: Locator) => (await l.boundingBox()) as Box
