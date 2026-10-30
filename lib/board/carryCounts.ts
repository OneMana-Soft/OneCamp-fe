import type { TaskInfoInterface } from "@/types/task"

/**
 * A card moved between a board's columns carries the server's counts with it
 * (DESIGN-BUILD-3, 20 Oct): the column it left counts one less, the one it
 * joined one more, a closed column's own count too. The lists moved and the
 * counts didn't, so the column a card left still counted it ("3", "The first
 * 2 of 3 · Show 1 more") until the board was fetched again. A move passes it
 * to useTaskUpdate's optimisticUpdateTask (hooks/useMoveTask). A new card
 * (from undefined) only joins: lib/tasks/taskLists' withNewTask.
 */
export function carryCounts(data: Record<string, unknown>, prefix: "project" | "user", from: TaskInfoInterface | undefined, to: TaskInfoInterface) {
  const was = from ? from.task_custom_status || from.task_status : undefined
  const now = to.task_custom_status || to.task_status
  const countsKey = `${prefix}_column_counts`
  const counts = data[countsKey] as Record<string, number> | undefined
  if (counts && now && was !== now) {
    const next = { ...counts }
    if (was && typeof next[was] === "number") next[was] = Math.max(0, next[was] - 1)
    if (typeof next[now] === "number") next[now] = next[now] + 1
    data[countsKey] = next
  }
  for (const closed of ["done", "canceled"]) {
    const key = `${prefix}_tasks_${closed}_count`
    if (typeof data[key] !== "number") continue
    if (from?.task_status === closed && to.task_status !== closed) data[key] = Math.max(0, (data[key] as number) - 1)
    if (to.task_status === closed && from?.task_status !== closed) data[key] = (data[key] as number) + 1
  }
}
