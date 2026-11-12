/**
 * The work hierarchy (jira-01 J-H; backend business/Task taskLink.go and
 * hierarchy.go): a task's typed links to other tasks, and the epic it is in.
 * Each call leaves its failure to its screen (OWN_ERRORS), which says the
 * server's words.
 */
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { isTaskThere } from "@/lib/work/hiddenTask"
import type { TaskWorkType } from "@/types/task"

/** A link's kind. Blocking is none: it is a dependency, which moves dates. */
export type LinkKind = "relates" | "duplicates" | "clones"

/** The task on a link's other end, as GET /task/{id}/links sends it: only ever one the reader may see. */
export interface LinkedTask {
  uuid: string
  name: string
  key?: string
  /** Its type's name, when it isn't a plain task. */
  type?: string
  status: string
  project_uuid: string
}

/** One of a task's links from its side, with the server's words for it ("is duplicated by"). */
export interface TaskLink {
  kind: LinkKind
  /** "in": the other task is its from end (it duplicates this one). */
  direction: string
  label: string
  task: LinkedTask
}

export const taskLinksPath = (taskUUID: string) => `/task/${taskUUID}/links`

/** The ways a link is made from a task's side, in the words the server reads each back in (domain/Task LinkLabel). */
export const LINK_WAYS: readonly { kind: LinkKind; direction: string; label: string }[] = [
  { kind: "relates", direction: "out", label: "relates to" },
  { kind: "duplicates", direction: "out", label: "duplicates" },
  { kind: "duplicates", direction: "in", label: "is duplicated by" },
  { kind: "clones", direction: "out", label: "clones" },
  { kind: "clones", direction: "in", label: "is cloned by" },
]

/** Links the task to other the way given, or with remove takes the link off (the server keeps it, stamped with who). */
export async function changeTaskLink(taskUUID: string, other: string, kind: LinkKind, direction: string, remove = false): Promise<void> {
  await axiosInstance.post(remove ? "/task/link/delete" : "/task/link", { task_uuid: taskUUID, other_task_uuid: other, kind, direction }, OWN_ERRORS)
}

/** Puts a task in an epic of its project; "" takes it out. */
export async function setTaskParent(taskUUID: string, parent: string): Promise<void> {
  await axiosInstance.post("/task/parent", { task_uuid: taskUUID, parent_task_uuid: parent }, OWN_ERRORS)
}

type Typed = { task_work_type?: TaskWorkType | null }

/** Whether a task is an epic, the built-in type. */
export const isEpic = (t?: Typed | null): boolean => t?.task_work_type?.builtin === "epic"

/** Whether a task with this parent is a subtask: its parent is there and is no epic (an epic's tasks are top-level work). */
export const isSubTask = (parent?: (Typed & { task_uuid?: string; task_hidden?: boolean }) | null): boolean => isTaskThere(parent) && !isEpic(parent)

/** The epics a task may go in, from its project's list: never itself, nor one made a moment ago. Pure. */
export const epicChoices = <T extends Typed & { task_uuid: string }>(tasks: T[], self: string): T[] =>
  tasks.filter((t) => isEpic(t) && t.task_uuid !== self && !t.task_uuid.startsWith("temp-"))
