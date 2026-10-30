/**
 * The phone's sort sheets' date orders, in words: sentence case, each named
 * by its date and which come first (My Tasks' sheet and a project's, which
 * puts Manual before them).
 */
export const DATE_SORTS = [
  { id: "task_start_date", desc: false, label: "Start date, earliest first" },
  { id: "task_start_date", desc: true, label: "Start date, latest first" },
  { id: "task_due_date", desc: false, label: "Due date, earliest first" },
  { id: "task_due_date", desc: true, label: "Due date, latest first" },
  { id: "task_created_date", desc: false, label: "Created, oldest first" },
  { id: "task_created_date", desc: true, label: "Created, newest first" },
] as const
