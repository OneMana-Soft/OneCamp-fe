import { expect, test, type Page, type TestInfo, type WebSocketRoute } from "@playwright/test"

import { brokerFor } from "../scripts/fluidity/fakeBroker.mjs"
import { SAM, SHOT_THEMES, appOrigin, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { openKeyboard, paintKeyboard } from "./keyboard"

// The Offline Store (projects P7-1, lib/offline). A task changed while the
// network is gone keeps the change on screen and on the device, and is sent
// when the network is back, after a reload too. Its permission model: a
// change waiting is sent as the member, through the same route and checks; a
// member who lost the task meanwhile (a 403) has nothing sent, and the task
// leaves the device. A teammate's change to the same field is never written
// over without the member choosing.

const P = "7b0c9a52-3d1e-4f6a-9b8c-2d3e4f5a6b7c"
const T = "00000000-0000-4000-8000-0000000000a1"
const NONE = "0001-01-01T00:00:00Z"
const CH = "c0ffee00-0000-4000-8000-0000000000e5"
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: true }

function taskInfo(status: string) {
  return {
    msg: "ok",
    data: {
      task_uuid: T,
      task_name: "Draft launch email",
      task_status: status,
      task_priority: "medium",
      task_label: "",
      task_due_date: NONE,
      task_start_date: NONE,
      task_created_at: "2026-10-01T09:00:00Z",
      task_deleted_at: NONE,
      task_sub_task_count: 0,
      task_comment_count: 0,
      task_assignee: SAM,
      task_project: project,
      task_description: "",
      task_sub_tasks: [],
      task_comments: [],
      task_activities: [],
      task_attachments: [],
      task_blocked_by: [],
      task_blocks: [],
    },
  }
}

/** The server as the test sets it: up or not, the task's status, and whether the member may still see it. */
interface Server {
  up: boolean
  status: string
  lost: boolean
  writes: { body: Record<string, unknown>; key: string | undefined }[]
  /** The server answers writes with a 500 (it keeps failing them), counted in fails. */
  broken?: boolean
  fails?: number
}

async function openTask(page: Page, testInfo: TestInfo, server: Server, theme = "light") {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  const down = () => withStatus(0, {})
  await stubBackend(page, testInfo, {
    "/task/info/": () => (!server.up ? down() : server.lost ? withStatus(403, { msg: "You can't see this task" }) : taskInfo(server.status)),
    "/task/updateTaskStatus": (_url: URL, request: { postDataJSON(): Record<string, unknown>; headers(): Record<string, string> }) => {
      if (!server.up) return down()
      if (server.lost) return withStatus(403, { msg: "You can't see this task" })
      if (server.broken) {
        server.fails = (server.fails ?? 0) + 1
        return withStatus(500, { msg: "Something went wrong" })
      }
      const body = request.postDataJSON()
      server.writes.push({ body, key: request.headers()["idempotency-key"] })
      server.status = String(body.task_status)
      return { msg: "ok", data: {} }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: { ...project, project_members: [SAM] } },
    "/notices": { msg: "ok", data: { notices: [] } },
    // The task panel's other reads, answered empty, so no "Not in this test" toast lands in a shot.
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    // A channel to go to while a change waits.
    "/ch/channelBasicInfo": {
      msg: "ok",
      channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_member: true, ch_is_admin: false, ch_deleted_at: NONE, ch_member_count: 3 },
    },
  })
  await page.goto(`/app/task/${T}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-panel]")).toBeVisible({ timeout: 60_000 })
  // The store opens after the page, for the member signed in.
  await expect.poll(() => kept(page), { timeout: 30_000 }).toMatchObject({ member: SAM.user_uuid, task: true })
}

/** What the device keeps: its owner, the changes waiting, whether the task is kept, and its own read (a list's row of it keeps the task, not the read). */
function kept(page: Page) {
  return page.evaluate(
    (task) =>
      new Promise<{ member?: string; waiting: { field?: string; value?: unknown; state: string }[]; task: boolean; read: boolean }>((resolve) => {
        // Opened only if the app made it: an open that would create it is called off,
        // so the test never makes an empty database before the app's own.
        const open = indexedDB.open("onecamp-offline")
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve({ waiting: [], task: false, read: false })
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains("meta")) {
            db.close()
            resolve({ waiting: [], task: false, read: false })
            return
          }
          const tx = db.transaction(["meta", "outbox", "records", "reads"], "readonly")
          const member = tx.objectStore("meta").get("member")
          const outbox = tx.objectStore("outbox").getAll()
          const record = tx.objectStore("records").get(["task", task])
          const read = tx.objectStore("reads").get(`/task/info/${task}`)
          tx.oncomplete = () => {
            db.close()
            resolve({ member: member.result, waiting: outbox.result, task: !!record.result, read: !!read.result })
          }
        }
      }),
    T,
  )
}

const complete = (page: Page) => page.getByRole("button", { name: "Mark task as complete" })
const completed = (page: Page) => page.getByRole("button", { name: "Task completed" })
const online = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("online")))

/**
 * On a phone the pill sits above the screen's composer, never over it (DESIGN-BUILD-21 M1): its foot is at or
 * above the composer's top, and a tap on the composer's words reaches the composer. All of it is read in ONE frame,
 * once the composer is at rest (the same top two frames running): a sheet's composer rises with the sheet for
 * 420 ms, and the pill follows the composer's place a frame after it moves, so reads apart, or during the rise,
 * could see the composer moved and the pill or the tap not yet (a12fix3, 29 Oct: the tap was read on a box from a
 * frame before). A pill that stays over the composer, or anything that stays over its words, still fails.
 */
async function pillClearsComposer(page: Page, composer: string) {
  const read = () =>
    page.evaluate(
      (sel) =>
        new Promise<{ atRest: boolean; pillAbove: boolean; reached: boolean }>((resolve) => {
          const before = document.querySelector(sel)?.getBoundingClientRect().top
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const box = document.querySelector(sel)?.getBoundingClientRect()
              const pill = document.querySelector("[data-connection-pill]")?.getBoundingClientRect()
              resolve({
                atRest: !!box && box.top === before,
                pillAbove: !!box && !!pill && pill.bottom <= box.top,
                reached: !!box && !!document.elementFromPoint(box.x + 40, box.y + 32)?.closest(sel),
              })
            }),
          )
        }),
      composer,
    )
  await expect
    .poll(read, { message: "at rest, the pill's foot is above the composer's top, and a tap on its words reaches it", timeout: 5_000 })
    .toEqual({ atRest: true, pillAbove: true, reached: true })
}

/**
 * The sidebar's pill says all of it (DESIGN-BUILD-21 M3): nothing in it runs past its box (a summary of what's off
 * wraps, never cuts), and it sits whole above the account row.
 */
async function expectPillWhole(page: Page) {
  const pill = page.locator("[data-connection-pill]")
  const cut = await pill.evaluate((el) =>
    [el, ...el.querySelectorAll<HTMLElement>("*:not(.sr-only)")].filter((n) => n.scrollWidth > n.clientWidth).map((n) => n.outerHTML.slice(0, 90)),
  )
  expect(cut, "nothing in the pill runs past its box").toEqual([])
  const box = (await pill.boundingBox())!
  const foot = (await page.locator("[data-sidebar-foot]").boundingBox())!
  expect(box.y + box.height, "the pill sits above the account row").toBeLessThanOrEqual(foot.y)
}

/** Changes for other tasks, written beside the device's own kept change (its copy), up to `total` in all. */
async function keepChanges(page: Page, total: number) {
  await page.evaluate(
    (total) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("onecamp-offline")
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction("outbox", "readwrite")
          const box = tx.objectStore("outbox")
          const all = box.getAll()
          all.onsuccess = () => {
            // A copy without its key: the store numbers each one it adds.
            const model = { ...all.result[0] }
            delete model.seq
            for (let i = all.result.length; i < total; i++) box.add({ ...model, opKey: `kept-${i}`, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    total,
  )
}

// Made with no network (P7-1c): the board's project, as one its admin opens it,
// and the ids the server makes what was made offline under.
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const MADE = { task: "7a5c00c5-0000-4000-8000-00000000c0de", sub: "7a5c00c5-0000-4000-8000-00000000c0df", comment: "7a5c00c5-0000-4000-8000-00000000c0e0" }
// The board's project estimates in points (linear-05): its scale, as its own read and a task's page (the page's
// project_meta part) answer it. The device holds it once a task's page in the project was read there.
const FIB = { kind: "fibonacci", extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }
const SCALE = { data: { scale: FIB, kinds: [], can_edit: true } }
const POINTS = "/task/updateTaskPoints"
/** What says a failure: none of it shows for what was made offline (DESIGN-BUILD-30 M1, M2). */
const FAILURE_WORDS = /Not found|still waiting to be sent|Couldn't load|Couldn't (save|do) that/

/** The server for what's made: up or not, what it made (route, body, Idempotency-Key), and any request naming a device's id. */
interface Maker {
  up: boolean
  made: { path: string; body: Record<string, unknown>; key: string | undefined }[]
  leaked: string[]
  /** The key the board's task carries where a leg gives it one (projects A8K): its page's links read /app/task/<key>. */
  taskKey?: string
}

const card = (page: Page, name: string) => page.locator("[data-board] [data-task-id]").filter({ hasText: name })
/** A task's row in the project's list: a link to its page. */
const row = (page: Page, name: string) => page.getByRole("link", { name: new RegExp(name) })

/**
 * The task panel's code coming to the device (its chunk draws [data-task-panel]), with the parts it fetches once in
 * (warmTaskParts), to wait on before the network goes: on a phone, the panel's preload fetches it after a first
 * press. The parts are in once no chunk has been on its way for a second. It gives up quietly after 30 s, so a build
 * with no such preload (the red) goes on to fail where a phone failed: at the task's opening.
 */
const panelCode = (page: Page) => {
  const chunk = (r: { url(): string }) => /\/_next\/static\/.*\.js(\?|$)/.test(r.url())
  let coming = 0
  let last = Date.now()
  page.on("request", (r) => void (chunk(r) && (coming++, (last = Date.now()))))
  const came = (r: { url(): string }) => void (chunk(r) && (coming--, (last = Date.now())))
  page.on("requestfinished", came)
  page.on("requestfailed", came)
  return page
    .waitForResponse(async (r) => chunk(r) && (await r.text().catch(() => "")).includes('"data-task-panel":""'), { timeout: 30_000 })
    .then(async () => {
      for (const end = Date.now() + 30_000; Date.now() < end && (coming > 0 || Date.now() - last < 1_000); ) await page.waitForTimeout(100)
    })
    .catch(() => null)
}

/** The board's project as the device keeps it (lib/offline/tasks projectsIn): its access, and its scale once read. */
function keptProject(page: Page) {
  return page.evaluate(
    (id) =>
      new Promise<Record<string, unknown> | undefined>((resolve) => {
        const open = indexedDB.open("onecamp-offline")
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve(undefined)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains("records")) {
            db.close()
            resolve(undefined)
            return
          }
          const get = db.transaction("records", "readonly").objectStore("records").get(["project", id])
          get.onsuccess = () => {
            db.close()
            resolve(get.result?.value)
          }
          get.onerror = () => {
            db.close()
            resolve(undefined)
          }
        }
      }),
    P,
  )
}

/** Forget what the member may do in the project, as a device that never kept it (CR-81 MF3): its other fields stay. */
function forgetKeptAccess(page: Page) {
  return page.evaluate(
    (id) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("onecamp-offline")
        open.onerror = () => resolve(false)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction("records", "readwrite")
          const records = tx.objectStore("records")
          const get = records.get(["project", id])
          get.onsuccess = () => {
            const kept = get.result
            if (kept?.value) {
              for (const k of ["project_access", "project_is_admin", "project_is_member"]) delete kept.value[k]
              records.put(kept)
            }
          }
          tx.oncomplete = () => {
            db.close()
            resolve(true)
          }
          tx.onerror = () => {
            db.close()
            resolve(false)
          }
        }
      }),
    P,
  )
}

async function openBoard(page: Page, testInfo: TestInfo, server: Maker, theme: string, tab: "kanban" | "list" = "kanban") {
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBoard(page, testInfo, server)
  // The header's forecast chip reads once its code comes; answered before any leg cuts the network, so a cut never
  // fails it (on a loaded machine its read came after the cut, and its retry words met FAILURE_WORDS).
  const forecast = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/project/${P}/forecast`), { timeout: 60_000 })
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab === "kanban" ? card(page, "Draft launch email") : row(page, "Draft launch email")).toBeVisible({ timeout: 60_000 })
  await forecast
  // The store opens after the page, for the member signed in.
  await expect.poll(() => kept(page), { timeout: 30_000 }).toMatchObject({ member: SAM.user_uuid })
}

/** The server for the board's project, on any page of the test's: what it makes, what leaks, and no network when it's down. */
async function stubBoard(page: Page, testInfo: TestInfo, server: Maker) {
  const app = appOrigin(testInfo)
  page.on("request", (r) => {
    // What leaves the app's origin is a call to the server. The app's own route for a task made
    // here (/app/task/offline-…, the page a phone opens for it) carries no data and isn't one.
    if (new URL(r.url()).origin === app.origin) return
    if (/offline-/.test(`${r.url()} ${r.postData() ?? ""}`)) server.leaked.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  const board = { ...project, project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  const draft = { ...taskInfo("todo").data, ...(server.taskKey ? { task_key: server.taskKey } : {}) }
  const made = (answer: () => unknown) => (url: URL, request: { postDataJSON(): Record<string, unknown>; headers(): Record<string, string> }) => {
    server.made.push({ path: url.pathname, body: request.postDataJSON(), key: request.headers()["idempotency-key"] })
    return answer()
  }
  const madeTask = {
    ...draft,
    task_uuid: MADE.task,
    task_name: "Book the venue",
    task_comments: [{ comment_uuid: MADE.comment, comment_text: "Bring the badges", comment_by: SAM, comment_created_at: "2026-10-28T23:30:00Z" }],
    task_sub_tasks: [{ ...draft, task_uuid: MADE.sub, task_name: "Print the badges" }],
  }
  // The made task's points, as the last points write the server took set them.
  const pointsMade = () => server.made.filter((m) => m.path === POINTS).pop()?.body.task_estimate_points
  await stubBackend(page, testInfo, {
    // The list's page of the same tasks, as the server pages it.
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...board, project_task_count: 1, project_tasks: [{ ...draft, task_project: board }] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: () => ({
      msg: "ok",
      data: {
        ...board,
        project_tasks_backlog: [],
        project_tasks_todo: server.made.some((m) => m.path === "/task/createTask") ? [madeTask, draft] : [draft],
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 1, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
      },
    }),
    // A task's page comes with its project's scale (?include=…project_meta), as the server's does.
    "/task/info/": (url: URL) =>
      url.pathname.endsWith(MADE.task)
        ? { msg: "ok", data: { ...madeTask, task_estimate_points: pointsMade() }, included: { estimates: SCALE } }
        : { msg: "ok", data: draft, included: { estimates: SCALE } },
    [`/project/${P}/estimates`]: { msg: "ok", ...SCALE },
    [POINTS]: made(() => ({ msg: "ok", data: {} })),
    "/task/createTask": made(() => ({ msg: "Created task!", data: { task_uuid: MADE.task } })),
    "/task/createCommentTask": made(() => ({ msg: "Created comment!", data: { comment_id: MADE.comment, comment_created_at: "2026-10-28T23:30:00Z" } })),
    "/task/createSubTask": made(() => ({ msg: "Subtask added", data: madeTask.task_sub_tasks[0] })),
    [`/project/info/${P}`]: { msg: "ok", data: board },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: board },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    // Nothing to forecast yet: the header's chip says nothing.
    [`/project/${P}/forecast`]: {
      msg: "ok",
      data: { project_uuid: P, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, open: 1, unit: "tasks", per_week: 0, weeks: 0, held_by: [], held_count: 0 },
    },
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: { notices: [] } },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: project.project_name }, topic: `project/${P}` }] },
    // The task panel's other reads, answered empty.
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  })
  // No network while the test says so: every call to the API fails as an unplugged one does.
  await page.route((url) => url.origin !== app.origin && !server.up, (route) => route.abort("internetdisconnected"))
}

test.describe("on a phone, by touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a task completed offline stays complete, waits on the device, and is sent after a reload", async ({ page }, testInfo) => {
    const server: Server = { up: true, status: "todo", lost: false, writes: [] }
    await openTask(page, testInfo, server)
    expect((await kept(page)).task).toBe(true)

    server.up = false
    await complete(page).tap()
    await expect(completed(page)).toBeVisible()
    await expect.poll(async () => (await kept(page)).waiting.map((o) => [o.field, o.value])).toEqual([["task_status", "done"]])
    // Nothing reached the server, and nothing says it wasn't saved.
    expect(server.writes).toEqual([])
    await expect(page.getByText("Your change wasn't saved")).toHaveCount(0)

    // Back, with the tab reloaded: the change is sent once, as the member, with its key.
    server.up = true
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect.poll(() => server.writes.length, { timeout: 30_000 }).toBe(1)
    expect(server.writes[0].body).toMatchObject({ task_uuid: T, task_status: "done" })
    expect(server.writes[0].key).toBeTruthy()
    await expect.poll(async () => (await kept(page)).waiting).toEqual([])
    await expect(completed(page)).toBeVisible()
  })

  test("a change waiting keeps its pill above the task's composer, and a channel's", async ({ page }, testInfo) => {
    const server: Server = { up: true, status: "todo", lost: false, writes: [] }
    await openTask(page, testInfo, server)
    server.up = false
    await complete(page).tap()
    await expect(page.locator("[data-connection-pill]")).toContainText("1 change waiting", { timeout: 15_000 })
    await pillClearsComposer(page, "[data-task-comment-box]")

    await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-composer-sheet]")).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("[data-connection-pill]")).toBeVisible({ timeout: 30_000 })
    await pillClearsComposer(page, "[data-composer-sheet]")
    await reviewShot(page, "offline-waiting-channel", "light")
  })

  test("a member who lost the task while offline has nothing sent, and the task leaves the device", async ({ page }, testInfo) => {
    const server: Server = { up: true, status: "todo", lost: false, writes: [] }
    await openTask(page, testInfo, server)

    server.up = false
    await complete(page).tap()
    await expect.poll(async () => (await kept(page)).waiting.length).toBe(1)

    // An admin takes them off the project while they are away.
    server.lost = true
    server.up = true
    await online(page)
    await expect.poll(async () => (await kept(page)).waiting, { timeout: 30_000 }).toEqual([])
    expect((await kept(page)).task).toBe(false)
    expect(server.writes).toEqual([])
    // The toast (and its copy for screen readers).
    await expect(page.getByText("You no longer have access to “Draft launch email”.").first()).toBeVisible()
  })
})

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
  ] as const) {
    test.describe(`${where}, ${theme}`, () => {
      test.use(use)

      test("a teammate's change to the same field waits for the member: Keep mine sends theirs over, once", async ({ page }, testInfo) => {
        const server: Server = { up: true, status: "todo", lost: false, writes: [] }
        await openTask(page, testInfo, server, theme)
        const press = (name: string) => (use.viewport.width < 500 ? page.getByRole("button", { name }).tap() : page.getByRole("button", { name }).click())

        server.up = false
        await press("Mark task as complete")
        await expect.poll(async () => (await kept(page)).waiting.length).toBe(1)
        // A change kept on the device always says so (DESIGN-BUILD-21 M2), before
        // the server counts as unreachable too.
        await expect(page.locator("[data-connection-pill]")).toContainText("1 change waiting", { timeout: 15_000 })
        await reviewShot(page, "offline-waiting", theme)
        // Really offline: the browser says so, and the change waits on the device.
        await page.context().setOffline(true)
        await expect(page.locator("[data-connection-pill=offline]")).toContainText("You're offline · 1 change waiting")
        await reviewShot(page, "offline-real", theme)
        await page.context().setOffline(false)

        // A teammate moved it to In review meanwhile.
        server.status = "inReview"
        server.up = true
        await online(page)
        const pill = page.locator("[data-connection-pill=review]")
        await expect(pill).toContainText("1 change needs you", { timeout: 30_000 })
        expect(server.writes).toEqual([])
        if (use.viewport.width < 500) await pillClearsComposer(page, "[data-task-comment-box]")
        await reviewShot(page, "offline-review-pill", theme)

        await pill.getByRole("button", { name: "Review" }).click()
        await expect(page.getByText("A change needs you")).toBeVisible()
        await reviewShot(page, "offline-conflict", theme)
        await press("Keep mine")
        await expect.poll(() => server.writes.length, { timeout: 30_000 }).toBe(1)
        expect(server.writes[0].body).toMatchObject({ task_status: "done" })
        await expect.poll(async () => (await kept(page)).waiting).toEqual([])
      })

      test("a change the server keeps failing is set aside for the member: Retry or Discard", async ({ page }, testInfo) => {
        const server: Server = { up: true, status: "todo", lost: false, writes: [] }
        await openTask(page, testInfo, server, theme)
        const press = (name: string) => (use.viewport.width < 500 ? page.getByRole("button", { name }).tap() : page.getByRole("button", { name }).click())
        server.up = false
        await press("Mark task as complete")
        await expect.poll(async () => (await kept(page)).waiting.length).toBe(1)
        // Back, but failing every write: each pass is a try, and Retry asks for the next one.
        server.up = true
        server.broken = true
        await online(page)
        const review = page.locator("[data-connection-pill=review]")
        for (let i = 0; i < 12 && !(await review.isVisible()); i++) {
          const retry = page.locator("[data-connection-pill]").getByRole("button", { name: "Retry" })
          if (await retry.isVisible()) await retry.click()
          await page.waitForTimeout(800)
        }
        await expect(review).toContainText("1 change needs you", { timeout: 30_000 })
        expect(server.writes).toEqual([])
        await review.getByRole("button", { name: "Review" }).click()
        const row = page.locator("[data-offline-failed]")
        await expect(row).toBeVisible()
        await expect(row.getByRole("button", { name: "Retry" })).toBeVisible()
        await expect(row.getByRole("button", { name: "Discard" })).toBeVisible()
        await reviewShot(page, "offline-failed", theme)
      })

      test("a task added on the board, a comment on it and a sub-task under it, made with no network, show at once and are made in order under the server's id", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const phone = use.viewport.width < 500
        const server: Maker = { up: true, made: [], leaked: [] }
        await openBoard(page, testInfo, server, theme)
        const press = (l: ReturnType<Page["locator"]>) => (phone ? l.tap() : l.click())
        if (!phone) {
          // The panel's code comes once, before the network goes: keeping the
          // app's own code on the device is the service worker's (P7-2).
          await press(card(page, "Draft launch email"))
          await expect(page.locator("[data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await page.keyboard.press("Escape")
        }
        // The device keeps what the member may do in the project from the board's
        // answer, and a task made here offers that (asana-12). It's kept before the
        // network goes, as the Points tests wait for it: on a phone nothing else
        // waits, and a run on a busy machine went offline first.
        await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()

        server.up = false
        const todo = page.locator('[data-board] [data-column="todo"]')
        // The column's own "New task" (its head's, or its foot's): either opens the name field.
        await press(todo.getByRole("button", { name: "New task" }).first())
        const name = todo.getByRole("textbox", { name: "New task name" })
        await name.fill("Book the venue")
        await name.press("Enter")
        // On the board at once, in the column it was added in.
        await expect(todo.locator("[data-task-id]").filter({ hasText: "Book the venue" })).toBeVisible({ timeout: 15_000 })
        await reviewShot(page, "offline-made-card", theme)

        // Its page is the device's: the server has nothing under its id yet.
        await press(card(page, "Book the venue"))
        if (phone) await page.waitForURL(/\/app\/task\/offline-/, { timeout: 30_000 })
        const panel = page.locator("[data-task-panel]")
        await expect(panel.getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
        const editor = page.locator("[data-task-comment-box] [contenteditable=true]")
        await press(editor)
        await editor.pressSequentially("Bring the badges")
        await press(page.locator("[data-task-comment-box]").getByRole("button", { name: "Send" }))
        await expect(panel.getByText("Bring the badges").first()).toBeVisible({ timeout: 15_000 })
        // Seconds after its page opened: no read the device answered said a failure (DESIGN-BUILD-30 M1, M2).
        await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        await press(panel.getByRole("button", { name: "Add subtask" }))
        const sub = panel.getByRole("textbox", { name: "New subtask" })
        await sub.fill("Print the badges")
        await sub.press("Enter")
        await expect(panel.getByText("Print the badges").first()).toBeVisible({ timeout: 15_000 })
        // Nothing reached the network, nothing was refused, and all three wait on the device.
        expect(server.made).toEqual([])
        expect(server.leaked).toEqual([])
        await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        await expect.poll(async () => (await kept(page)).waiting.map((w) => (w as { url?: string }).url)).toEqual([
          "/task/createTask",
          "/task/createCommentTask",
          "/task/createSubTask",
        ])
        await reviewShot(page, "offline-made-task", theme)
        // The comment made offline, waiting under its task (DESIGN-BUILD-30's owed shot).
        await panel.getByText("Bring the badges").first().scrollIntoViewIfNeeded()
        await reviewShot(page, "offline-made-comment", theme)

        // Back: the task is made first, then what hangs off it, under the server's id, once each.
        server.up = true
        await online(page)
        await expect.poll(() => server.made.map((m) => m.path), { timeout: 60_000 }).toEqual(["/task/createTask", "/task/createCommentTask", "/task/createSubTask"])
        expect(server.made[0].body).toMatchObject({ task_name: "Book the venue", task_project_uuid: P, task_status: "todo" })
        expect(server.made[1].body).toMatchObject({ task_uuid: MADE.task })
        expect(server.made[2].body).toMatchObject({ task_uuid: MADE.task, task_name: "Print the badges" })
        expect(new Set(server.made.map((m) => m.key)).size).toBe(3)
        await expect.poll(async () => (await kept(page)).waiting, { timeout: 30_000 }).toEqual([])
        // The page still open on the device's id goes on under the server's.
        await expect(panel.getByText("Bring the badges").first()).toBeVisible()
        await expect(panel.getByText("Print the badges").first()).toBeVisible()
        // Once each: the comment made offline took the server's id, so its copy lands on it.
        await expect(panel.getByText("Bring the badges")).toHaveCount(1)
        // On a laptop the board is beside it: the card is the server's now.
        if (!phone) await expect(card(page, "Book the venue")).toHaveAttribute("data-task-id", MADE.task, { timeout: 30_000 })
        expect(server.leaked).toEqual([])
        await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        await reviewShot(page, "offline-made-sent", theme)
        await panel.getByText("Bring the badges").first().scrollIntoViewIfNeeded()
        await reviewShot(page, "offline-made-comment-sent", theme)
      })

      // asana-12 (a), main 29 Oct: with the WHOLE network gone (the browser offline, not only the server), a phone
      // opens a task over the page, in its sheet, as a laptop opens it in its panel, and nothing moves. The app has no
      // app-shell service worker yet (V-81), so a move to a task's page showed the browser's own offline page, and a
      // task made offline couldn't be opened at all.
      if (use.viewport.width < 500) {
        // V-100 (main 30 Oct): the live walk at 390 found the sheet's code had never come, so an offline phone that
        // hadn't opened a task while online couldn't open one ("Couldn't load the task"). COLD: a fresh context, no
        // press before the network goes, no wait for the panel's code. The shared offline layer says when what it
        // promises is on the device (html[data-offline-ready="warm"]); the network goes once it says so, or 4 s after
        // the board's project is kept (as a phone on the move loses it), and every press comes after. A preload that
        // waits for a first press, or for 5 s, has fetched nothing by then.
        test("cold, with the whole network gone, a task added on the board opens in the sheet: its code came while the phone was online", async ({ page }, testInfo) => {
          test.setTimeout(240_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          const missed: string[] = []
          page.on("requestfailed", (r) => void (/\/_next\/static\//.test(r.url()) && missed.push(new URL(r.url()).pathname)))
          await openBoard(page, testInfo, server, theme)
          await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()
          const said = await page
            .locator('html[data-offline-ready="warm"]')
            .waitFor({ state: "attached", timeout: 4_000 })
            .then(() => true, () => false)
          await page.context().setOffline(true)
          server.up = false
          const todo = page.locator('[data-board] [data-column="todo"]')
          await todo.getByRole("button", { name: "New task" }).first().tap()
          const name = todo.getByRole("textbox", { name: "New task name" })
          await name.fill("Book the venue")
          await name.press("Enter")
          await expect(todo.locator("[data-task-id]").filter({ hasText: "Book the venue" })).toBeVisible({ timeout: 15_000 })
          await card(page, "Book the venue").tap()
          const sheet = page.getByRole("dialog", { name: "Task" })
          await expect(sheet).toBeVisible({ timeout: 15_000 })
          await expect(page.getByText("Couldn't load the task")).toHaveCount(0)
          await expect(sheet.locator("[data-task-panel]").getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          expect(missed, "code the phone needed offline that never came while it was online").toEqual([])
          expect(said, "the offline layer never said its code was on the device").toBe(true)
          await reviewShot(page, "offline-cold-sheet", theme)
        })

        test("with the whole network gone, a task added on the board opens in the page's sheet: a comment, a sub-task, then all sent in order", async ({ page }, testInfo) => {
          test.setTimeout(240_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme)
          await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()
          const todo = page.locator('[data-board] [data-column="todo"]')
          // The first press starts the preload: the panel's code is on the device before the network goes.
          await todo.getByRole("button", { name: "New task" }).first().tap()
          await code
          await page.context().setOffline(true)
          server.up = false
          const name = todo.getByRole("textbox", { name: "New task name" })
          await name.fill("Book the venue")
          await name.press("Enter")
          await expect(todo.locator("[data-task-id]").filter({ hasText: "Book the venue" })).toBeVisible({ timeout: 15_000 })
          const board = page.url()
          await card(page, "Book the venue").tap()
          // The sheet, over the board, which didn't move.
          const sheet = page.getByRole("dialog", { name: "Task" })
          await expect(sheet).toBeVisible({ timeout: 15_000 })
          expect(page.url()).toBe(board)
          const panel = sheet.locator("[data-task-panel]")
          await expect(panel.getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          // The sheet covers the tab bar: the pill sits above the sheet's comment box, as on the task's page.
          await expect(page.locator("[data-connection-pill]")).toBeVisible({ timeout: 15_000 })
          await pillClearsComposer(page, "[data-right-panel-sheet] [data-task-comment-box]")
          await reviewShot(page, "offline-sheet-empty", theme)
          const editor = sheet.locator("[data-task-comment-box] [contenteditable=true]")
          await editor.tap()
          await editor.pressSequentially("Bring the badges")
          await reviewShot(page, "offline-sheet-composer", theme)
          await sheet.locator("[data-task-comment-box]").getByRole("button", { name: "Send" }).tap()
          await expect(panel.getByText("Bring the badges").first()).toBeVisible({ timeout: 15_000 })
          await panel.getByRole("button", { name: "Add subtask" }).tap()
          const sub = panel.getByRole("textbox", { name: "New subtask" })
          await sub.fill("Print the badges")
          await sub.press("Enter")
          await expect(panel.getByText("Print the badges").first()).toBeVisible({ timeout: 15_000 })
          expect(page.url()).toBe(board)
          expect(server.made).toEqual([])
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          await expect.poll(async () => (await kept(page)).waiting.map((w) => (w as { url?: string }).url)).toEqual([
            "/task/createTask",
            "/task/createCommentTask",
            "/task/createSubTask",
          ])
          await reviewShot(page, "offline-sheet-task", theme)

          // Back: the three are made in order under the server's id, once each, and the sheet goes on under it.
          await page.context().setOffline(false)
          server.up = true
          await online(page)
          await expect.poll(() => server.made.map((m) => m.path), { timeout: 60_000 }).toEqual(["/task/createTask", "/task/createCommentTask", "/task/createSubTask"])
          expect(new Set(server.made.map((m) => m.key)).size).toBe(3)
          await expect.poll(async () => (await kept(page)).waiting, { timeout: 30_000 }).toEqual([])
          await expect(panel.getByText("Bring the badges")).toHaveCount(1)
          await expect(panel.getByText("Print the badges").first()).toBeVisible()
          expect(server.leaked).toEqual([])
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          await reviewShot(page, "offline-sheet-sent", theme)
        })

        test("with the whole network gone, a task's link in the list opens it in the page's sheet, and nothing moves", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme, "list")
          // Read once online, as a member does, so the device holds it: online, a phone opens it on its page.
          await row(page, "Draft launch email").tap()
          await page.waitForURL(new RegExp(`/app/task/${T}`), { timeout: 30_000 })
          await expect(page.locator("[data-task-page] [data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect.poll(async () => (await kept(page)).read, { timeout: 30_000 }).toBe(true)
          await page.goBack()
          await expect(row(page, "Draft launch email")).toBeVisible({ timeout: 30_000 })
          await code
          await page.context().setOffline(true)
          server.up = false
          const list = page.url()
          await row(page, "Draft launch email").tap()
          const sheet = page.getByRole("dialog", { name: "Task" })
          await expect(sheet).toBeVisible({ timeout: 15_000 })
          expect(page.url()).toBe(list)
          await expect(sheet.locator("[data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          await reviewShot(page, "offline-sheet-list", theme)
        })

        test("with the whole network gone, a part whose code never came says so in its own room, and the task opens whole around it", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          // The task panel's tag picker never reaches the device (its words mark its chunk); every other chunk does.
          // The board's own label filter carries the picker too and draws with the board, first: that chunk comes,
          // and every OTHER chunk with the picker's words is cut while online (the warm list's fetch fails, as on a
          // flaky network), and fails with the rest once the network goes. The panel's parts now come at the page's first
          // idle moment (lib/offline/warmAhead, V-100), not after a press, so the cut is on from the start.
          const cut: string[] = []
          let boards: string | null = null
          await page.route("**/_next/static/chunks/**", async (route) => {
            const response = await route.fetch().catch(() => null)
            const body = response ? await response.text() : ""
            const url = route.request().url()
            const picker = body.includes(". Change labels")
            if (picker && boards === null) boards = url
            // A cut file stays cut, the build's own check included (lib/chunkRecoveryScript's HEAD, which has no
            // body to know it by): a file that answers that check reads as a page left behind by a new build, and
            // the page reloads.
            const cutting = (picker && url !== boards) || cut.includes(url)
            if (response && cutting && !cut.includes(url)) cut.push(url)
            if (!response || cutting) await route.abort().catch(() => {})
            else await route.fulfill({ response, body })
          })
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme)
          await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()
          const todo = page.locator('[data-board] [data-column="todo"]')
          await todo.getByRole("button", { name: "New task" }).first().tap()
          await code
          await page.context().setOffline(true)
          server.up = false
          const name = todo.getByRole("textbox", { name: "New task name" })
          await name.fill("Book the venue")
          await name.press("Enter")
          await card(page, "Book the venue").tap()
          const sheet = page.getByRole("dialog", { name: "Task" })
          const panel = sheet.locator("[data-task-panel]")
          await expect(panel.getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
          await expect(panel.getByRole("button", { name: /Couldn't load the tag picker/ })).toBeVisible({ timeout: 15_000 })
          await expect(panel.locator("[data-task-comment-box]")).toBeVisible()
          // The leg's own ground: the picker's code was asked for after the board drew, and never came.
          expect(cut.length, "the panel's tag picker chunk was asked for, and cut off").toBeGreaterThan(0)
          await expect(page.locator("[data-connection-pill]")).toBeVisible({ timeout: 15_000 })
          await pillClearsComposer(page, "[data-right-panel-sheet] [data-task-comment-box]")
          await reviewShot(page, "offline-sheet-part-failed", theme)
          await page.unrouteAll({ behavior: "ignoreErrors" })
        })

        // DB-39 FIX 2 (a, b): the sheet's first frame already holds the task (never a blank sheet), it rises once, and
        // with the keyboard up its comment box stands on the keyboard (phone.css C5d's keyboard rule), the pill above it.
        test("with the whole network gone, the sheet's first frame holds the task, it rises once, and with the keyboard up its comment box stands on the keyboard", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme, "list")
          await row(page, "Draft launch email").tap()
          await page.waitForURL(new RegExp(`/app/task/${T}`), { timeout: 30_000 })
          await expect(page.locator("[data-task-page] [data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect.poll(async () => (await kept(page)).read, { timeout: 30_000 }).toBe(true)
          await page.goBack()
          await expect(row(page, "Draft launch email")).toBeVisible({ timeout: 30_000 })
          await code
          await page.context().setOffline(true)
          server.up = false
          // The sheet's first painted frame, and every rise it makes.
          await page.evaluate(() => {
            const w = window as unknown as { firstFrame?: { title: boolean; panel: number; sheet: number }; rises: number }
            w.rises = 0
            document.addEventListener("animationstart", (e) => {
              if (e.target instanceof Element && e.target.matches("[data-right-panel-sheet]") && e.animationName === "sheet-frame-rise") w.rises++
            }, true)
            new MutationObserver((_, seen) => {
              const sheet = document.querySelector<HTMLElement>("[data-right-panel-sheet]")
              if (!sheet) return
              seen.disconnect()
              requestAnimationFrame(() => {
                const panel = sheet.querySelector("[data-task-panel]")
                w.firstFrame = { title: sheet.innerText.includes("Draft launch email"), panel: panel ? panel.getBoundingClientRect().height : 0, sheet: sheet.getBoundingClientRect().height }
              })
            }).observe(document.body, { childList: true, subtree: true })
          })
          await row(page, "Draft launch email").tap()
          const sheet = page.getByRole("dialog", { name: "Task" })
          await expect(sheet).toBeVisible({ timeout: 15_000 })
          const first = (await (await page.waitForFunction(() => (window as unknown as { firstFrame?: object }).firstFrame, null, { timeout: 15_000 })).jsonValue()) as { title: boolean; panel: number; sheet: number }
          expect(first.sheet, "the sheet's first frame stands at its height").toBeGreaterThan(400)
          expect(first.title || first.panel > 200, `the sheet's first frame holds the task, or the panel's room: ${JSON.stringify(first)}`).toBe(true)
          await expect(sheet.locator("[data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect(page.locator("[data-connection-pill]")).toBeVisible({ timeout: 15_000 })
          // DB-39's landing shot: the sheet's body scrolled to its end while the pill shows, read once the sheet has
          // risen (its place moves for 420 ms). How far its last row's words reach under the pill's top is logged
          // with the shot (at or under 0: the row clears it; DB-40: the words, not the scroller's box).
          await pillClearsComposer(page, "[data-right-panel-sheet] [data-task-comment-box]")
          const end = await sheet.locator("[data-task-panel]").evaluate((panel) => {
            const body = [...panel.querySelectorAll<HTMLElement>("*")].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
            if (!body) return { scrolls: false, reach: 0 }
            body.scrollTop = body.scrollHeight
            const words = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
            let last = Number.NEGATIVE_INFINITY
            for (let node = words.nextNode(); node; node = words.nextNode()) {
              if (!node.textContent?.trim() || node.parentElement?.closest(".sr-only")) continue
              const range = document.createRange()
              range.selectNodeContents(node)
              const rect = range.getBoundingClientRect()
              if (rect.height > 0) last = Math.max(last, rect.bottom)
            }
            const pill = document.querySelector("[data-connection-pill]")!.getBoundingClientRect()
            return { scrolls: true, reach: Math.round(last - pill.top) }
          })
          console.log(`SHEET END ${theme} ${JSON.stringify(end)}`)
          await reviewShot(page, "offline-sheet-end", theme)
          await sheet.locator("[data-task-comment-box] [contenteditable=true]").tap()
          const close = await openKeyboard(page, "visual")
          // The comment box stands on the keyboard: its foot at the keyboard's top, never under it.
          await expect
            .poll(() => page.evaluate(() => {
              const box = document.querySelector("[data-right-panel-sheet] [data-task-comment-box]")!.getBoundingClientRect()
              const vv = window.visualViewport!
              return Math.round(box.bottom - (vv.offsetTop + vv.height))
            }), { timeout: 10_000 })
            .toBeLessThanOrEqual(1)
          await pillClearsComposer(page, "[data-right-panel-sheet] [data-task-comment-box]")
          // A toast while the keyboard is up comes in under the top bar (app/phone.css C9), never over the box: the
          // toasts' slot (always drawn) with a toast's 44px in it ends above the box's top.
          const slot = await page.evaluate(() => ({
            toast: document.querySelector(".toast-viewport")!.getBoundingClientRect().top,
            box: document.querySelector("[data-right-panel-sheet] [data-task-comment-box]")!.getBoundingClientRect().top,
          }))
          expect(slot.toast + 44, `a toast ends above the comment box: ${JSON.stringify(slot)}`).toBeLessThanOrEqual(slot.box)
          const unpaint = await paintKeyboard(page)
          await reviewShot(page, "offline-sheet-keyboard", theme)
          await unpaint()
          await close()
          expect(await page.evaluate(() => (window as unknown as { rises: number }).rises), "the sheet rises once").toBe(1)
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        })

        // V-93 (CR-93, 30 Oct): the sheet rises for 420 ms and carries its comment box with a transform, which no
        // resize or scroll reports. The pill stood where the box was when the sheet's content came: over the box's
        // top band for ~240 ms, then a hop of 82 px when the rise ended. It moves with the box instead.
        test("with the whole network gone, the offline pill stands 8 px above the task's comment box in every frame of the sheet's rise", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const server: Maker = { up: true, made: [], leaked: [] }
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme, "list")
          await row(page, "Draft launch email").tap()
          await page.waitForURL(new RegExp(`/app/task/${T}`), { timeout: 30_000 })
          await expect(page.locator("[data-task-page] [data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect.poll(async () => (await kept(page)).read, { timeout: 30_000 }).toBe(true)
          await page.goBack()
          await expect(row(page, "Draft launch email")).toBeVisible({ timeout: 30_000 })
          await code
          await page.context().setOffline(true)
          server.up = false
          await expect(page.locator("[data-connection-pill]")).toBeVisible({ timeout: 15_000 })
          // Every frame from before the tap until the box has stood still for ten frames, each read once the frame is
          // drawn (a task queued from the frame's callback runs before the next frame moves anything), so the box and
          // the pill are read as that frame showed them: [ms, the box's top, the pill's foot].
          await page.evaluate(() => {
            const w = window as unknown as { frames: [number, number | null, number][]; still?: boolean }
            w.frames = []
            const t0 = performance.now()
            let same = 0
            const read = () => {
              const box = document.querySelector("[data-right-panel-sheet] [data-task-comment-box]")?.getBoundingClientRect()
              const top = box ? Math.round(box.top) : null
              const prev = w.frames.at(-1)?.[1]
              w.frames.push([Math.round(performance.now() - t0), top, Math.round(document.querySelector("[data-connection-pill]")!.getBoundingClientRect().bottom)])
              same = top !== null && top === prev ? same + 1 : 0
              if (same >= 10) w.still = true
              else requestAnimationFrame(() => setTimeout(read))
            }
            requestAnimationFrame(() => setTimeout(read))
          })
          await row(page, "Draft launch email").tap()
          await page.waitForFunction(() => (window as unknown as { still?: boolean }).still, null, { timeout: 30_000 })
          const frames = await page.evaluate(() => (window as unknown as { frames: [number, number | null, number][] }).frames)
          console.log(`V93 FRAMES ${theme} ${JSON.stringify(frames)}`)
          const height = page.viewportSize()!.height
          const drawn = frames.filter((f): f is [number, number, number] => f[1] !== null)
          expect(drawn.length, "the box is read in the frames of the rise").toBeGreaterThan(10)
          // The pill's foot is 8 px above what owns the screen's foot (app/phone.css: --phone-floor + 8px): the box's
          // top once it is on the screen, the screen's foot while it is still below.
          const apart = drawn.filter(([, top, foot]) => Math.abs(Math.min(top, height) - 8 - foot) > 1)
          expect(apart, "every frame drawn: the pill's foot 8 px above the box's top, as the box moves").toEqual([])
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        })
      } else {
        // DB-39 FIX 2 (c): on a laptop a list's row and a board's card open a task in the right panel themselves, with
        // no move and so no network to lose. What moves to a task's page there is a link to it: the panel's own Open
        // the full page here (a chat's card, a doc's embed or Home's rows elsewhere), which reads the task's key.
        // Pressed with the whole network gone, the one rule opens the task the device keeps under that key in the
        // right panel, loaded, and nothing moves: before it, the browser drew its offline page in the app's place.
        test("with the whole network gone, a link to a task's page, by its key, opens the task in the right panel, and nothing moves", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const server: Maker = { up: true, made: [], leaked: [], taskKey: "WEB-7" }
          const code = panelCode(page)
          await openBoard(page, testInfo, server, theme)
          // Read once online, as a member does, so the device holds it.
          const panel = page.locator("[data-right-panel] [data-task-panel]")
          await card(page, "Draft launch email").click()
          await expect(panel.getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect.poll(async () => (await kept(page)).read, { timeout: 30_000 }).toBe(true)
          await code
          await page.context().setOffline(true)
          server.up = false
          const board = page.url()
          const moves: string[] = []
          page.on("framenavigated", (frame) => {
            if (frame === page.mainFrame()) moves.push(frame.url())
          })
          await page.evaluate(() => ((window as unknown as { stayed?: boolean }).stayed = true))
          // In the 452px panel the header folds the link into More (RightPanelTaskHeader, e2e/taskKeys).
          await panel.getByRole("button", { name: "More task actions" }).click()
          const link = page.getByRole("menuitem", { name: "Open the full page" })
          await expect(link).toHaveAttribute("href", "/app/task/WEB-7")
          await link.click()
          await expect(page.getByRole("menu")).toHaveCount(0)
          await expect(panel.getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await expect(panel.locator("[data-task-comment-box]")).toBeVisible()
          // A move would have come by now: Next's own, or the browser's to its offline page.
          await page.waitForTimeout(1_500)
          expect(page.url()).toBe(board)
          expect(moves, "nothing moved").toEqual([])
          expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed), "the page is the one it was").toBe(true)
          await expect(panel.getByText("Draft launch email").first()).toBeVisible()
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          await reviewShot(page, "offline-panel-link", theme)
        })
      }

      // Main's ruling (29 Oct) on a task made with no network: its Points row works from its project's scale when
      // the device holds it (a task's page there was read here), and its points are sent after it; when the device
      // doesn't hold the scale, the row says to set points once back online. Never an error, never no row.
      for (const held of [true, false]) {
        test(`a task made with no network, ${held ? "where a task's page was read before: its Points row works and the points are sent after it" : "where nothing gave the device its project's scale: its Points row says to set points once back online"}`, async ({ page }, testInfo) => {
          test.setTimeout(240_000)
          const phone = use.viewport.width < 500
          const server: Maker = { up: true, made: [], leaked: [] }
          await openBoard(page, testInfo, server, theme)
          const press = (l: ReturnType<Page["locator"]>) => (phone ? l.tap() : l.click())
          const panel = page.locator("[data-task-panel]")
          if (held) {
            // A task's page in the project, read on this device before the network goes: its project's scale comes
            // with it, and the device keeps it. Read in another tab, so nothing of it is in this page's own memory:
            // the made task's row can only have the scale from the device.
            const other = await page.context().newPage()
            await stubBoard(other, testInfo, server)
            await other.goto(`/app/task/${T}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
            await expect(other.locator("[data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 60_000 })
            await expect.poll(async () => (await keptProject(page))?.estimates, { timeout: 30_000 }).toEqual(SCALE)
            await other.close()
          }
          // The board was read here: the device holds what the member may do in the project (a read still in flight
          // when the network goes isn't kept, so wait for it), and its scale only where a task's page was read.
          await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()
          if (!held) expect((await keptProject(page))?.estimates).toBeUndefined()

          server.up = false
          const todo = page.locator('[data-board] [data-column="todo"]')
          await press(todo.getByRole("button", { name: "New task" }).first())
          const name = todo.getByRole("textbox", { name: "New task name" })
          await name.fill("Book the venue")
          await name.press("Enter")
          await press(card(page, "Book the venue"))
          if (phone) await page.waitForURL(/\/app\/task\/offline-/, { timeout: 30_000 })
          await expect(panel.getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
          const points = panel.locator("[data-property='points']")
          if (held) {
            const pick = points.getByRole("button", { name: "Points: none. Change them" })
            await press(pick)
            await press(page.getByRole("menuitem", { name: "3", exact: true }))
            await expect(points.getByRole("button", { name: "Points: 3. Change them" })).toBeVisible()
            // Kept like the task's other changes, behind its create.
            await expect.poll(async () => (await kept(page)).waiting.map((w) => (w as { url?: string }).url)).toEqual(["/task/createTask", POINTS])
          } else {
            await expect(points).toHaveText("PointsSet points when you're back online", { timeout: 15_000 })
            await expect(points.getByRole("button")).toHaveCount(0)
          }
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          expect(server.made).toEqual([])
          await reviewShot(page, held ? "offline-made-points" : "offline-made-points-later", theme)

          // Back: the task is made, then its points under the server's id; or, with none set, the row offers them.
          server.up = true
          await online(page)
          await expect.poll(() => server.made.map((m) => m.path), { timeout: 60_000 }).toEqual(held ? ["/task/createTask", POINTS] : ["/task/createTask"])
          if (held) expect(server.made[1].body).toEqual({ task_uuid: MADE.task, task_estimate_points: 3 })
          await expect.poll(async () => (await kept(page)).waiting, { timeout: 30_000 }).toEqual([])
          await expect(points.getByRole("button", { name: held ? "Points: 3. Change them" : "Points: none. Change them" })).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
          expect(server.leaked).toEqual([])
        })
      }

      // A task that really isn't there, opened online, still says so: the device's own answers stay quiet, and a
      // real 404 isn't one of them.
      // CR-81 MF3: when the device holds no access for the project, nothing makes one up (withKeptProject), and the
      // made task's page never calls the member's own task view-only: it says it can be changed once back online.
      test("a task made with no network, where the device kept no access for its project, says it can be changed once back online", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const phone = use.viewport.width < 500
        const server: Maker = { up: true, made: [], leaked: [] }
        await openBoard(page, testInfo, server, theme)
        const press = (l: ReturnType<Page["locator"]>) => (phone ? l.tap() : l.click())
        if (!phone) {
          await press(card(page, "Draft launch email"))
          await expect(page.locator("[data-task-panel]").getByText("Draft launch email").first()).toBeVisible({ timeout: 30_000 })
          await page.keyboard.press("Escape")
        }
        await expect.poll(async () => (await keptProject(page))?.project_access, { timeout: 30_000 }).toBeTruthy()
        expect(await forgetKeptAccess(page)).toBe(true)
        expect((await keptProject(page))?.project_access).toBeUndefined()

        server.up = false
        const todo = page.locator('[data-board] [data-column="todo"]')
        await press(todo.getByRole("button", { name: "New task" }).first())
        const name = todo.getByRole("textbox", { name: "New task name" })
        await name.fill("Book the venue")
        await name.press("Enter")
        await expect(todo.locator("[data-task-id]").filter({ hasText: "Book the venue" })).toBeVisible({ timeout: 15_000 })
        await press(card(page, "Book the venue"))
        if (phone) await page.waitForURL(/\/app\/task\/offline-/, { timeout: 30_000 })
        const panel = page.locator("[data-task-panel]")
        await expect(panel.getByText("Book the venue").first()).toBeVisible({ timeout: 30_000 })
        await expect(page.locator("[data-task-comment-later]")).toHaveText("You can change and comment on it when you're back online.")
        await expect(page.getByText("You can see this project but not comment in it.")).toHaveCount(0)
        await expect(page.locator("[data-task-comment-box]")).toHaveCount(0)
        await expect(page.getByText(FAILURE_WORDS)).toHaveCount(0)
        expect(server.leaked).toEqual([])
        await reviewShot(page, "offline-made-later", theme)
      })

      test("a task the server doesn't have, opened online, still says it doesn't exist", async ({ page }, testInfo) => {
        const GONE = "00000000-0000-4000-8000-0000000000f4"
        await page.addInitScript((t) => {
          localStorage.setItem("ui-theme", t)
          localStorage.setItem("oc_keys_tip_seen", "1")
        }, theme)
        await stubBackend(page, testInfo, {
          [`/task/info/${GONE}`]: withStatus(404, { msg: "Task not found" }),
          "/notices": { msg: "ok", data: { notices: [] } },
          "/user/dm-ai-targets": { msg: "ok", data: [] },
        })
        await page.goto(`/app/task/${GONE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const gone = page.locator('[data-load-failure="gone"]')
        await expect(gone).toBeVisible({ timeout: 60_000 })
        await expect(gone).toContainText("This task doesn't exist or was deleted")
        await expect(page.getByText(/still waiting to be sent/)).toHaveCount(0)
        await reviewShot(page, "offline-missing-online", theme)
      })
    })
  }
}

// The sidebar's pill at 1280 in its longest states (DESIGN-BUILD-21 M3): the most changes a device keeps while the
// server doesn't answer, and the live connection past its fast tries.
for (const theme of SHOT_THEMES) {
  test.describe(`the sidebar's pill on a laptop, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("says the longest offline states whole, above the account row", async ({ page }, testInfo) => {
      const server: Server = { up: true, status: "todo", lost: false, writes: [] }
      await openTask(page, testInfo, server, theme)
      server.up = false
      await complete(page).click()
      await expect(page.locator("[data-connection-pill]")).toContainText("1 change waiting", { timeout: 15_000 })
      // No answer from the server at all from here (the newest route wins): two misses mark it unreachable.
      const app = appOrigin(testInfo)
      await page.route((url) => url.origin !== app.origin, (route) => route.abort("failed"))
      for (const total of [12, 200]) {
        await keepChanges(page, total)
        // Retry sends what's waiting: it counts what the device keeps, and misses the server.
        await expect(async () => {
          await page.locator("[data-connection-pill]").getByRole("button", { name: "Retry" }).click()
          await expect(page.locator("[data-connection-pill=offline]")).toContainText(`Can't reach the server · ${total} changes waiting`, { timeout: 2_000 })
        }).toPass({ timeout: 30_000 })
        await expectPillWhole(page)
        await reviewShot(page, `offline-${total}-waiting`, theme)
      }
    })

    test("says the live connection's longest state whole, with Reconnect", async ({ page }, testInfo) => {
      const OWN = "user/sam"
      const broker = brokerFor()
      let up = true
      let socket: WebSocketRoute | null = null
      await page.addInitScript((t) => {
        localStorage.setItem("ui-theme", t)
        localStorage.setItem("oc_keys_tip_seen", "1")
      }, theme)
      // The page's own clock, running as time does until the test runs it on.
      await page.clock.install()
      await stubBackend(page, testInfo, {
        "/config/mqttConfig": { msg: "ok", data: { clientId: "e2e", username: "u", password: "p", topics: [OWN], ws_url: "ws://broker.e2e.test:8083/mqtt" } },
      })
      // After stubBackend's silent catch-all: the newest websocket route wins.
      await page.routeWebSocket(/broker\.e2e\.test/, (ws) => {
        if (!up) return void ws.close().catch(() => {})
        socket = ws
        const peer = broker.connect(
          (bytes: Uint8Array) => ws.send(Buffer.from(bytes)),
          () => ws.close().catch(() => {}),
        )
        ws.onMessage((m) => {
          if (typeof m !== "string") peer.receive(new Uint8Array(m))
        })
        ws.onClose(() => peer.closed())
      })
      // Home's orbit turns for minutes, and a shot waits for what moves: it keeps still for one who asks for less motion.
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect.poll(() => broker.subscriptions(), { timeout: 60_000 }).toContain(OWN)
      // The broker goes, and each try to come back is refused.
      up = false
      await socket!.close()
      const pill = page.locator("[data-connection-pill=live]")
      await expect(pill).toContainText("Live updates paused · reconnecting", { timeout: 15_000 })
      await expect(async () => {
        await page.clock.runFor(16_000)
        await expect(pill).toContainText("Live updates paused · trying every 30 s", { timeout: 1_000 })
      }).toPass({ timeout: 60_000 })
      await expect(pill.getByRole("button", { name: "Reconnect" })).toBeVisible()
      await expectPillWhole(page)
      await reviewShot(page, "live-paused", theme)
    })
  })
}
