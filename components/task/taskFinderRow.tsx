import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { DueLabel } from "@/components/task/DueLabel"
import { BlockedBadge } from "@/components/task/BlockedBadge"
import { projectHue } from "@/lib/projectHue"
import { statusOptionOf } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

/**
 * A task to give time on the calendar (TaskFinder's rows, the calendar's Tasks
 * list): where it stands, its name, what it waits on (its stop sign), when
 * it's due, and its project in the project's hue.
 */
export function TaskFinderRow({ task: t }: { task: TaskInfoInterface }) {
  const status = statusOptionOf(t)
  const project = t.task_project
  return (
    <>
      <StatusGlyph status={status?.kind ?? "todo"} size={16} label={status?.label} className="mt-0.5" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-ink">{t.task_name || "Untitled task"}</span>
          <BlockedBadge count={t.task_blocked_open} className="text-meta" />
          <DueLabel date={t.task_due_date} />
        </span>
        {project?.project_name ? (
          <span className="flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
            <IdentityMark hue={projectHue(project.project_uuid)} variant="dot" size={6} className="!size-1.5" />
            <span className="truncate">{project.project_name}</span>
          </span>
        ) : null}
      </span>
    </>
  )
}
