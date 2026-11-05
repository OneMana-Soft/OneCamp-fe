"use client"

import type { TaskInfoInterface } from "@/types/task"
import TypeGlyphOnDemand from "@/components/task/TypeGlyphOnDemand"

/** A task's type glyph, in a slot kept for one, and its key, --key-w wide (STEP4 #8). */
export function TaskKeyCell({ task }: { task: TaskInfoInterface }) {
  const type = task.task_work_type
  return (
    <span data-task-key="" className="flex shrink-0 items-center gap-1 text-meta font-[510] tabular-nums text-ink-3">
      <span className="flex size-3.5">{type && <TypeGlyphOnDemand type={type} />}</span>
      <span className="w-[var(--key-w)] whitespace-nowrap">{task.task_key}</span>
    </span>
  )
}

/** The longest key in a list, at least 4; 0 when none has one. */
export const keyWidth = (tasks: TaskInfoInterface[]) => tasks.reduce((w, t) => (t.task_key ? Math.max(w, t.task_key.length, 4) : w), 0)
