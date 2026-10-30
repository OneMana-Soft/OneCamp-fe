// The task's scales, as values without types/task's schema and zod. Statuses' names in sentence case.

/** Most pressing first (business/TaskPriority); level is the key. */
export const TASK_PRIORITIES = [
    { value: "urgent", label: "Urgent", level: 4 },
    { value: "high", label: "High", level: 3 },
    { value: "medium", label: "Medium", level: 2 },
    { value: "low", label: "Low", level: 1 },
] as const

export const NO_PRIORITY = { value: "", label: "No priority", level: 0 } as const

export const taskPriorityOptions = TASK_PRIORITIES.map((p) => ({ id: p.value, label: p.label }))

export const taskStatusOptions = [
    { id: "backlog", label: "Backlog" },
    { id: "todo", label: "To do" },
    { id: "inProgress", label: "In progress" },
    { id: "inReview", label: "In review"},
    { id: "done", label: "Done" },
    { id: "canceled", label: "Cancelled" },
]

/** A built-in status's name, or the value itself. */
export const taskStatusLabel = (id: string) => taskStatusOptions.find((o) => o.id === id)?.label ?? id
