// A project's releases (P10-1b web; jira-04, linear-36): the shapes the API
// answers (business/Release/contract.go and models/postgres/Release), its
// calls, and the words a release is shown in. Members read; the project's
// admins change (can_edit, from the server). Pure, and none of the shared
// core: the Releases tab's chunk takes it, and every call goes through the
// HTTP client the page hands it (components/work/releases/ReleasesTab).

import type { AxiosInstance } from "axios"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { shortDate } from "@/lib/utils/date/dateWords"
import type { Burndown } from "@/lib/tasks/cycleBurndown"
import { browserTZ, dayDate, localDay } from "@/lib/utils/timeZone"
import { releasesPath } from "@/lib/work/releaseFilter"

/** migration 580's bounds. */
export const NAME_MOST = 120
export const NOTES_MOST = 20_000

export type ReleaseState = "planned" | "released"

/** What a repository's build or deploy last said about a release. */
export interface ReleaseStage {
  provider: string
  repo: string
  kind: "build" | "deploy"
  /** The workflow, or the environment. */
  name: string
  status: string
  sha: string
  url: string
  reported_at: string
}

/** A task in a release, as its reader may see it, and how it came to be there. */
export interface ReleaseTask {
  task_uuid: string
  task_key?: string
  task_name: string
  task_status: string
  source: "manual" | "git"
  added_at: string
}

export interface Release {
  id: string
  project_id: string
  name: string
  state: ReleaseState
  /** A day, "2006-01-02", or null. */
  target_date: string | null
  released_at: string | null
  /** The repository and tag it ships as; "" for a release made by hand. */
  repo: string
  tag: string
  notes: string
  progress: { total: number; started: number; done: number }
  /** Its open tasks the reader sees (jira-04): what Mark released offers to move. */
  unfinished?: number
  /** Its tasks: the read of one release only. */
  tasks?: ReleaseTask[]
  stages: ReleaseStage[]
  /** Whether the reader runs its project, whose admins change it. */
  can_edit: boolean
}

export interface ReleaseListing {
  releases: Release[]
  /** Whether the reader may make one. */
  can_edit: boolean
  next_cursor: string
}

/** What adding tasks did: those put in, those already in, and those refused, each with why. */
export interface ReleaseAdded {
  added: string[]
  already: string[]
  refused: { task_uuid: string; msg: string }[]
}

export { NO_RELEASE, TASK_RELEASE, releaseFilterOptions, releaseFilterWords, releasesPath } from "@/lib/work/releaseFilter"
export const releasePath = (projectId: string, id: string) => `${releasesPath(projectId)}/${id}`
/** Its burndown by day in the reader's zone (jira-04): the cycle burndown's shape, ideal* null with no target day. */
export const releaseBurndownPath = (projectId: string, id: string, tz: string = browserTZ()) => `${releasePath(projectId, id)}/burndown?tz=${encodeURIComponent(tz)}`

export interface ReleaseBurndown {
  release: Release
  burndown: Burndown
}

/** A task's Release field (jira-04): the releases of its project it is in, those it could be in (the newest 100), whether the reader
 * may set it (it may edit the task, in a project not archived) and also change a release that's out (the project's admins). */
export interface TaskReleases {
  releases: Release[]
  options: Release[]
  can_edit: boolean
  can_change_released: boolean
}
export const taskReleasePath = (taskUUID: string) => `/task/release/${taskUUID}`
/** POST /task/release: the whole set ([] takes it out of every one); the answer is the field again. */
const SET_TASK_RELEASE = "/task/release"

/** A task's Release field through the panel's client: read, and set as a whole; each quiet, the row says a refusal. */
export function taskReleaseCalls(http: ReleaseHttp) {
  return {
    get: async (taskUUID: string) => (await http.get<{ data: TaskReleases }>(taskReleasePath(taskUUID), OWN_ERRORS)).data.data,
    set: async (taskUUID: string, ids: string[]) =>
      (await http.post<{ data: TaskReleases }>(SET_TASK_RELEASE, { task_uuid: taskUUID, release_ids: ids }, OWN_ERRORS)).data.data,
  }
}

/** Mark released's move_to that takes a release's unfinished tasks out of any release (POST .../ship). */
export const SHIP_TAKE_OUT = "none"

/** The page's HTTP client, as the releases use it. */
export type ReleaseHttp = Pick<AxiosInstance, "get" | "post">

/** A release's changes: name, target day ("" takes it away) and notes, only those given. */
export type ReleaseEdit = Partial<{ name: string; target_date: string; notes: string }>

/** The release calls of one project, each quiet: the tab says a failure in place. */
export function releaseCalls(http: ReleaseHttp, projectId: string) {
  const at = (id: string, what = "") => `${releasePath(projectId, id)}${what}`
  const post = async <T = unknown>(path: string, body: object = {}) => (await http.post<{ data: T }>(path, body, OWN_ERRORS)).data.data
  return {
    list: async (cursor = "") => (await http.get<{ data: ReleaseListing }>(releasesPath(projectId) + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), OWN_ERRORS)).data.data,
    get: async (id: string) => (await http.get<{ data: Release }>(at(id), OWN_ERRORS)).data.data,
    burndown: async (id: string) => (await http.get<{ data: ReleaseBurndown }>(releaseBurndownPath(projectId, id), OWN_ERRORS)).data.data,
    create: (name: string, targetDate: string) => post<Release>(releasesPath(projectId), { name, target_date: targetDate || null, notes: "" }),
    edit: (id: string, e: ReleaseEdit) => post(at(id, "/edit"), e),
    /** Marks it released; its unfinished tasks stay in it, or move to `moveTo` (another release's id, or SHIP_TAKE_OUT). */
    ship: (id: string, moveTo?: string) => post<{ moved: number }>(at(id, "/ship"), moveTo ? { move_to: moveTo } : {}),
    /** Soft: it comes back through POST /restore/release/{id} (services/restoreService). */
    remove: (id: string) => post(at(id, "/delete")),
    addTasks: (id: string, taskIds: string[]) => post<ReleaseAdded>(at(id, "/tasks"), { task_uuids: taskIds }),
    removeTask: (id: string, taskId: string) => post(at(id, `/tasks/${taskId}/remove`)),
    /** The AI edition's draft from its tasks and their pull requests; nothing is saved until the notes are. */
    draftNotes: async (id: string) => (await post<{ notes: string }>(at(id, "/notes/draft"))).notes,
  }
}
export type ReleaseCalls = ReturnType<typeof releaseCalls>

/** How a stage stands, from what its provider said: done, failed, or still under way. */
export type StageTone = "ok" | "failed" | "running"
const OK = new Set(["success", "succeeded", "completed", "complete", "active", "deployed", "passed"])
const FAILED = new Set(["failure", "failed", "error", "errored", "cancelled", "canceled", "timed_out", "action_required", "startup_failure"])
export function stageTone(status: string): StageTone {
  const s = status.toLowerCase()
  return OK.has(s) ? "ok" : FAILED.has(s) ? "failed" : "running"
}

/** What a provider's status says, per kind, in a person's words; a status not listed reads as sent ("_" as spaces). */
const BUILD_WORDS: Record<string, string> = {
  success: "passed", succeeded: "passed", completed: "passed", complete: "passed", passed: "passed",
  failure: "failed", failed: "failed", error: "failed", errored: "failed", timed_out: "failed", startup_failure: "failed",
  in_progress: "running", running: "running", queued: "queued", pending: "queued", waiting: "queued", requested: "queued",
  cancelled: "cancelled", canceled: "cancelled",
}
const DEPLOY_WORDS: Record<string, string> = {
  success: "live", active: "live", deployed: "live",
  failure: "failed", failed: "failed", error: "failed", errored: "failed",
  in_progress: "deploying", deploying: "deploying", queued: "queued", pending: "queued", waiting: "queued",
}
export function stageWords({ kind, status }: Pick<ReleaseStage, "kind" | "status">): string {
  const s = status.toLowerCase()
  return (kind === "deploy" ? DEPLOY_WORDS : BUILD_WORDS)[s] ?? s.replace(/_/g, " ")
}

/** A stage's line in sentence case: "CI passed", "Staging deploying", "Production failed". */
export function stageLine(stage: Pick<ReleaseStage, "kind" | "status" | "name">): string {
  const line = `${stage.name} ${stageWords(stage)}`
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** Each kind's last word, build then deploy, for a row's chips: the newest report of each kind and name. */
export function latestStages(stages: ReleaseStage[]): ReleaseStage[] {
  const newest = new Map<string, ReleaseStage>()
  for (const s of stages) {
    const key = `${s.kind}\u0000${s.name}`
    const had = newest.get(key)
    if (!had || had.reported_at < s.reported_at) newest.set(key, s)
  }
  return [...newest.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "build" ? -1 : 1))
}

/** Its target day in words ("14 Nov"), late when the day has gone by and it isn't out; null without one. */
export function targetWords(r: Pick<Release, "target_date" | "state">, now: Date = new Date()): { text: string; late: boolean } | null {
  const day = dayDate(r.target_date)
  if (!day) return null
  return { text: shortDate(day, now), late: r.state === "planned" && r.target_date! < localDay(now) }
}

/** Its tasks done of all, as a row and the sheet say it: "3 of 8 done", "No tasks yet". */
export const doneWords = (p: Release["progress"]) => (p.total ? `${p.done} of ${p.total} done` : "No tasks yet")
