"use client"

/**
 * Tasks, the Offline Store's first kind (projects P7-1, asana-12 and jira-12).
 *
 * Kept: the project's task lists (list and board), My Tasks (list and board)
 * and a task's own page, as each was last read. Queued while offline: a
 * task's name, status (a board move too), priority, start and due dates,
 * estimate, points and assignee: changes that set a field, so sending one
 * late does what it did then. Creating a task or a comment offline is the next step (P7-1c): the
 * server already makes a create sent again under its Idempotency-Key once
 * (P7-1b, router.TaskCreates), and the outbox holds a create's dependents.
 */

import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { KindSpec } from "@/lib/offline/store"
import { isBuiltInStatus, statusValueOf } from "@/lib/taskStatus"
import { taskFromCreate } from "@/lib/tasks/fromCreate"
import { commentFrom } from "@/lib/tasks/newComment"
import { withNewTask } from "@/lib/tasks/taskLists"
import { TASK_POINTS_WRITE } from "@/lib/work/points"
import type { UserProfileDataInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"

export const TASK = "task"
/** A task's comment: made offline, it waits on its task's create when that was made offline too. */
export const COMMENT = "comment"
/** A project as read here: what the member may do in it (its board or list), and its estimate scale (a task's page) (asana-12). */
export const PROJECT = "project"

export { OFFLINE_ID, madeOffline } from "@/lib/offline/offlineId"

/** A create kept while offline (P7-1c): what it makes, the task it hangs off, and what it is until it's made. */
export interface CreateSpec {
  kind: string
  /** The task it hangs off: a comment's task, a sub-task's parent. */
  parentOf(body: Record<string, unknown>): string | undefined
  /**
   * What the create is answered with until the server makes it, in the shape
   * the server answers it: under the device's id, made at at.
   */
  entity(id: string, body: Record<string, unknown>, at: number): Record<string, unknown>
}

const named = (v: unknown) => (typeof v === "string" && v ? v : undefined)

/** A task as the lists and its page show it (lib/tasks/fromCreate), as the screens' own copy does. */
const madeTask = (id: string, body: Record<string, unknown>, at: number) => taskFromCreate(id, body, at) as unknown as Record<string, unknown>

export const TASK_CREATES: Record<string, CreateSpec> = {
  [PostEndpointUrl.CreateTask]: { kind: TASK, parentOf: () => undefined, entity: madeTask },
  // A sub-task's create names its parent as task_uuid; what it makes is a task of its own.
  [PostEndpointUrl.CreateSubTask]: { kind: TASK, parentOf: (body) => named(body.task_uuid), entity: madeTask },
  // The server answers a comment with its id and when it was made: the composer lists it so.
  [PostEndpointUrl.CreateTaskComment]: {
    kind: COMMENT,
    parentOf: (body) => named(body.task_uuid),
    entity: (id, _body, at) => ({ comment_id: id, comment_created_at: new Date(at).toISOString() }),
  },
}

/** The fields an answer shows for a task: any object with a task_uuid, at any depth. */
export function tasksIn(answer: unknown, depth = 0, out: { id: string; value: Record<string, unknown> }[] = []) {
  if (depth > 6 || answer === null || typeof answer !== "object") return out
  if (Array.isArray(answer)) {
    for (const item of answer) tasksIn(item, depth + 1, out)
    return out
  }
  const obj = answer as Record<string, unknown>
  if (typeof obj.task_uuid === "string" && obj.task_uuid) {
    const value: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      // The task's own fields, not the lists inside it (sub-tasks are found as tasks of their own).
      if (!Array.isArray(v)) value[k] = v
    }
    out.push({ id: obj.task_uuid, value })
  }
  for (const v of Object.values(obj)) if (v && typeof v === "object") tasksIn(v, depth + 1, out)
  return out
}

export const taskKind: KindSpec = { kind: TASK, entitiesOf: (answer) => tasksIn(answer) }

/** The project fields that say what the member may do in it (Work Access, A1), and nothing else of it. */
const ACCESS_FIELDS = ["project_access", "project_is_admin", "project_is_member"] as const

/** A project's estimate scale (linear-05), as a task's page brings it: its "estimates" part (lib/work/panelIncludes). */
const SCALE = "estimates"

/**
 * The project an answer says something of, for a task made here (asana-12):
 * - a board or list answer, when it says what the member may do there
 *   (project_access): that, as the server said it, so a task made here offers
 *   the same and never more;
 * - a task's page, when its project's estimate scale came with it (null: the
 *   project estimates in hours): that, so a task made here has the Points row
 *   the project gives. Nothing else of the page: never its access.
 */
export function projectsIn(answer: unknown): { id: string; value: Record<string, unknown> }[] {
  const a = answer as { data?: unknown; included?: Record<string, { data?: unknown } | undefined> } | null | undefined
  const data = a?.data
  if (!data || typeof data !== "object" || Array.isArray(data)) return []
  const p = data as Record<string, unknown>
  const pageOf = (p.task_project as { project_uuid?: unknown } | null | undefined)?.project_uuid
  if (typeof p.task_uuid === "string" && typeof pageOf === "string" && pageOf) {
    // A part that failed comes as {error}: nothing is kept, and what was kept before stands.
    const scale = a?.included?.[SCALE]?.data
    return scale && typeof scale === "object" ? [{ id: pageOf, value: { project_uuid: pageOf, [SCALE]: { data: scale } } }] : []
  }
  if (typeof p.project_uuid !== "string" || !p.project_uuid || !p.project_access || typeof p.project_access !== "object") return []
  const value: Record<string, unknown> = { project_uuid: p.project_uuid }
  for (const k of ACCESS_FIELDS) if (k in p) value[k] = p[k]
  return [{ id: p.project_uuid, value }]
}

export const projectKind: KindSpec = { kind: PROJECT, entitiesOf: projectsIn }

/**
 * The page of a task made here, with its project as kept (projectsIn): the
 * panel's comment box and edits then follow the member's role there, as the
 * server's own answer would, and its Points row has the project's scale, as
 * the page's own estimates part (lib/work/panelIncludes seeds it). Unchanged
 * when nothing was kept for that project, so no access or scale is made up;
 * the Points row then says to set points once back online.
 */
export function withKeptProject(answer: unknown, project: Record<string, unknown> | undefined): unknown {
  const a = answer as { data?: Record<string, unknown>; included?: Record<string, unknown> } | null | undefined
  const data = a?.data
  const own = data?.task_project as Record<string, unknown> | undefined
  if (!project || !data || !own || own.project_uuid !== project.project_uuid) return answer
  const kept: Record<string, unknown> = {}
  for (const k of ACCESS_FIELDS) if (k in project) kept[k] = project[k]
  const out: Record<string, unknown> = { ...(answer as Record<string, unknown>), data: { ...data, task_project: { ...own, ...kept } } }
  if (project[SCALE] && !a?.included?.[SCALE]) out.included = { ...a?.included, [SCALE]: project[SCALE] }
  return out
}

/** The project a made task's page names, if any. */
export function projectOfPage(answer: unknown): string | undefined {
  const id = (answer as { data?: { task_project?: { project_uuid?: unknown } } } | null | undefined)?.data?.task_project?.project_uuid
  return typeof id === "string" && id ? id : undefined
}

/** A change that sets one field: which payload key carries it, and how to read it off a task. */
export interface FieldWrite {
  field: string
  payloadKey: string
  read(task: Record<string, unknown>): unknown
}

const plain = (field: string): FieldWrite => ({ field, payloadKey: field, read: (t) => t[field] ?? "" })

// A status is written as the picker's value: a project's own status by its
// id, a built-in one by its key. Read the same way off any answer (a list's
// or the task's own), so a move between two of a project's statuses of one
// kind is still seen.
const status: FieldWrite = { field: "task_status", payloadKey: "task_status", read: (t) => statusValueOf(t) }

export const TASK_WRITES: Record<string, FieldWrite> = {
  [PostEndpointUrl.UpdateTaskName]: plain("task_name"),
  [PostEndpointUrl.UpdateTaskStatus]: status,
  // A card moved on a board: its column (a status) and its place between two cards.
  [PostEndpointUrl.MoveTask]: status,
  [PostEndpointUrl.UpdateTaskPriority]: plain("task_priority"),
  [PostEndpointUrl.UpdateTaskStartDate]: plain("task_start_date"),
  [PostEndpointUrl.UpdateTaskDueDate]: plain("task_due_date"),
  // An estimate set with the task's create (the create form's) waits behind it.
  [PostEndpointUrl.UpdateTaskEstimate]: plain("task_estimate_minutes"),
  // Points on the project's scale (linear-05), a task made offline's too.
  [TASK_POINTS_WRITE]: plain("task_estimate_points"),
  [PostEndpointUrl.UpdateTaskAssignee]: {
    field: "task_assignee",
    payloadKey: "task_assignee_uuid",
    read: (t) => ((t.task_assignee as { user_uuid?: string } | undefined)?.user_uuid ?? ""),
  },
}

/** Where a task's current fields are read before a waiting change is sent. */
export function taskInfoUrl(id: string): string {
  return `${GetEndpointUrl.GetTaskInfo}/${id}`
}

/** Two field values the same, as the server writes them ("" and null are both "none"). */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
  return norm(a) === norm(b)
}

/**
 * An answer kept from before, with the member's own waiting changes laid
 * over it, so a list read from the device shows what they changed. A field
 * the answer can't show as the change has it (an assignee is a person, the
 * change only their id) is left as it was.
 */
export function overlay(answer: unknown, changes: { id: string; field: string; value: unknown }[]): unknown {
  if (!changes.length) return answer
  const byTask = new Map<string, Record<string, unknown>>()
  for (const c of changes) {
    if (c.field === "task_assignee") continue
    const value = String(c.value ?? "")
    // A project's own status is the task's custom status; its kind is unknown here, so the task keeps its own.
    const patch =
      c.field === "task_status"
        ? isBuiltInStatus(value)
          ? { task_status: value, task_custom_status: "", task_custom_status_name: "" }
          : { task_custom_status: value, task_custom_status_name: "" }
        : { [c.field]: c.value }
    byTask.set(c.id, { ...(byTask.get(c.id) ?? {}), ...patch })
  }
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 6 || v === null || typeof v !== "object") return v
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1))
    const obj = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(obj)) out[k] = walk(x, depth + 1)
    const patch = typeof obj.task_uuid === "string" ? byTask.get(obj.task_uuid) : undefined
    return patch ? { ...out, ...patch } : out
  }
  return walk(answer, 0)
}

/** A create still waiting, as the answers show what it makes. */
export interface WaitingCreate {
  /** The route it goes to: which create it is. */
  endpoint: string
  /** The device's id for what it makes. */
  id: string
  payload: unknown
  /** When it was made. */
  at: number
}

const taskInfoOf = (url: string): string | undefined => {
  const path = url.split("?")[0]
  const prefix = `${GetEndpointUrl.GetTaskInfo}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) || undefined : undefined
}

/** The answer with item last in its task's list, once. */
function withItem(answer: unknown, list: string, item: Record<string, unknown>, idKey: string): unknown {
  const a = answer as { data?: Record<string, unknown> } | null | undefined
  if (!a?.data || typeof a.data !== "object") return answer
  const items = Array.isArray(a.data[list]) ? (a.data[list] as Record<string, unknown>[]) : []
  if (items.some((x) => x?.[idKey] === item[idKey])) return answer
  return { ...a, data: { ...a.data, [list]: [...items, item] } }
}

/**
 * An answer (kept from before, or built for a task made on this device) with
 * what the member made since that still waits, in the order made: a task at
 * the top of each list that shows it (lib/tasks/taskLists, as the screens add
 * one), and a sub-task and a comment under the task they hang off. member is
 * whose My Tasks these are; author is the member as a comment names its writer.
 */
export function withCreates(
  url: string,
  answer: unknown,
  creates: WaitingCreate[],
  ctx: { member?: string; author?: UserProfileDataInterface },
): unknown {
  const under = taskInfoOf(url)
  let out = answer
  for (const c of creates) {
    const body = (c.payload ?? {}) as Record<string, unknown>
    if (c.endpoint === PostEndpointUrl.CreateTask) {
      if (!under) out = withNewTask(url, out as { data?: Record<string, unknown> }, taskFromCreate(c.id, body, c.at), { member: ctx.member })
      continue
    }
    if (!under || named(body.task_uuid) !== under) continue
    if (c.endpoint === PostEndpointUrl.CreateSubTask) {
      out = withItem(out, "task_sub_tasks", madeTask(c.id, body, c.at), "task_uuid")
    } else if (c.endpoint === PostEndpointUrl.CreateTaskComment) {
      const comment = commentFrom({
        id: c.id,
        text: typeof body.task_comment_body === "string" ? body.task_comment_body : "",
        by: ctx.author ?? ({ user_uuid: ctx.member ?? "" } as UserProfileDataInterface),
        createdAt: new Date(c.at).toISOString(),
        attachments: Array.isArray(body.task_comment_attachments) ? (body.task_comment_attachments as AttachmentMediaReq[]) : [],
      })
      out = withItem(out, "task_comments", comment as unknown as Record<string, unknown>, "comment_uuid")
    }
  }
  return out
}

/** What the device answers about a task it made: nothing is on the server for it yet. */
export const KEPT_HERE = "Kept on this device"

/**
 * The task page's answer for a task made on this device whose create still
 * waits, built from that create; undefined for anything else. The panel's own
 * reads of a task (lib/work/panelIncludes) come with it, empty, as a new
 * task's are, so none is asked of the server under the device's id.
 */
export function madeHere(url: string, creates: WaitingCreate[]): unknown {
  const id = taskInfoOf(url)
  const c = id ? creates.find((x) => x.id === id && (x.endpoint === PostEndpointUrl.CreateTask || x.endpoint === PostEndpointUrl.CreateSubTask)) : undefined
  if (!c) return undefined
  const none = { data: null }
  return {
    msg: KEPT_HERE,
    data: madeTask(c.id, (c.payload ?? {}) as Record<string, unknown>, c.at),
    included: { cycle: none, recurrence: none, client_review: none, time_summary: none },
  }
}
