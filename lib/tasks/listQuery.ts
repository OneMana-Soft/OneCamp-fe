import { requestSorting } from "@/lib/tasks/manualSort"

/** A task list's query, as its pages and its CSV send it. */
export interface TaskListQuery {
  sort?: { id: string; desc?: boolean }[]
  filters?: { id: string; value: unknown }[]
  search?: string
  pageSize?: number
  pageIndex?: number
}

export function taskListQuery({ sort, filters, search, pageSize, pageIndex }: TaskListQuery) {
  const q = new URLSearchParams()
  if (sort?.length) q.set("sorting", JSON.stringify(sort.map(({ id, desc }) => ({ id, desc }))))
  if (filters?.length) q.set("filters", JSON.stringify(filters.map(({ id, value }) => ({ id, value }))))
  if (pageSize !== undefined) q.set("pageSize", String(pageSize))
  if (pageIndex !== undefined) q.set("pageIndex", String(pageIndex))
  if (search) q.set("taskSearchString", search)
  return q
}

/**
 * A project's list query, for its pages and its CSV alike: with no sort
 * chosen it asks for Manual, the project's one order, as the board does (L-1).
 */
export function projectTaskListQuery(query: TaskListQuery) {
  return taskListQuery({ ...query, sort: requestSorting(query.sort ?? []) })
}
