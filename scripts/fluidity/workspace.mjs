// The synthetic workspace the fluidity scenarios run on: people, channels and
// DMs (chat.mjs's, moved here so the shell around every surface has the same
// sidebar), a project of 2,000 tasks, tables of 10,000 and 100,000 rows, a
// calendar that has events in any week asked for, a page tree, an inbox and
// search answers. Every answer is built here from a seed, never recorded from
// a real server, so it holds no one's data and a run is comparable to the next.
//
// fakeApp.mjs answers a request with the first fixture whose pattern matches
// its path (a function is asked with the path and the URL); anything else the
// shell asks for gets an empty object. A surface that needs more adds its own.
import { USERS } from "./fakeApp.mjs"

export const ME = USERS.sam
const person = (n, name, full) => ({ user_uuid: `5a7a1c11-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, user_name: name, user_full_name: full, user_email_id: `${name}@example.test`, user_profile_object_key: "" })
export const PEOPLE = [person(1, "maya", "Maya Chen"), person(2, "jonas", "Jonas Weber"), person(3, "priya", "Priya Shah"), person(4, "tomas", "Tomás Ruiz")]
export const SPEAKERS = [ME, ...PEOPLE]
const ok = (data) => ({ msg: "ok", data })
const NONE = "0001-01-01T00:00:00Z"

// ---------------------------------------------------------------------------
// Chat: six channels, one 2,000 messages long and paged as the server pages
// it, and three DMs (chat.mjs's workspace, unchanged).
// ---------------------------------------------------------------------------
const chId = (n) => `c4a70000-0000-4000-8000-${String(n).padStart(12, "0")}`
export const CHANNELS = [
  // The long channel's messages show their threads (a reply row with faces on
  // every ninth, as the demo's do); the five short ones the switches visit
  // don't, as on 17 Oct, so the switch budgets compare.
  { id: chId(1), name: "general", size: 2000, threads: true },
  { id: chId(2), name: "engineering", size: 80 },
  { id: chId(3), name: "design", size: 80 },
  { id: chId(4), name: "launch", size: 80 },
  { id: chId(5), name: "support", size: 80 },
  { id: chId(6), name: "random", size: 80 },
]
export const PAGE = 50
// Varied on purpose: rows of different heights are what makes a virtual list
// measure (as synth.mjs's bodies, which the demo walk uses).
export const BODIES = [
  "<p>Merged. The staging deploy is running now.</p>",
  "<p>Can someone check the numbers on the pricing page against the plans before Thursday? The Business tier still says the old seat count in one place.</p>",
  "<p>Notes from the sync:</p><ul><li><p>Load test moves to Wednesday morning</p></li><li><p>Rollback steps are in the Launch sync notes</p></li><li><p>Legal signed off on the terms</p></li></ul>",
  "<p>Looks good to me.</p>",
  "<p>The import ran in 4 minutes on the copy of production. Two channels had attachments over the limit, so they came across as links. Everything else matched, including the threads and reactions.</p>",
  "<p>Who is on call Thursday? I want to put a name next to the rollback steps.</p>",
]
export const NOW = Date.UTC(2026, 9, 17, 9, 0)
export const at = (i) => new Date(NOW - i * 7 * 60_000).toISOString()
export const postId = (c, i) => `${c.id.slice(0, 8)}-0000-4000-8000-${String(i).padStart(12, "0")}`

/** A channel's message i, newest first (0 is the latest). */
export function post(c, i) {
  return {
    post_uuid: postId(c, i),
    post_text: `${BODIES[i % BODIES.length].replace("</p>", ` (${c.name} ${i})</p>`)}`,
    post_by: SPEAKERS[i % SPEAKERS.length],
    post_created_at: at(i),
    post_comment_count: i % 9 === 0 ? (c.threads ? THREAD_REPLIES : 2) : 0,
    post_comments: c.threads && i % 9 === 0 ? [{ comment_created_at: new Date(Date.parse(at(i)) + THREAD_REPLIES * 90_000).toISOString(), comment_by: SPEAKERS[(i + 1) % SPEAKERS.length] }] : [],
    post_reactions: [],
    post_attachments: [],
  }
}
export const pageOf = (c, from) => {
  const posts = []
  for (let i = from; i < Math.min(c.size, from + PAGE); i++) posts.push(post(c, i))
  return { posts, has_more: from + PAGE < c.size }
}
export const channelInfo = (c) => ({
  ch_uuid: c.id,
  ch_name: c.name,
  ch_icon: "",
  ch_private: false,
  ch_is_user_fav: false,
  ch_about: `Where the team talks about ${c.name}.`,
  ch_call_active: false,
  unread_post_count: 0,
  ch_created_at: at(c.size + 10),
  ch_is_member: true,
  ch_posts: [],
  ch_created_by: ME,
  ch_member_count: SPEAKERS.length,
  ch_recording: [],
})
const dmGroup = (p) => [ME.user_uuid, p.user_uuid].sort().join(" ")
export const chat = (p, i) => {
  const mine = i % 2 === 1
  return {
    chat_uuid: `0c4a${p.user_uuid.slice(-4)}-0000-4000-8000-${String(i).padStart(12, "0")}`,
    chat_from: mine ? ME : p,
    chat_to: mine ? p : ME,
    chat_created_at: at(i),
    chat_body_text: BODIES[(i + 1) % BODIES.length],
    chat_attachments: [],
    chat_comment_count: 0,
  }
}
export const DMS = PEOPLE.slice(0, 3)
export const dmEntry = (p) => ({ dm_grouping_id: dmGroup(p), dm_unread: 0, dm_participants: [ME, p], dm_notification_type: "all", dm_chats: [chat(p, 0)] })

/** How many replies a thread holds when it is opened. */
export const THREAD_REPLIES = 40
/** A thread's replies: `n` of them under message `i` of channel `c`. */
export function replies(c, i, n) {
  return Array.from({ length: n }, (_, k) => ({
    comment_uuid: `${c.id.slice(0, 8)}-c000-4000-8000-${String(i * 1000 + k).padStart(12, "0")}`,
    comment_text: BODIES[(k + 2) % BODIES.length],
    comment_by: SPEAKERS[(k + 1) % SPEAKERS.length],
    comment_created_at: new Date(Date.parse(at(i)) + (k + 1) * 90_000).toISOString(),
    comment_reactions: [],
    comment_attachments: [],
  }))
}

/** The chat surfaces' answers (chat.mjs's, as they were). */
export function chatFixtures({ sidebar = {} } = {}) {
  return [
    [/\/user\/sidebarNav$/, ok({ ...ME, user_channels: CHANNELS.map(channelInfo), user_dms: DMS.map(dmEntry), ...sidebar })],
    [/\/ch\/channelBasicInfo\/[^/]+$/, (path) => ({ msg: "ok", channel_info: channelInfo(CHANNELS.find((c) => path.endsWith(c.id)) ?? CHANNELS[1]) })],
    [/\/ch\/userActiveChannelsWithLatestPost/, { msg: "ok", channels_list: CHANNELS.map(channelInfo) }],
    [/\/po\/latestPosts\/[^/]+$/, (path) => ok(pageOf(CHANNELS.find((c) => path.endsWith(c.id)) ?? CHANNELS[1], 0))],
    // An older page: the messages before the oldest one shown, which the client
    // names by its time in epoch seconds and, exactly, by ?at= (lib/chat/pageEdge).
    [
      /\/po\/oldPosts\/[^/]+\/\d+/,
      (path, url) => {
        const [, id, sec] = /\/po\/oldPosts\/([^/]+)\/(\d+)/.exec(path)
        const c = CHANNELS.find((x) => x.id === id) ?? CHANNELS[0]
        const atq = url?.searchParams.get("at")
        const ms = atq && !Number.isNaN(Date.parse(atq)) ? Date.parse(atq) : Number(sec) * 1000
        const from = Math.max(0, Math.round((NOW - ms) / (7 * 60_000)) + 1)
        return ok(pageOf(c, from))
      },
    ],
    [
      /\/dm\/latestChat\/[^/]+$/,
      (path) => {
        const p = PEOPLE.find((x) => path.endsWith(x.user_uuid)) ?? PEOPLE[0]
        return ok({ chats: Array.from({ length: 60 }, (_, i) => chat(p, i)), has_more: false })
      },
    ],
    [/\/user\/profile\/[^/]+$/, (path) => ok(PEOPLE.find((x) => path.endsWith(x.user_uuid)) ?? PEOPLE[0])],
    // A message's thread: the message and THREAD_REPLIES replies (a busy thread, whatever its count says).
    [
      /\/po\/allComments\/[^/]+$/,
      (path) => {
        const id = path.split("/").pop()
        const c = CHANNELS.find((x) => id.startsWith(x.id.slice(0, 8))) ?? CHANNELS[1]
        const i = Number(id.slice(-12))
        return ok({ ...post(c, i), post_comments: replies(c, i, THREAD_REPLIES), post_comment_count: THREAD_REPLIES, post_channel: channelInfo(c) })
      },
    ],
    [/\/user\/dm-ai-suggestions$/, ok([])],
    [/\/dm\/?$/, ok([])],
  ]
}

// ---------------------------------------------------------------------------
// Work: a project of 2,000 tasks, as the list (500 a page), the board (each
// open column's first 1,000, the closed columns' newest 200) and a task's
// panel read it.
// ---------------------------------------------------------------------------
const pid = (n) => `9a0e0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const tid = (p, i) => `7a5c${String(p).padStart(4, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`
export const PROJECTS = [
  { id: pid(1), name: "Q4 launch", tasks: 2000 },
  { id: pid(2), name: "Website relaunch", tasks: 60 },
  { id: pid(3), name: "Customer onboarding", tasks: 40 },
]
export const BIG_PROJECT = PROJECTS[0]
// The share of a project's tasks in each status, as a busy team's board has them.
const STATUS_MIX = [
  ["backlog", 0.1],
  ["todo", 0.35],
  ["inProgress", 0.15],
  ["inReview", 0.05],
  ["done", 0.3],
  ["canceled", 0.05],
]
const PRIORITIES = ["urgent", "high", "medium", "low", "none"]
const VERBS = ["Draft", "Review", "Fix", "Ship", "Write", "Test", "Plan", "Design", "Update", "Check"]
const THINGS = ["the pricing page copy", "login redirect on Safari", "launch email", "onboarding checklist", "release notes", "billing webhook retries", "the import from Jira", "board column limits", "the status page", "invoice PDF layout", "dark mode contrast", "the API docs"]
const DAY = 86_400_000
/** Today at 09:00 in the browser's zone is close enough for dates a list sorts and a timeline draws. */
const TODAY = (() => {
  const d = new Date()
  d.setUTCHours(9, 0, 0, 0)
  return d.getTime()
})()

function statusOf(i, total) {
  let x = (i * 7919) % total
  for (const [s, share] of STATUS_MIX) {
    const n = Math.round(share * total)
    if (x < n) return s
    x -= n
  }
  return "todo"
}
const projectRef = (p) => ({ project_uuid: p.id, project_name: p.name, project_is_admin: true, project_is_member: true })

/** Task i of project p, as a list and a board read it. */
export function task(p, i) {
  const n = PROJECTS.indexOf(p) + 1
  const status = statusOf(i, p.tasks)
  const due = i % 3 === 0 ? NONE : new Date(TODAY + (((i * 37) % 120) - 40) * DAY).toISOString()
  const start = due === NONE || i % 2 ? NONE : new Date(Date.parse(due) - ((i % 9) + 2) * DAY).toISOString()
  return {
    uid: `0x${(n * 100000 + i).toString(16)}`,
    task_uuid: tid(n, i),
    id: tid(n, i),
    task_name: `${VERBS[i % VERBS.length]} ${THINGS[(i * 5) % THINGS.length]} (${i + 1})`,
    task_status: status,
    task_priority: PRIORITIES[i % PRIORITIES.length],
    task_label: i % 4 === 0 ? "launch" : i % 4 === 1 ? "web" : "",
    task_due_date: due,
    task_start_date: start,
    task_created_at: new Date(TODAY - ((i % 90) + 5) * DAY).toISOString(),
    task_status_since: new Date(TODAY - ((i % 12) + 1) * DAY).toISOString(),
    task_deleted_at: NONE,
    task_sub_task_count: i % 7 === 0 ? 3 : 0,
    task_comment_count: i % 5 === 0 ? 2 : 0,
    task_assignee: SPEAKERS[i % SPEAKERS.length],
    task_collaborators: [],
    task_created_by: ME,
    task_project: projectRef(p),
    task_estimate_minutes: i % 6 === 0 ? 120 : 0,
  }
}
const tasksOf = (p) => Array.from({ length: p.tasks }, (_, i) => task(p, i))
const cache = new Map()
const allTasks = (p) => {
  if (!cache.has(p.id)) cache.set(p.id, tasksOf(p))
  return cache.get(p.id)
}
export const projectInfo = (p) => ({
  uid: `0x${(PROJECTS.indexOf(p) + 1).toString(16)}`,
  project_uuid: p.id,
  project_name: p.name,
  notification_type: "all",
  project_member_count: SPEAKERS.length,
  project_status: "active",
  project_tasks: [],
  project_attachments: [],
  project_task_count: p.tasks,
  project_is_admin: true,
  project_is_member: true,
  project_members: SPEAKERS,
  project_admins: [ME],
  project_created_by: ME,
  project_created_at: new Date(TODAY - 120 * DAY).toISOString(),
  project_updated_at: new Date(TODAY - DAY).toISOString(),
  project_deleted_at: NONE,
})
const projectOf = (path) => PROJECTS.find((p) => path.includes(p.id))

/** A task's panel: the task with its description, sub-tasks, comments and history. */
export function taskInfo(p, i) {
  const t = task(p, i)
  return {
    ...t,
    task_project: { ...projectInfo(p) },
    task_description: "<p>What done looks like: the page matches the plans, the numbers are checked against billing, and the copy is read by someone who didn't write it.</p><ul><li><p>Plans table</p></li><li><p>FAQ</p></li><li><p>Footer links</p></li></ul>",
    task_sub_tasks: t.task_sub_task_count ? Array.from({ length: 3 }, (_, k) => ({ ...task(p, (i + k + 1) % p.tasks), task_parent_task: { task_uuid: t.task_uuid } })) : [],
    task_comments: [],
    task_activities: [],
    task_attachments: [],
    task_blocked_by: [],
    task_blocks: [],
  }
}

const COLUMN_KEYS = {
  backlog: "project_tasks_backlog",
  todo: "project_tasks_todo",
  inProgress: "project_tasks_in_progress",
  inReview: "project_tasks_in_review",
  done: "project_tasks_done",
  canceled: "project_tasks_canceled",
}
/** The board's answer: open columns' first 1,000 (openLimit more), closed ones' newest 200 (closedLimit more). */
function kanban(p, url) {
  const open = Number(url?.searchParams.get("openLimit") || 1000)
  const closed = Number(url?.searchParams.get("closedLimit") || 200)
  const by = {}
  for (const t of allTasks(p)) (by[t.task_status] ??= []).push(t)
  const out = { ...projectInfo(p), project_column_counts: {} }
  for (const [status, key] of Object.entries(COLUMN_KEYS)) {
    const all = by[status] ?? []
    const isClosed = status === "done" || status === "canceled"
    out[key] = all.slice(0, isClosed ? closed : open)
    out.project_column_counts[status] = all.length
  }
  out.project_tasks_done_count = (by.done ?? []).length
  out.project_tasks_canceled_count = (by.canceled ?? []).length
  return ok(out)
}
/** A list page: ?pageSize=&pageIndex= (from 0), with the page count the reader turns pages by. */
function listPage(p, url) {
  const size = Number(url?.searchParams.get("pageSize") || 500)
  const index = Number(url?.searchParams.get("pageIndex") || 0)
  const all = allTasks(p)
  return { msg: "ok", pageCount: Math.ceil(all.length / size), data: { ...projectInfo(p), project_tasks: all.slice(index * size, (index + 1) * size) } }
}

/** The timeline's tasks: those with dates, as GET /project/{id}/timeline answers. */
function timeline(p) {
  const tasks = allTasks(p)
    .filter((t) => t.task_due_date !== NONE)
    .slice(0, 500)
    .map((t) => ({
      task_uuid: t.task_uuid,
      task_name: t.task_name,
      task_status: t.task_status,
      task_custom_status: "",
      task_custom_status_name: "",
      task_priority: t.task_priority,
      task_start_date: t.task_start_date === NONE ? new Date(Date.parse(t.task_due_date) - 3 * DAY).toISOString() : t.task_start_date,
      task_due_date: t.task_due_date,
      task_created_at: t.task_created_at,
      task_assignee: { ...t.task_assignee, user_full_name: t.task_assignee.user_full_name ?? t.task_assignee.user_name },
      task_sub_task_count: t.task_sub_task_count,
    }))
  return ok({ tasks, total: tasks.length, can_edit: true })
}

/** A project's statuses: the built-in ones, no custom ones (the shape the board and the list read), in the column order last saved. */
const statuses = (projectId) => {
  const order = columnOrder.get(projectId)
  return ok({ built_in: ["backlog", "todo", "inProgress", "inReview", "done", "canceled"].map((k) => ({ key: k, label: k })), custom: [], colors: ["slate", "sky", "red", "violet", "amber", "green"], max: 20, ...(order ? { order } : {}) })
}
/** A board's column order, by project id, as POST /project/{id}/statuses/order saved it (the column drag; e2e/boardColumns.spec.ts answers the same). */
const columnOrder = new Map()
const projectIdOf = (path) => path.match(/\/project\/([^/]+)\/statuses/)?.[1] ?? ""

// Shapes the panel and the toolbar read whose "nothing" is not an empty
// object: an empty object crashed the task panel (`entries.length`) and the
// list's Display menu (`views.find`) in the projects programme's harness
// (design/projects-vs-asana-jira/perf-harness/fakeProjects.mjs, 14 Oct), whose
// shapes these are.
export function workFixtures() {
  return [
    [/\/project\/taskListForKanban\/[^/]+$/, (path, url) => kanban(projectOf(path) ?? BIG_PROJECT, url)],
    [/\/project\/taskList\/[^/]+$/, (path, url) => listPage(projectOf(path) ?? BIG_PROJECT, url)],
    [/\/project\/[^/]+\/timeline$/, (path) => timeline(projectOf(path) ?? BIG_PROJECT)],
    [/\/project\/(info|membersInfo|memberWithAdminFlag)\/[^/]+$/, (path) => ok(projectInfo(projectOf(path) ?? BIG_PROJECT))],
    [/\/project\/[^/]+\/statuses$/, (path) => statuses(projectIdOf(path))],
    [
      /\/project\/[^/]+\/statuses\/order$/,
      (path, url, req) => {
        const id = projectIdOf(path)
        let order = []
        try {
          order = req.postDataJSON()?.order ?? []
        } catch {
          // not JSON: nothing saved
        }
        columnOrder.set(id, order)
        return statuses(id)
      },
    ],
    [/\/task\/views$/, ok([])],
    [/\/task\/(time|recurrence|cycle|clientReview)\/[^/]+$/, ok(null)],
    [/\/project\/[^/]+\/fields$/, ok({ fields: [], can_edit: true })],
    [/\/project\/[^/]+\/tags$/, ok([])],
    [/\/project\/[^/]+\/updates$/, ok({ updates: [], can_post: true })],
    [/\/project\/[^/]+\/goals$/, ok({ goals: [] })],
    [/\/project\/[^/]+\/cycles$/, ok({ cycles: [], can_edit: true })],
    [/\/project\/[^/]+\/views$/, ok({ views: [] })],
    [
      /\/task\/info\/[^/]+$/,
      (path) => {
        const id = path.split("/").pop()
        for (const p of PROJECTS) {
          const i = allTasks(p).findIndex((t) => t.task_uuid === id)
          if (i >= 0) return ok(taskInfo(p, i))
        }
        return ok(taskInfo(BIG_PROJECT, 0))
      },
    ],
    [/\/user\/userProjectList$/, ok(PROJECTS.map(projectInfo))],
    [/\/notices$/, ok({ notices: [] })],
  ]
}

/** The sidebar's own lists for a workspace with projects (chatFixtures' sidebar option). */
export const workSidebar = () => ({ user_projects: PROJECTS.map(projectInfo) })

// ---------------------------------------------------------------------------
// Tables: a 13-field table at 10,000 and 100,000 rows, in the bundle's shape
// (the first 500 rows and the count; rows?offset=&limit= for the rest), from
// the tables programme's harness (design/tables-vs-airtable/perf-harness/
// lib.mjs, 14 Oct). Writes are kept, and the formula (Amount × Qty) is worked
// out again for a row whose Amount or Qty changed, as the server does.
// ---------------------------------------------------------------------------
const fid = (i) => `f1e1d000-0000-4000-8000-${String(i).padStart(12, "0")}`
const VENDORS_ID = "7e57ab1e-0000-4000-8000-000000000002"
const tblOpts = (...ls) => JSON.stringify({ options: ls.map((label, i) => ({ label, color: ["blue", "green", "amber", "red", "teal"][i % 5] })) })
const FIELD_DEFS = [
  ["Name", "text", "{}"],
  ["Amount", "number", "{}"],
  ["Qty", "number", "{}"],
  ["Status", "select", tblOpts("Todo", "Doing", "Blocked", "Done")],
  ["Tags", "multi_select", tblOpts("red", "green", "blue", "gold", "teal")],
  ["Due", "date", "{}"],
  ["Done", "checkbox", "{}"],
  ["Owner", "person", "{}"],
  ["Link", "url", "{}"],
  ["Email", "email", "{}"],
  ["Notes", "text", "{}"],
  ["Total", "formula", JSON.stringify({ formula: "{Amount} * {Qty}", result: "number" })],
  ["Vendor", "relation", JSON.stringify({ relation_target: "table", table_id: VENDORS_ID, two_way: true, inverse_of: "", result: "" })],
]
/** A field's column in the grid, by name. */
export const TABLE_COL = Object.fromEntries(FIELD_DEFS.map(([n], i) => [n, i]))
export const TABLE_FIELD = (name) => fid(TABLE_COL[name])
export const TABLES = [
  { id: "7e57ab1e-0000-4000-8000-000000010000", name: "Deals", rows: 10_000 },
  { id: "7e57ab1e-0000-4000-8000-000000100000", name: "Ledger", rows: 100_000 },
]
const T0 = "2026-10-01T10:00:00Z"
const tableFields = (t) => FIELD_DEFS.map(([name, type, config], i) => ({ id: fid(i), table_id: t.id, name, type, config, position: i, created_at: T0, updated_at: T0 }))
function rowValues(g) {
  const tags = ["red", "green", "blue", "gold", "teal"]
  const amount = Math.round((((g * 7919) % 1000000) / 100) * 100) / 100
  const qty = (g % 7) + 1
  const v = {}
  v[fid(0)] = `Row ${g} ${((g * 2654435761) >>> 0).toString(16)}`
  v[fid(1)] = amount
  v[fid(2)] = qty
  v[fid(3)] = ["Todo", "Doing", "Blocked", "Done"][g % 4]
  v[fid(4)] = [tags[g % 5], tags[(g + 2) % 5]]
  v[fid(5)] = new Date(Date.UTC(2026, 0, 1) + (g % 365) * DAY).toISOString().slice(0, 10)
  v[fid(6)] = g % 3 === 0
  v[fid(7)] = ["Asha Rao", "Ben Ortiz", "Chen Li", "Dana Kim", "Eli Moss"][g % 5]
  v[fid(8)] = `https://example.com/item/${g}`
  v[fid(9)] = `person${g % 997}@example.com`
  v[fid(10)] = `Notes for row ${g}: ` + "lorem ipsum ".repeat((g % 6) + 1)
  v[fid(11)] = Math.round(amount * qty * 100) / 100
  v[fid(12)] = [{ id: `0b0b0b0b-0000-4000-8000-${String(g % 100).padStart(12, "0")}`, label: `V${g % 100}`, type: "table", table_id: VENDORS_ID }]
  return v
}
// Each table's rows have ids of their own (its size in the second group).
const rowId = (t, g) => `0a0a0a0a-${t.id.slice(-8, -4)}-4000-8000-${String(g).padStart(12, "0")}`
/** What a run changed, by row id: the values sent, kept for the next read. */
const edited = new Map()
/** Forgets every write: each run starts from the same table (surfaces.mjs calls it before a run). */
export function resetWorkspace() {
  edited.clear()
  columnOrder.clear()
}
function tableRow(t, g) {
  const id = rowId(t, g)
  const values = { ...rowValues(g), ...(edited.get(id) ?? {}) }
  values[fid(11)] = Math.round(Number(values[fid(1)]) * Number(values[fid(2)]) * 100) / 100
  return { id, table_id: t.id, values: JSON.stringify(values), position: g, created_by: null, created_at: T0, updated_at: T0 }
}
const tableOf = (path) => TABLES.find((t) => path.includes(t.id))
const tableMeta = (t) => ({ id: t.id, name: t.name, description: "", icon: null, visibility: "workspace", created_by: ME.user_uuid, created_at: T0, updated_at: T0 })
function bundle(t) {
  const rows = []
  for (let g = 0; g < Math.min(500, t.rows); g++) rows.push(tableRow(t, g))
  return {
    data: {
      table: tableMeta(t),
      fields: tableFields(t),
      views: [{ id: `${t.id.slice(0, 8)}-0000-4000-8000-0000000000aa`, table_id: t.id, name: "Grid", type: "grid", config: "{}", position: 0, created_at: T0, updated_at: T0 }],
      rows,
      can_manage: true,
      mqtt_topic: `table/${t.id}`,
      rows_truncated: t.rows > 500,
      row_count: t.rows,
    },
  }
}

export function tableFixtures() {
  return [
    [/\/tables\/?$/, (path, url, req) => (req.method() === "GET" ? ok(TABLES.map(tableMeta)) : undefined)],
    [
      /\/tables\/[^/]+\/rows$/,
      (path, url, req) => {
        const t = tableOf(path)
        if (!t) return undefined
        if (req.method() !== "GET") return ok(tableRow(t, t.rows))
        const offset = Number(url.searchParams.get("offset") || 0)
        const limit = Math.min(1000, Number(url.searchParams.get("limit") || 500))
        const ids = url.searchParams.get("ids")
        if (ids) return ok(ids.split(",").map((id) => tableRow(t, Number(id.slice(-12)))))
        const out = []
        for (let g = offset; g < Math.min(t.rows, offset + limit); g++) out.push(tableRow(t, g))
        return ok(out)
      },
    ],
    [
      /\/tables\/[^/]+\/rows\/[^/]+\/(patch|update)$/,
      (path, url, req) => {
        const t = tableOf(path)
        const [, id, how] = /\/rows\/([^/]+)\/(patch|update)$/.exec(path)
        let body = {}
        try {
          body = req.postDataJSON() ?? {}
        } catch {
          /* not JSON */
        }
        const values = body.values ?? {}
        edited.set(id, how === "patch" ? { ...(edited.get(id) ?? {}), ...values } : values)
        return ok(tableRow(t, Number(id.slice(-12))))
      },
    ],
    [/\/tables\/[^/]+\/fields$/, (path) => ok(tableFields(tableOf(path) ?? TABLES[0]))],
    [/\/tables\/[^/]+\/aggregate$/, ok({ groups: [], total: 0 })],
    [/\/tables\/[0-9a-f-]{36}$/, (path, url, req) => (req.method() === "GET" && tableOf(path) ? bundle(tableOf(path)) : undefined)],
  ]
}

// ---------------------------------------------------------------------------
// Calendar: a working week's meetings on any range asked for (GET
// /event/getEvents?startDate=&endDate=), the same events every time for a day:
// a stand-up, two to four meetings, a focus block, and a quiet weekend.
// ---------------------------------------------------------------------------
const MEETINGS = ["Design review", "Launch sync", "1:1 with Maya", "Pricing check-in", "Support triage", "Roadmap planning", "Customer call: Acme", "Hiring loop", "Retro"]
const evId = (day, k) => `e7e70000-0000-4000-8000-${String(day).padStart(8, "0")}${String(k).padStart(4, "0")}`
/** The events of the local day that starts at `dayStart` (ms), numbered by days since 2026-01-01. */
function eventsOfDay(dayStart) {
  const n = Math.round((dayStart - Date.UTC(2026, 0, 1)) / DAY)
  const dow = new Date(dayStart).getDay()
  const at = (h, m) => dayStart + (h * 60 + m) * 60_000
  const ev = (k, title, start, minutes, extra = {}) => ({
    event_uuid: evId(n, k),
    event_title: title,
    event_start_time: new Date(start).toISOString(),
    event_end_time: new Date(start + minutes * 60_000).toISOString(),
    event_created_by: SPEAKERS[(n + k) % SPEAKERS.length],
    event_participants: SPEAKERS.slice(0, 2 + ((n + k) % 3)),
    event_hue: ["sky", "moss", "sun", "dusk", "berry", "lake"][(n + k) % 6],
    ...extra,
  })
  if (dow === 0 || dow === 6) return n % 3 === 0 ? [ev(1, "Run with Jonas", at(8, 0), 60)] : []
  const out = [ev(0, "Stand-up", at(9, 30), 15)]
  const count = 2 + (n % 3)
  for (let k = 0; k < count; k++) out.push(ev(k + 1, MEETINGS[(n * 3 + k) % MEETINGS.length], at(10 + k * 2, k % 2 ? 30 : 0), k % 2 ? 30 : 60))
  out.push(ev(9, "Focus: launch notes", at(15, 0), 90, { event_is_focus: true }))
  return out
}
export function calendarFixtures() {
  return [
    [
      /\/event\/getEvents$/,
      (path, url) => {
        const from = Date.parse(url.searchParams.get("startDate") || new Date().toISOString())
        const to = Date.parse(url.searchParams.get("endDate") || new Date(from + 7 * DAY).toISOString())
        const out = []
        const first = new Date(from)
        first.setHours(0, 0, 0, 0)
        for (let d = first.getTime(); d < to; d += DAY) {
          const day = new Date(d)
          day.setHours(0, 0, 0, 0)
          out.push(...eventsOfDay(day.getTime()))
        }
        return ok(out)
      },
    ],
    [
      /\/event\/getEvent\/[^/]+$/,
      (path) => {
        const id = path.split("/").pop()
        const n = Number(id.slice(-12, -4))
        const day = new Date(Date.UTC(2026, 0, 1) + n * DAY)
        day.setHours(0, 0, 0, 0)
        return ok(eventsOfDay(day.getTime()).find((e) => e.event_uuid === id) ?? eventsOfDay(day.getTime())[0])
      },
    ],
  ]
}

// ---------------------------------------------------------------------------
// The shell: the activity feed (mentions in the channels, 20 a page), search
// answers drawn from the workspace's tasks, channels and messages, and the
// tasks assigned to the signed-in person (Home's "What needs me now").
// ---------------------------------------------------------------------------
function mention(i) {
  const c = CHANNELS[1 + (i % 5)]
  const p = post(c, i + 1)
  const time = new Date(NOW - i * 23 * 60_000).toISOString()
  return {
    activity_type: "MENTION",
    id: `a7c10000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    time,
    priority: i % 7 === 0 ? "high" : "normal",
    actor_kind: "person",
    mention: {
      uid: `0x${(900000 + i).toString(16)}`,
      mention_users: [ME],
      mention_chat_uuid: "",
      mention_post_uuid: p.post_uuid,
      mention_comment_uuid: "",
      mention_post: { ...p, post_text: `<p>@Sam Rivera ${BODIES[i % BODIES.length].replace(/<[^>]+>/g, " ").trim()}</p>`, post_channel: channelInfo(c) },
      mention_created_at: time,
      mention_updated_at: time,
    },
  }
}
const ACTIVITY = Array.from({ length: 200 }, (_, i) => mention(i))
function activityPage(url) {
  const limit = Number(url.searchParams.get("limit") || 20)
  const before = url.searchParams.get("beforeTime")
  const from = before ? ACTIVITY.findIndex((a) => a.time < before) : 0
  const page = from < 0 ? [] : ACTIVITY.slice(from, from + limit)
  return ok({ activities: page, has_more: from >= 0 && from + limit < ACTIVITY.length })
}
function searchAnswer(text) {
  const q = text.toLowerCase()
  const tasks = allTasks(BIG_PROJECT)
    .filter((t) => t.task_name.toLowerCase().includes(q))
    .slice(0, 12)
    .map((t) => ({ type: "task", task: { task_id: t.task_uuid, task_uuid: t.task_uuid, task_name: t.task_name, task_project_id: BIG_PROJECT.id, task_project_name: BIG_PROJECT.name } }))
  const channels = CHANNELS.filter((c) => c.name.includes(q)).map((c) => ({ type: "channel", channel: channelInfo(c) }))
  const posts = CHANNELS.slice(1)
    .flatMap((c) => Array.from({ length: 6 }, (_, i) => post(c, i)))
    .filter((p) => p.post_text.toLowerCase().includes(q))
    .slice(0, 8)
    .map((p) => ({ type: "post", post: p }))
  return ok({ page: [...channels, ...tasks, ...posts], has_more: false })
}
export function shellFixtures() {
  return [
    [/\/activity\/unified$/, (path, url) => activityPage(url)],
    [/\/search\/unifiedSearch\/.+$/, (path) => searchAnswer(decodeURIComponent(path.split("/unifiedSearch/")[1] || ""))],
    [
      /\/user\/assignedTaskList$/,
      (path, url) => {
        const size = Number(url.searchParams.get("pageSize") || 500)
        const mine = allTasks(BIG_PROJECT).filter((t) => t.task_assignee.user_uuid === ME.user_uuid)
        return { msg: "ok", pageCount: Math.ceil(mine.length / size), data: { ...ME, user_tasks: mine.slice(0, size), user_task_count: mine.length } }
      },
    ],
  ]
}

// ---------------------------------------------------------------------------
// Docs: the page tree (fluid-06), as GET /doc/children answers it, one level
// at a time up to the limit asked for: 40 pages at the top of the workspace,
// three of them big (120, 60 and 300 pages under them; the 60 hold a path six
// levels deep), about 2,000 pages in all, 24 pages shared with Sam and 30
// private ones. A level Sam can't wholly open counts what it hides (never
// names it). A third of the pages have an emoji, as a real sidebar's do. GET
// /doc/ancestors is the path down to a page, the top first. The pages a step
// opens are real docs (PAGE_TREE.opens: the group gives them a body and a
// live copy).
// ---------------------------------------------------------------------------
const pgId = (n) => `9a6e0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const TOP_PAGES = ["Handbook", "Engineering", "Product specs", "Design system", "Marketing", "Sales playbook", "Customer success", "Hiring", "Finance", "Legal", "Meeting notes", "Roadmap 2026", "OKRs", "Incident reviews", "Launch checklist", "Brand", "Onboarding", "Security", "Data", "Research", "Partnerships", "Support macros", "Pricing", "Release notes", "Team rituals", "Offsite 2026", "Board updates", "Investor notes", "Office", "IT", "Benefits", "Travel", "Events", "Press", "Writing style", "API", "Mobile", "Desktop", "Integrations", "Archive"]
const SUBJECTS = ["Getting started", "How we work", "Time off", "Expenses", "Equipment", "Code of conduct", "Security basics", "Tools we use", "Who to ask", "Weekly sync", "Decisions", "Templates", "Checklist", "FAQ", "Glossary", "Playbook", "Postmortem", "Proposal", "Notes", "Plan"]
const EMOJI = ["📘", "🛠️", "📐", "🎨", "📣", "💼", "🤝", "🧭", "💰", "⚖️", "🗒️", "🗺️", "🎯", "🚨", "🚀", "🔒", "📊", "🔬"]
// The path six levels deep, under Engineering.
const DEEP = ["Services", "Payments", "Runbooks", "Card retries", "Timeline"]
const PAGES = new Map()
const SPACE_TOPS = { workspace: { kids: [], hidden: 0 }, shared: { kids: [], hidden: 0 }, private: { kids: [], hidden: 0 } }
let pageCount = 0
function addPage(space, parent, title) {
  const n = ++pageCount
  const p = { id: pgId(n), n, space, parent: parent?.id ?? null, title, icon: n % 3 === 0 ? EMOJI[n % EMOJI.length] : "", kids: [], hidden: 0 }
  PAGES.set(p.id, p)
  ;(parent ?? SPACE_TOPS[space]).kids.push(p.id)
  return p
}
const nth = (j) => `${SUBJECTS[j % SUBJECTS.length]}${j >= SUBJECTS.length ? ` ${Math.floor(j / SUBJECTS.length) + 1}` : ""}`
/** A page's children, and theirs, to `depth` more levels, as many as `many(j, depth)` says. */
function grow(space, parent, count, depth, many) {
  for (let j = 0; j < count; j++) {
    const p = addPage(space, parent, nth(j))
    if (depth > 0) grow(space, p, many(j, depth), depth - 1, many)
  }
}
const someKids = (j, depth) => (depth >= 2 ? (j % 7 === 0 ? 6 : j % 5 === 0 ? 3 : 0) : j % 4 === 0 ? 2 : 0)
TOP_PAGES.forEach((title, i) => {
  const p = addPage("workspace", null, title)
  const count = [120, 60, 300][i] ?? [12, 0, 3, 6, 0, 3][i % 6]
  if (title === "Engineering") {
    let at = p
    for (const t of DEEP) at = addPage("workspace", at, t)
  }
  grow("workspace", p, count, 2, someKids)
})
PAGES.get(SPACE_TOPS.workspace.kids[0]).hidden = 2
PAGES.get(SPACE_TOPS.workspace.kids[2]).hidden = 5
for (let j = 0; j < 24; j++) grow("shared", addPage("shared", null, `${PEOPLE[j % PEOPLE.length].user_full_name.split(" ")[0]}'s ${SUBJECTS[(j * 3) % SUBJECTS.length].toLowerCase()}`), j % 4 === 0 ? 3 : 0, 0, () => 0)
for (let j = 0; j < 30; j++) grow("private", addPage("private", null, `My ${SUBJECTS[(j * 7) % SUBJECTS.length].toLowerCase()}${j >= 10 ? ` ${Math.floor(j / 10) + 1}` : ""}`), j % 5 === 0 ? 4 : 0, 1, () => 0)
const pageNode = (p) => ({
  kind: "doc",
  uuid: p.id,
  parent_uuid: p.parent ?? "",
  position: String(p.n).padStart(8, "0"),
  title: p.title,
  icon: p.icon,
  has_children: p.kids.length > 0,
  can_edit: true,
  private: p.space === "private",
  updated_at: at(p.n % 400),
})
const topIds = SPACE_TOPS.workspace.kids
const byTitle = (t) => [...PAGES.values()].find((p) => p.title === t && !p.parent)
/** What the page tree's steps reach for: the big pages, the last at the top, the pages opened. */
export const PAGE_TREE = {
  pages: PAGES.size,
  handbook: byTitle("Handbook"),
  engineering: byTitle("Engineering"),
  top: topIds.map((id) => PAGES.get(id)),
  // Opened from the tree: a page at the top, and one under the Handbook.
  opens: [byTitle("Launch checklist"), PAGES.get(PAGES.get(topIds[0]).kids[2])],
}
function childrenAnswer(url) {
  const parent = url.searchParams.get("parent")
  const space = url.searchParams.get("space") || "workspace"
  const limit = Math.max(1, Number(url.searchParams.get("limit") || 50))
  const level = parent ? PAGES.get(parent) : SPACE_TOPS[space]
  const kids = level?.kids ?? []
  return ok({ parent: parent ?? "", ...(parent ? {} : { space }), nodes: kids.slice(0, limit).map((id) => pageNode(PAGES.get(id))), hidden: level?.hidden ?? 0, count: kids.length })
}
function ancestorsAnswer(id) {
  const path = []
  for (let p = PAGES.get(PAGES.get(id)?.parent ?? ""); p; p = PAGES.get(p.parent ?? "")) path.unshift(pageNode(p))
  return ok({ ancestors: path, truncated: false })
}
export function pageFixtures() {
  return [
    [/\/doc\/children$/, (path, url) => childrenAnswer(url)],
    [/\/doc\/ancestors\/[^/]+$/, (path) => ancestorsAnswer(path.split("/").pop())],
  ]
}
