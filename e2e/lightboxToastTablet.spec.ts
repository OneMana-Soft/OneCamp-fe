import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { P as BOARD_P, openBoard } from "./projectBoard"
import { PNG } from "./projectFiles"
import { SAM, TASK_PANEL_READS, reviewShot, withStatus } from "./stubbedApp"

// A toast stands clear of a full-screen overlay's own foot controls from sm up.
// At tablet widths (640 to ~885 px) the toasts sit bottom right, 356px wide and
// 24px off the foot, and the lightbox's zoom controls are centred 24px off the
// foot: a toast raised while the lightbox was open covered the controls' right
// end and, above the dialog (--z-toast over --z-modal), took the taps meant for
// them. The toast here is the app's own: the lightbox reads the next file's
// address ahead, that read fails, and the failure is told. At 1280 the two
// never met, and on a phone the lightbox is a sheet and toasts come in at the
// top (app/phone.css C9): both are the guards.

const TASK = "00000000-0000-4000-8000-1000000077b1"
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const picture = (id: string) => ({
  attachment_uuid: id, attachment_file_name: "Whiteboard.png", attachment_obj_key: `${SAM.user_uuid}/whiteboard.png`, attachment_size: 48_213,
  attachment_type: "image", attachment_raw_type: "image/png", attachment_created_at: ago(30),
})
// No object key: its tile reads nothing, so the only read of it is the lightbox's read ahead.
const notes = (id: string) => ({
  attachment_uuid: id, attachment_file_name: "Notes.pdf", attachment_obj_key: "", attachment_size: 12_000,
  attachment_type: "document", attachment_raw_type: "application/pdf", attachment_created_at: ago(20),
})
const PIC_ID = "00000000-0000-4000-8000-77b1000000a1"
const NOTES_ID = "00000000-0000-4000-8000-77b1000000a2"

async function onTaskPage(page: Page, testInfo: TestInfo, theme: "light" | "dark", touch: boolean) {
  const task = { task_uuid: TASK, task_name: "Draft launch email", task_status: "todo", task_priority: "medium", task_project: { project_uuid: BOARD_P, project_name: "Website relaunch", project_is_admin: true } }
  await openBoard(page, testInfo, theme, {
    ...TASK_PANEL_READS,
    [`/task/info/${TASK}`]: {
      msg: "ok",
      data: {
        ...task, task_label: "", task_due_date: "0001-01-01T00:00:00Z", task_start_date: "0001-01-01T00:00:00Z", task_created_at: "2026-10-01T09:00:00Z",
        task_deleted_at: "0001-01-01T00:00:00Z", task_assignee: SAM, task_created_by: SAM, task_description: "", task_sub_tasks: [], task_comments: [],
        task_activities: [], task_attachments: [picture(PIC_ID), notes(NOTES_ID)], task_collaborators: [], task_blocked_by: [], task_blocks: [],
        task_access: { edit: true, delete: true, comment: true, log_time: true, restrict: true },
      },
    },
    "/restriction": { msg: "ok", data: { task_uuid: TASK, restricted: false, people: [], can_change: true } },
    [`/project/getFile/${BOARD_P}/${PIC_ID}`]: { msg: "Got the url!", url: `data:image/png;base64,${PNG.toString("base64")}` },
    [`/project/getFile/${BOARD_P}/${NOTES_ID}`]: withStatus(500, { msg: "internal error" }),
  })
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const tile = page.getByRole("button", { name: "Whiteboard.png" }).first()
  if (touch) await tile.tap({ timeout: 60_000 })
  else await tile.click({ timeout: 60_000 })
}

type Box = { x: number; y: number; width: number; height: number }
const meets = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const boxOf = async (l: Locator) => (await l.boundingBox()) as Box
const span = (b: Box) => `x ${Math.round(b.x)}..${Math.round(b.x + b.width)} y ${Math.round(b.y)}..${Math.round(b.y + b.height)}`

/** The scale the picture is drawn at (react-zoom-pan-pinch's transform). */
const scaleOf = (page: Page) =>
  page.locator("[data-lightbox] .react-transform-component").first().evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)

const CONTROLS = ["Zoom in", "Zoom out", "Reset zoom"] as const

/** What a press at each zoom control's centre reaches. */
const reached = (page: Page) =>
  Promise.all(CONTROLS.map(async (name) => {
    const b = await boxOf(page.getByRole("button", { name, exact: true }))
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? document.elementFromPoint(x, y)?.className?.toString().slice(0, 40) ?? null, at)
  }))

async function press(page: Page, touch: boolean, name: string) {
  const b = await boxOf(page.getByRole("button", { name, exact: true }))
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2]
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

async function standsClear(page: Page, touch: boolean, theme: string) {
  const pill = page.getByRole("toolbar", { name: "Image zoom controls" })
  await expect(pill).toBeVisible({ timeout: 60_000 })
  const toast = page.locator(".toast-root[data-state='open']").filter({ hasText: /went wrong|couldn|error/i }).first()
  await expect(toast, "the read ahead's failure is told").toBeVisible({ timeout: 30_000 })
  // Settled: the toast's way in has ended (two reads alike).
  let last = ""
  await expect.poll(async () => { const now = JSON.stringify(await boxOf(toast)); const same = now === last; last = now; return same }, { intervals: [200] }).toBe(true)
  // Measured first: an error toast stays 6s.
  const [t, z] = [await boxOf(toast), await boxOf(pill)]
  const reach = await reached(page)
  await reviewShot(page, "lbtoast-lightbox-toast", theme)
  console.log(`LBTOAST ${page.viewportSize()?.width}x${page.viewportSize()?.height} ${theme}: toast ${span(t)}; zoom controls ${span(z)}; presses reach ${JSON.stringify(reach)}`)
  expect(meets(t, z), `the toast (${span(t)}) stands clear of the zoom controls (${span(z)})`).toBe(false)
  expect(reach, "a press at each zoom control's centre reaches that control").toEqual([...CONTROLS])
  // The presses themselves: Zoom in zooms in, Reset zoom puts it back, and the lightbox stays open.
  const before = await scaleOf(page)
  await press(page, touch, "Zoom in")
  // Settled (two reads alike): a Reset pressed mid-animation is overridden by the zoom's own end.
  let was = before
  await expect.poll(async () => { const now = await scaleOf(page); const settled = now > before + 0.01 && Math.abs(now - was) < 0.001; was = now; return settled }, { message: "Zoom in zoomed in", intervals: [150] }).toBe(true)
  await press(page, touch, "Reset zoom")
  await expect.poll(() => scaleOf(page), { message: "Reset zoom put it back" }).toBeLessThan(before + 0.01)
  await expect(page.locator("[data-lightbox]")).toBeVisible()
}

const SIZES = [
  { name: "a tablet in portrait, 768", use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } },
  { name: "an iPad Air in portrait, 820", use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
  { name: "a desktop, 1280 (guard)", use: { viewport: { width: 1280, height: 800 } } },
  { name: "a phone, 390 (guard)", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
]

for (const size of SIZES) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`a toast over the lightbox on ${size.name}, ${theme}`, () => {
      test.use(size.use)

      test("stands clear of the zoom controls, and each control takes its own press", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const touch = !!size.use.hasTouch
        await onTaskPage(page, testInfo, theme, touch)
        await standsClear(page, touch, theme)
      })
    })
  }
}
