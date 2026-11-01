import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, brokerOn, expectEveryCallAnswered, mqttConfig, stubBackend, withStatus } from "./stubbedApp"

// A teammate's change reaches a board that is already open (projects WCL-2;
// ROWS asana-19 and jira-19), through the Work Change Log's one feed
// (lib/tasks/workChanges): an entry heard on the project's topic changes its
// card in place within a second, and what the app missed while its connection
// was down it reads from the log (GET /work/changes, from the place this
// device kept) once it is back. A place the log no longer has (a 410) keeps
// the log's head and reads the board again.
//
// Permission model: the feed grants nothing. The server answers each reader
// only the entries they may see; this applies them to what is open.

const P = "5d1c7e2a-8b4f-4c3d-9e6a-1f2b3c4d5e6f"
const T = "00000000-0000-4000-8000-0000000000b7"
const TEAMMATE = "00000000-0000-4000-8000-00000000d0e1"
const TOPIC = `project/${P}`
// MqttMessageType.Task_Changed (services/mqttService.ts).
const TASK_CHANGED = 40
const NONE = "0001-01-01T00:00:00Z"
const BEFORE = "Draft launch email"
const AFTER = "Send launch email"
// A task the teammate makes while the board is open.
const NEW = "00000000-0000-4000-8000-0000000000c8"
const MADE = "Book the venue"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }

/** An entry of the log, as GET /work/changes answers it. */
interface Entry {
  sequence: number
  kind: string
  resource_kind: "task"
  resource_uuid: string
  project_uuid: string
  diff: Record<string, unknown>
  actor: string
}

/** The server as the test sets it: the task's name, the log, the places it no longer has, and what the app read. */
interface Server {
  name: string
  log: Entry[]
  gone: string[]
  /** Every place GET /work/changes was asked for, in order ("" is the log's head). */
  reads: string[]
  /** How many times the board's tasks were read. */
  boardReads: number
  /** While set, the board's reads wait for it: what the board shows meanwhile came from elsewhere. */
  boardHeld?: Promise<void>
  /** Tasks a teammate made since the board opened, in its To do column after the first. */
  made: { uuid: string; name: string }[]
}

/** The log as it is when the board opens: 41 entries from before, so its head is "41". */
function newServer(): Server {
  const log = Array.from({ length: 41 }, (_, i) => renamed(i + 1, BEFORE))
  return { name: BEFORE, log, gone: [], reads: [], boardReads: 0, made: [] }
}
const HEAD = "41"

/** The teammate renamed the task: entry `sequence` of the log. */
function renamed(sequence: number, name: string): Entry {
  return { sequence, kind: "task.updated", resource_kind: "task", resource_uuid: T, project_uuid: P, diff: { task_name: name }, actor: TEAMMATE }
}

/** The teammate's change `kind` to task `uuid`: entry `sequence` of the log. */
function changed(sequence: number, kind: string, uuid: string, diff: Record<string, unknown>): Entry {
  return { sequence, kind, resource_kind: "task", resource_uuid: uuid, project_uuid: P, diff, actor: TEAMMATE }
}

/** The entry as the server sends it on the project's topic (backend MESSAGE_TASK_CHANGED). */
function message(e: Entry) {
  return { type: TASK_CHANGED, data: { project_uuid: e.project_uuid, task_uuid: e.resource_uuid, sequence: e.sequence, kind: e.kind, diff: e.diff, by: e.actor } }
}

function task(server: Server, uuid = T, name = server.name) {
  return {
    task_uuid: uuid,
    task_name: name,
    task_status: "todo",
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
  }
}

/** The project's board and the log's read, answered from `server`. */
async function stubBoard(page: Page, testInfo: TestInfo, server: Server) {
  await stubBackend(page, testInfo, {
    "/config/mqttConfig": mqttConfig([TOPIC]),
    // The log by place: the head's place for "", the entries after a kept one, and a 410 for one it no longer has.
    "/work/changes": (url: URL) => {
      const cursor = url.searchParams.get("cursor") ?? ""
      server.reads.push(cursor)
      if (server.gone.includes(cursor)) return withStatus(410, { msg: "That place in the log is gone" })
      const head = String(server.log.at(-1)?.sequence ?? 0)
      if (cursor === "") return { msg: "ok", data: { entries: [], cursor: head } }
      const entries = server.log.filter((e) => e.sequence > Number(cursor))
      return { msg: "ok", data: { entries, cursor: entries.length > 0 ? String(entries.at(-1)!.sequence) : cursor } }
    },
    [`/project/taskListForKanban/${P}`]: async () => {
      server.boardReads++
      await server.boardHeld
      return {
        msg: "ok",
        data: {
          ...project,
          project_tasks_backlog: [],
          project_tasks_todo: [task(server), ...server.made.map((m) => task(server, m.uuid, m.name))],
          project_tasks_in_progress: [],
          project_tasks_in_review: [],
          project_tasks_done: [],
          project_tasks_canceled: [],
          project_tasks_done_count: 0,
          project_tasks_canceled_count: 0,
          project_column_counts: { backlog: 0, todo: 1 + server.made.length, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
        },
      }
    },
    [`/project/taskList/${P}`]: () => ({ msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task(server)] }, pageCount: 1 }),
    "/task/info/": () => ({ msg: "ok", data: task(server) }),
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/forecast`]: {
      msg: "ok",
      data: { project_uuid: P, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, open: 1, unit: "tasks", per_week: 0, weeks: 0, held_by: [], held_count: 0 },
    },
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: true } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: { notices: [] } },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: project.project_name }, topic: TOPIC }] },
  })
}

const card = (page: Page, name: string) => page.locator("[data-board] [data-task-id]").filter({ hasText: name })

/** A value this device keeps in its Offline Store's meta, read without ever making the database. */
function keptOnDevice(page: Page, key: string) {
  return page.evaluate(
    (k) =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("onecamp-offline")
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve(undefined)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains("meta")) {
            db.close()
            resolve(undefined)
            return
          }
          const read = db.transaction(["meta"], "readonly").objectStore("meta").get(k)
          read.onsuccess = () => {
            db.close()
            resolve(read.result)
          }
          read.onerror = () => {
            db.close()
            resolve(undefined)
          }
        }
      }),
    key,
  )
}

/**
 * The board open, then live: the app connects only once the board shows and
 * the device's store is the member's, so the first catch-up (on the
 * connection's subscriptions) reads the log's head and keeps its place.
 */
async function openBoard(page: Page, testInfo: TestInfo, server: Server) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBoard(page, testInfo, server)
  const { broker, release } = await brokerOn(page, { held: true })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(card(page, BEFORE)).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => keptOnDevice(page, "member"), { timeout: 30_000 }).toBe(SAM.user_uuid)
  release()
  await expect.poll(() => broker.subscriptions(), { timeout: 60_000 }).toContain(TOPIC)
  await expect.poll(() => keptOnDevice(page, "work-cursor"), { timeout: 30_000 }).toBe(HEAD)
  expect(server.reads[0], "nothing kept on a new device: the first catch-up reads the head").toBe("")
  return broker
}

for (const [where, use] of [
  ["on a phone, by touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ["on a laptop", { viewport: { width: 1280, height: 860 } }],
] as const) {
  test.describe(where, () => {
    test.use(use)

    test("a teammate's change shows on the open board within a second, in place", async ({ page }, testInfo) => {
      const server = newServer()
      const broker = await openBoard(page, testInfo, server)
      const boardReads = server.boardReads

      const change = renamed(42, AFTER)
      server.log.push(change)
      server.name = AFTER
      const sent = Date.now()
      expect(broker.publish(TOPIC, message(change)), "the app is live on the project's topic").toBe(1)
      await expect(card(page, AFTER)).toBeVisible({ timeout: 1_000 })
      const took = Date.now() - sent
      testInfo.annotations.push({ type: "live change on the board (ms)", description: String(took) })
      expect(took, "a teammate's change on an open board, within a second (asana-19)").toBeLessThan(1_000)
      await expect(card(page, BEFORE)).toHaveCount(0)
      expect(server.boardReads, "changed in place: the board isn't read again").toBe(boardReads)
      await expectEveryCallAnswered(page)
    })

    // WCL-2b: on the demo, a task made while the boards were open never drew until a reload. Its task.created reads
    // the board again; its task.updated, 55 ms later, patched the board while that read was out, and the read that
    // held the new task was thrown away.
    test("a task a teammate makes while the board is open draws on it, though changes land while the board reads", async ({ page }, testInfo) => {
      const server = newServer()
      const broker = await openBoard(page, testInfo, server)
      const boardReads = server.boardReads
      // The board's read for the new task is held until the teammate's next changes have landed.
      let answerBoard = () => {}
      server.boardHeld = new Promise<void>((resolve) => (answerBoard = resolve))

      // The teammate makes a task: the board reads its tasks again.
      server.made.push({ uuid: NEW, name: MADE })
      const created = changed(42, "task.created", NEW, { task_name: MADE })
      server.log.push(created)
      expect(broker.publish(TOPIC, message(created)), "the app is live on the project's topic").toBe(1)
      await expect.poll(() => server.boardReads, { timeout: 15_000 }).toBeGreaterThan(boardReads)

      // While that read is out, the new task's fields change (its own task.updated) and so does the other task's
      // name: both are patched in place.
      const followed = changed(43, "task.updated", NEW, { task_priority: "high" })
      const rename = renamed(44, AFTER)
      server.log.push(followed, rename)
      server.name = AFTER
      expect(broker.publish(TOPIC, message(followed))).toBe(1)
      expect(broker.publish(TOPIC, message(rename))).toBe(1)
      await expect(card(page, AFTER), "the later change is patched in while the board's read is out").toBeVisible({ timeout: 15_000 })

      const answered = Date.now()
      answerBoard()
      await expect(card(page, MADE), "the task the teammate made draws, with no reload").toBeVisible({ timeout: 5_000 })
      const took = Date.now() - answered
      testInfo.annotations.push({ type: "new task on the board after its read (ms)", description: String(took) })
      expect(took, "a teammate's new task on an open board, within a second of its read (asana-19)").toBeLessThan(1_000)
      await expect(card(page, BEFORE)).toHaveCount(0)
      await expectEveryCallAnswered(page)
    })

    test("after a dropped connection, the board reads what it missed from the place it kept", async ({ page }, testInfo) => {
      const server = newServer()
      const broker = await openBoard(page, testInfo, server)
      // A page also reads its lists again once its topic is live again (useMqttTopic's onLive): that read is held,
      // so what the card shows before it answers came from the log.
      let answerBoard = () => {}
      server.boardHeld = new Promise<void>((resolve) => (answerBoard = resolve))

      expect(broker.drop(), "the broker drops the app's connection").toBe(1)
      // While the app is away the teammate renames the task: the log has it, and no message reaches the app.
      server.log.push(renamed(42, AFTER))
      server.name = AFTER
      expect(broker.publish(TOPIC, message(server.log.at(-1)!)), "nobody connected hears it").toBe(0)

      // The app comes back on its own, and catches up from its place.
      await expect.poll(() => broker.subscriptions(), { timeout: 30_000 }).toContain(TOPIC)
      await expect(card(page, AFTER), "patched from the log while the board's own read is still out").toBeVisible({ timeout: 15_000 })
      expect(server.reads.slice(1), "read from the place it kept").toContain(HEAD)
      await expect.poll(() => keptOnDevice(page, "work-cursor"), { timeout: 15_000 }).toBe("42")
      answerBoard()
      await expect(card(page, AFTER), "the board's read agrees").toBeVisible()
      await expect(card(page, BEFORE)).toHaveCount(0)
      await expectEveryCallAnswered(page)
    })

    test("a place the log no longer has keeps the log's head and reads the board again", async ({ page }, testInfo) => {
      const server = newServer()
      const broker = await openBoard(page, testInfo, server)
      const boardReads = server.boardReads

      expect(broker.drop()).toBe(1)
      // While the app is away the log moves on past its place (kept for so long, then trimmed): the change is only on the board.
      server.gone.push(HEAD)
      server.log = [renamed(90, AFTER)]
      server.name = AFTER

      await expect.poll(() => broker.subscriptions(), { timeout: 30_000 }).toContain(TOPIC)
      await expect(card(page, AFTER)).toBeVisible({ timeout: 15_000 })
      // The page also reads its lists again once its topic is live again (useMqttTopic's onLive), and that read goes
      // out before the catch-up has opened the device's store to find its place, so the card can show the change
      // before the log is asked anything (wH33, 31 Oct): the asks are waited for, never taken once.
      const asked = () => server.reads.lastIndexOf(HEAD)
      await expect.poll(asked, { message: "asked for the place it kept", timeout: 15_000 }).toBeGreaterThan(0)
      await expect.poll(() => server.reads[asked() + 1], { message: "then the log's head", timeout: 15_000 }).toBe("")
      expect(server.boardReads, "the board read again").toBeGreaterThan(boardReads)
      await expect.poll(() => keptOnDevice(page, "work-cursor"), { timeout: 15_000 }).toBe("90")
      await expectEveryCallAnswered(page)
    })
  })
}
