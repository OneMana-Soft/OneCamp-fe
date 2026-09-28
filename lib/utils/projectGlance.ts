/**
 * Where a project stands, in one line: what is open, what is late, what is
 * due soon, what is done. Basecamp's answer to "where are we" is a chart
 * people have to learn; counts in words need no learning.
 */

import { isClosedStatus } from "@/lib/taskStatus"

interface GlanceTask {
  task_status: string
  task_due_date?: string | null
}

export interface ProjectGlance {
  open: number
  overdue: number
  dueSoon: number
  done: number
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Counts for a project's tasks, as of now. Overdue: open, with a due date
 * before today. Due soon: open, due today or in the next six days. A due date
 * of the zero time (never set) counts as none.
 */
export function projectGlance(tasks: GlanceTask[], now: Date): ProjectGlance {
  const today = startOfDay(now).getTime()
  const weekEnd = today + 7 * 86_400_000
  const g: ProjectGlance = { open: 0, overdue: 0, dueSoon: 0, done: 0 }
  for (const t of tasks) {
    if (t.task_status === "done") {
      g.done++
      continue
    }
    if (isClosedStatus(t.task_status)) continue
    g.open++
    const due = t.task_due_date ? new Date(t.task_due_date) : null
    if (!due || Number.isNaN(due.getTime()) || due.getFullYear() < 1971) continue
    const day = startOfDay(due).getTime()
    if (day < today) g.overdue++
    else if (day < weekEnd) g.dueSoon++
  }
  return g
}

/** The line itself, or null for a project with no tasks yet. */
export function projectGlanceParts(g: ProjectGlance): { text: string; tone: "default" | "late" }[] | null {
  if (g.open === 0 && g.done === 0) return null
  if (g.open === 0) return [{ text: `All ${g.done} ${g.done === 1 ? "task" : "tasks"} done`, tone: "default" }]
  const parts: { text: string; tone: "default" | "late" }[] = [{ text: `${g.open} open`, tone: "default" }]
  if (g.overdue > 0) parts.push({ text: `${g.overdue} overdue`, tone: "late" })
  if (g.dueSoon > 0) parts.push({ text: `${g.dueSoon} due this week`, tone: "default" })
  if (g.done > 0) parts.push({ text: `${g.done} done`, tone: "default" })
  return parts
}
