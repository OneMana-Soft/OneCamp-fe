/**
 * The projects programme's shapes on the web (PROGRAM.md §5): what its Wave A
 * packages build against in parallel. A task and a project are today's
 * (types/task, types/project) until the Task Store (A5) brings its own.
 */

import type { ProjectInfoInterface } from "@/types/project"
import type { TaskInfoInterface } from "@/types/task"

export type { QuerySpec } from "@/lib/querySpec/types"

/** A task as the web reads it today. */
export type WorkTask = TaskInfoInterface

/** A project as the web reads it today. */
export type WorkProject = ProjectInfoInterface

/** Someone's role in a project (A1). */
export type Role = "admin" | "member" | "commenter" | "viewer"

/**
 * What the server says someone may do in a project (A1's project_access):
 * never a guess the web makes. "assigned" changes only the tasks assigned to
 * them; "own" deletes only the tasks they made. manage is the project's
 * settings; manage_people who is in it and their roles; archive taking it
 * away and back (its team's admins have the last two without being in it).
 */
export interface WorkAccess {
  role: Role | ""
  view: boolean
  comment: boolean
  create_tasks: boolean
  edit_tasks: "all" | "assigned" | "none"
  delete_tasks: "all" | "own" | "none"
  log_time: boolean
  post_updates: boolean
  add_files: boolean
  manage: boolean
  manage_people: boolean
  archive: boolean
  /** For each status with a rule on who moves tasks there, whether they may (a board's read only; mayMoveInto). */
  move_into?: Record<string, boolean>
}

/** What the server says someone may do with one task (A1's task_access). */
export interface TaskAccess {
  edit: boolean
  delete: boolean
  comment: boolean
  log_time: boolean
  /** May choose who sees it (WA2). */
  restrict?: boolean
}

type Flag = boolean | number | null
type Person = { user_uuid?: string } | null

/** A project as a read carries it for the reader (lib/work/access). */
export interface ProjectLike {
  project_access?: WorkAccess | null
  project_is_admin?: Flag
  project_is_member?: Flag
  project_team?: { team_is_admin?: Flag } | null
}

/** A task as a read carries it for the reader (lib/work/access). */
export interface TaskLike {
  task_access?: TaskAccess | null
  task_project?: ProjectLike | null
  task_assignee?: Person
  task_created_by?: Person
}

/** Who may change a project's tasks (projects.edit.who). */
export type EditWho = "members" | "assigned" | "admins"

/** What one op changes (business/TaskWriter's OpKind). */
export type OpKind =
  | "name"
  | "description"
  | "status"
  | "assignee"
  | "priority"
  | "tags"
  | "start"
  | "due"
  | "estimate"
  | "field"
  | "parent"
  | "relation"
  | "rank"
  | "cycle"
  | "project"
  | "delete"
  | "restore"

/** One change to a task, as the Task Writer takes it. */
export interface Op {
  op: OpKind
  value?: unknown
}

/** One numbered entry of the Work Change Log (A3), as its feed answers it. */
export interface Change {
  sequence: number
  resource_kind: string
  resource_uuid: string
  diff?: Record<string, unknown>
  actor?: string
  source?: string
  at: string
  tombstone?: boolean
}
