/** A link to a restricted task the reader may not see arrives as its id and task_hidden (WA2). */
export const HIDDEN_TASK_NAME = "A task you can't see"

export const taskNameOf = (t: { task_name?: string; task_hidden?: boolean }) => (t.task_hidden ? HIDDEN_TASK_NAME : t.task_name || "")
