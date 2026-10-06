/**
 * Swimlanes: a board's status columns cut into rows, one per person or per
 * priority, as Linear's "sub-group", Jira's swimlanes and Asana's board rows do.
 * A cell is one lane's share of one column, keyed `${lane}${SEP}${column}`, so
 * the board's drag code (which knows only keyed lists of cards) works on cells
 * unchanged. Pure, so it is tested without rendering.
 */
import type { ReactNode } from "react"
import type { TaskInfoInterface } from "@/types/task"
import { priorities } from "@/types/table"
import { NO_ASSIGNEE, groupByAssignee } from "@/lib/board/groupBy"

export type BoardLanes = "none" | "assignee" | "priority"

export interface Lane {
  id: string
  label: string
  /** Drawn before the label: a person's avatar, a priority's arrow. */
  icon?: ReactNode
}

export interface LaneSpec {
  list: Lane[]
  /** The lane a task belongs in. */
  laneOf: (task: TaskInfoInterface) => string
}

/** Never in an id, a status key or a uuid. */
const SEP = "␟"

export const cellKey = (lane: string, column: string) => `${lane}${SEP}${column}`

export function splitCell(key: string): { lane: string; column: string } {
  const i = key.indexOf(SEP)
  return i < 0 ? { lane: "", column: key } : { lane: key.slice(0, i), column: key.slice(i + SEP.length) }
}

/**
 * Every lane × column cell, each holding its tasks in the column's order. A
 * task whose lane is not listed (a hidden empty lane cannot hold one) is left
 * out rather than shown in the wrong row.
 */
export function intoCells<T extends TaskInfoInterface>(
  byColumn: Record<string, T[]>,
  columns: string[],
  lanes: LaneSpec,
): Record<string, T[]> {
  const cells: Record<string, T[]> = {}
  const known = new Set(lanes.list.map((l) => l.id))
  for (const l of lanes.list) for (const c of columns) cells[cellKey(l.id, c)] = []
  for (const c of columns) {
    for (const t of byColumn[c] ?? []) {
      const lane = lanes.laneOf(t)
      if (known.has(lane)) cells[cellKey(lane, c)].push(t)
    }
  }
  return cells
}

/** Lanes by who has the task: "No assignee", then people by name. */
export function assigneeLanes(
  byStatus: Record<string, TaskInfoInterface[]>,
  members: Parameters<typeof groupByAssignee>[1],
  hideEmpty: boolean,
  iconFor?: (id: string) => ReactNode,
): LaneSpec {
  const { options } = groupByAssignee(byStatus, members, hideEmpty)
  return {
    list: options.map((o) => ({ id: o.value, label: o.label, icon: iconFor?.(o.value) })),
    laneOf: (t) => t.task_assignee?.user_uuid || NO_ASSIGNEE,
  }
}

/** A task saved without a priority sits with Medium, as its card shows it. */
const priorityOf = (t: TaskInfoInterface) => (priorities.some((p) => p.value === t.task_priority) ? t.task_priority : "medium")

/** Lanes by priority, most urgent first. */
export function priorityLanes(byStatus: Record<string, TaskInfoInterface[]>, hideEmpty: boolean, iconFor?: (id: string) => ReactNode): LaneSpec {
  const used = new Set<string>()
  for (const tasks of Object.values(byStatus)) for (const t of tasks) used.add(priorityOf(t))
  return {
    list: [...priorities]
      .reverse()
      .filter((p) => !hideEmpty || used.has(p.value))
      .map((p) => ({ id: p.value, label: p.label, icon: iconFor?.(p.value) })),
    laneOf: priorityOf,
  }
}
