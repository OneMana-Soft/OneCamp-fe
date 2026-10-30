// The names a new task's address reads, apart from its parser
// (lib/task/newTaskAddress), so the shell's query reader can drop them
// without bringing the parser into every route.

/** Each field and the names it comes under, Linear's first. */
export const TASK_ADDRESS_NAMES = {
  name: ["title", "name"],
  description: ["description"],
  project: ["project"],
  status: ["status"],
  priority: ["priority"],
  assignee: ["assignee"],
  tags: ["labels", "tags"],
  due: ["due", "dueDate"],
  estimate: ["estimate"],
} as const

export const TASK_ADDRESS_PARAMS: readonly string[] = Object.values(TASK_ADDRESS_NAMES).flat()

/** A query's new-task fields alone, as given; "" for none. Pure. */
export function taskAddressQuery(params: URLSearchParams): string {
  const fields = new URLSearchParams()
  for (const name of TASK_ADDRESS_PARAMS) for (const v of params.getAll(name)) fields.append(name, v)
  return fields.toString()
}
