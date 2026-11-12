/**
 * A link to a restricted task the reader may not see (a parent, a dependency's end) arrives as a stub: task_hidden and
 * the link's kind, never the task's name or id (WA2, V-678).
 */
export const HIDDEN_TASK_NAME = "A task you can't see"

export const taskNameOf = (t: { task_name?: string; task_hidden?: boolean }) => (t.task_hidden ? HIDDEN_TASK_NAME : t.task_name || "")

/** Whether a link to a task is there: a task the reader sees, by its id, or the stub of one they may not, which has none. */
export const isTaskThere = (t: { task_uuid?: string; task_hidden?: boolean } | null | undefined): boolean =>
  !!t && (t.task_hidden === true || !!t.task_uuid)
