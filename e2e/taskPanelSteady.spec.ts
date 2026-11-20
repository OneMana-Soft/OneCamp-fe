import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// fluid-18 step 3: opening a task paints its header and title first and
// everything under the title a frame later. Nothing under the title may paint
// before that frame: on a phone the description sits above the properties, so
// a status row drawn with the title was pushed down 274 px when the
// description came (a layout shift of 0.075). Chromium's layout-instability
// entries name every painted element that moved; after the title is first on
// screen they add up to at most 0.02 (the bar set 18 Nov), counting those that
// follow the press too: the press opened the task, it never asked for a jump.
// Opened by a press and by the task's URL, at 1280 and at 390 with touch. At
// 1280 the bar holds inside the panel; the page beside it is logged on its own.
// The title's top holds from its first frame. Motion is reduced, as the
// look's lab has it: an entrance slide is a transform, never a shift.

const P = "9e0a0000-0000-4000-8000-0000000000f8"
const NAMES = ["Plan the spring launch", "Fix sign-in on Safari", "Write the release notes", "Audit the CSV import"]
const id = (i: number) => `7a5c00f8-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const NONE = "0001-01-01T00:00:00Z"
const project = { project_uuid: P, project_name: "Launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const tasks = NAMES.map((name, i) => ({
  task_uuid: id(i),
  task_name: name,
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
  task_project: { project_uuid: P, project_name: "Launch" },
}))
const LIMIT = 0.02

function answers() {
  const t = tasks[0]
  return {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: tasks, project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    // As the API always sends it (business/Release ForTask): both lists, empty here.
    "/task/release/": { msg: "ok", data: { releases: [], options: [], can_edit: true, can_change_released: false } },
    [`/task/info/${t.task_uuid}`]: {
      msg: "ok",
      data: {
        ...t,
        // A description as tasks have them (a paragraph and a list): a phone draws it above the properties.
        task_description: "<p>Three weeks out: the page, the post and the film, who owns each, and the day each one ships. Nothing goes out before the numbers are checked.</p><ul><li><p>The launch page</p></li><li><p>The post</p></li><li><p>The film</p></li></ul>",
        task_project: { ...project },
        task_sub_tasks: [],
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
      },
      // What the API sends with the task (?include=, panelIncludes): the panel's parts, its project's statuses and fields
      // among them, so the status row can draw with the task's answer (as it did on bb52db4eb).
      included: {
        cycle: { data: null },
        recurrence: { data: null },
        client_review: { data: null },
        time_summary: { data: { entries: [], seconds: 0, billable_seconds: 0, running: null } },
        statuses: { data: null },
        fields: { data: { fields: [], can_edit: true } },
      },
    },
  }
}

/** A layout shift: when, its score, whether input came just before it, whether it moved anything inside the panel. */
type Shift = { t: number; v: number; recent: boolean; panel: boolean; src: string[] }
type Steady = { shifts: Shift[]; moves: Shift[]; title: number | null; tops: number[]; under: string[] }

/**
 * In every document: Chromium's own layout-shift entries (Layout Instability API, buffered, hadRecentInput kept: the press
 * opened the panel, it did not ask for a jump), and the moment the panel's title is first on screen; then, each frame for
 * 1.5 s, the title's top and every block of the panel (the body's blocks, the composer under it) that was on screen the
 * frame before and moved, scored as Chromium scores a shift (the area the moved blocks cover before and after, over the
 * viewport's, times the farthest move over the viewport's longer side): a cross-check, logged. Each frame is read after it
 * is drawn (a task queued from its animation frame), so a size the browser never drew is never read: the title's textarea
 * measured 517 px before it fit its text, a frame the browser never painted and never scored.
 */
function watch() {
  const w = window as unknown as { __steady: Steady }
  const s: Steady = (w.__steady = { shifts: [], moves: [], title: null, tops: [], under: [] })
  const inPanel = (n?: Node | null) => !!(n instanceof Element ? n : n?.parentElement)?.closest("[data-task-panel]")
  try {
    new PerformanceObserver((list) => {
      type Source = { node?: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }
      for (const e of list.getEntries() as unknown as { startTime: number; value: number; hadRecentInput: boolean; sources?: Source[] }[]) {
        const sources = e.sources ?? []
        s.shifts.push({
          t: e.startTime,
          v: e.value,
          recent: e.hadRecentInput,
          panel: sources.some((x) => inPanel(x.node)),
          src: sources.slice(0, 3).map((x) => `${x.node?.nodeName ?? "?"}${inPanel(x.node) ? "@panel" : ""} y${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)} h${Math.round(x.currentRect.height)}`),
        })
      }
    }).observe({ type: "layout-shift", buffered: true })
  } catch {}
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const clip = (r: DOMRect): Box => ({ x0: Math.max(0, r.left), y0: Math.max(0, r.top), x1: Math.min(innerWidth, r.right), y1: Math.min(innerHeight, r.bottom) })
  /** The area a set of boxes covers, overlaps counted once. */
  const union = (boxes: Box[]) => {
    const ys = [...new Set(boxes.flatMap((b) => [b.y0, b.y1]))].sort((a, b) => a - b)
    let area = 0
    for (let i = 0; i + 1 < ys.length; i++) {
      const xs = boxes.filter((b) => b.y0 <= ys[i] && b.y1 >= ys[i + 1]).map((b) => [b.x0, b.x1]).sort((a, b) => a[0] - b[0])
      let covered = 0
      let end = -Infinity
      for (const [a, b] of xs) {
        if (b <= end) continue
        covered += b - Math.max(a, end)
        end = b
      }
      area += covered * (ys[i + 1] - ys[i])
    }
    return area
  }
  let last = new Map<Element, DOMRect>()
  const read = () => {
    const ts = performance.now()
    const el = document.querySelector("[data-task-panel] [data-task-body] textarea, [data-task-panel] [data-task-body] p.text-title-2")
    // On screen: its text is there and it is inside the viewport (at 1280 the right panel opens 0 px wide, off the right edge,
    // and takes its width a few frames later; the title is in the document before anyone can see it).
    const box = el?.getBoundingClientRect()
    const seen = !!box && box.width > 0 && box.height > 0 && box.left < innerWidth && box.right > 0 && box.top < innerHeight && box.bottom > 0
    if (s.title === null && seen && (el instanceof HTMLTextAreaElement ? el.value : (el?.textContent ?? "")).trim()) s.title = ts
    const body = document.querySelector("[data-task-panel] [data-task-body]")
    if (s.title !== null && body) {
      if (el) s.tops.push(Math.round(el.getBoundingClientRect().top))
      const blocks = [...body.children]
      for (let n = body.parentElement?.nextElementSibling; n; n = n.nextElementSibling) blocks.push(n)
      const now = new Map(blocks.map((b) => [b, b.getBoundingClientRect()] as const))
      const moved = [...now].filter(([b, r]) => {
        const o = last.get(b)
        return o && o.height > 0 && o.bottom > 0 && o.top < innerHeight && (Math.abs(o.top - r.top) >= 1 || Math.abs(o.left - r.left) >= 1)
      })
      if (moved.length) {
        const boxes = moved.flatMap(([b, r]) => [clip(last.get(b)!), clip(r)]).filter((b) => b.x1 > b.x0 && b.y1 > b.y0)
        const far = Math.max(...moved.map(([b, r]) => Math.max(Math.abs(last.get(b)!.top - r.top), Math.abs(last.get(b)!.left - r.left))))
        const v = (union(boxes) / (innerWidth * innerHeight)) * Math.min(1, far / Math.max(innerWidth, innerHeight))
        s.moves.push({ t: ts, v, recent: false, panel: true, src: moved.slice(0, 3).map(([b, r]) => `${b.hasAttribute("data-task-properties") ? "props" : b.tagName} y${Math.round(last.get(b)!.top)}->${Math.round(r.top)} h${Math.round(r.height)}`) })
      }
      last = now
      // What the body draws, by frame (top and height of each block), while it changes: for the log.
      const said = [...body.children].map((c) => { const r = now.get(c)!; return `${c.hasAttribute("data-task-properties") ? "props" : c.tagName.toLowerCase()}@${Math.round(r.top)}h${Math.round(r.height)}` }).join(",")
      if (said !== s.under.at(-1)?.split(" ")[1]) s.under.push(`+${Math.round(ts - s.title)}ms ${said}`)
    }
  }
  const tick = () => {
    setTimeout(read, 0)
    if (s.title === null || performance.now() - s.title < 1500) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function openList(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.addInitScript(watch)
  await stubBackend(page, testInfo, answers())
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/** The task's own page by its URL, no press (a link, a reload). */
async function openTask(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.addInitScript(watch)
  await stubBackend(page, testInfo, answers())
  await page.goto(`/app/task/${tasks[0].task_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/**
 * Once the panel has settled, the layout-shift entries after the title was first on screen: all of them, those with input
 * just before (the press), those that moved something inside the panel; the blocks' cross-check; the title's tops. Logged
 * as one STEADY line per open (the numbers the look and the REQ report).
 */
async function shiftsAfterTitle(page: Page, how: string) {
  const panel = page.locator("[data-task-panel]")
  await expect(panel.locator("[data-task-body]").getByText(NAMES[0]).or(panel.locator("[data-task-body] textarea")).first()).toBeVisible({ timeout: 20_000 })
  // Settled: the status row and the description are there.
  await expect(panel.locator('[data-property="status"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(panel.getByText("Three weeks out").first()).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  const s = await page.evaluate(() => (window as unknown as { __steady: Steady }).__steady)
  expect(s.title, "the title on screen").not.toBeNull()
  const after = s.shifts.filter((x) => x.t > s.title!)
  const say = (xs: Shift[]) => xs.map((x) => `+${Math.round(x.t - s.title!)}ms v${x.v.toFixed(4)}${x.recent ? " recent" : ""} ${x.src.join(" | ")}`).join("; ") || "none"
  const sum = (xs: Shift[]) => +xs.reduce((a, x) => a + x.v, 0).toFixed(4)
  const r = { entries: sum(after), recent: sum(after.filter((x) => x.recent)), panel: sum(after.filter((x) => x.panel)), blocks: sum(s.moves), tops: [...new Set(s.tops)] }
  // Every shift, timed from the title's first frame on screen, for the log.
  const at = `${page.viewportSize()?.width} ${how}`
  console.log(`BODY ${at} ${s.under.slice(0, 5).join(" ; ")}`)
  // And the half second up to that frame (the frame the panel opens in, at 1280), on its own: not after the title, still seen.
  const open = s.shifts.filter((x) => x.t <= s.title! && x.t > s.title! - 500)
  console.log(`STEADY ${at} entries ${r.entries} recent ${r.recent} panel ${r.panel} blocks ${r.blocks} open ${sum(open)} tops ${JSON.stringify(r.tops)} | entries ${say(after)} | open ${say(open)} | blocks ${say(s.moves)}`)
  return { ...r, said: say(after) }
}

test.describe("opening a task: nothing painted under the title moves when the rest comes", () => {
  test.describe("at 1280", () => {
    test.use({ viewport: { width: 1280, height: 800 }, contextOptions: { reducedMotion: "reduce" } })
    test("pressed in the list: the task panel", async ({ page }, testInfo) => {
      await openList(page, testInfo)
      await expect(page.getByText(NAMES[0], { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(1000)
      await page.getByText(NAMES[0], { exact: true }).first().click()
      const r = await shiftsAfterTitle(page, "press")
      expect(r.panel, `layout shift inside the panel after the title (page ${r.entries}; at most ${LIMIT}): ${r.said}`).toBeLessThanOrEqual(LIMIT)
      expect(r.tops, "the title's top, each frame from its first").toHaveLength(1)
    })
    test("opened by its URL: the task page", async ({ page }, testInfo) => {
      await openTask(page, testInfo)
      const r = await shiftsAfterTitle(page, "url")
      expect(r.panel, `layout shift inside the panel after the title (page ${r.entries}; at most ${LIMIT}): ${r.said}`).toBeLessThanOrEqual(LIMIT)
      expect(r.tops, "the title's top, each frame from its first").toHaveLength(1)
    })
  })

  test.describe("at 390 with touch", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, contextOptions: { reducedMotion: "reduce" } })
    test("tapped in the list: the task page", async ({ page }, testInfo) => {
      await openList(page, testInfo)
      const row = page.locator(`[data-task-id="${tasks[0].task_uuid}"][data-phone-task-row]`)
      await expect(row).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(1000)
      await row.getByText(NAMES[0]).tap()
      await page.waitForURL(new RegExp(`/app/task/${tasks[0].task_uuid}`), { timeout: 30_000 })
      const r = await shiftsAfterTitle(page, "press")
      expect(r.entries, `layout shift after the title (at most ${LIMIT}): ${r.said}`).toBeLessThanOrEqual(LIMIT)
      expect(r.tops, "the title's top, each frame from its first").toHaveLength(1)
    })
    test("opened by its URL: the task page", async ({ page }, testInfo) => {
      await openTask(page, testInfo)
      const r = await shiftsAfterTitle(page, "url")
      expect(r.entries, `layout shift after the title (at most ${LIMIT}): ${r.said}`).toBeLessThanOrEqual(LIMIT)
      expect(r.tops, "the title's top, each frame from its first").toHaveLength(1)
    })
  })
})
