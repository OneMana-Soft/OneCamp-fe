"use client"

// Who can see a task (WA2b, design/projects-vs-asana-jira/WA2_PLAN.md): the
// task panel's "Who can see" row and the dialog it opens. A task is seen by
// everyone in its project, or kept to its project's admins, its assignee,
// whoever made it and the people added to it. The server decides who may
// change it (task_access.restrict) and who sees it (models/taskread); this
// says it and asks for changes. The dialog is the doc and board share
// dialogs' parts (components/dialog/shareParts), not a picker of its own.

import * as React from "react"
import { Suspense, useState } from "react"
import { Lock, Users } from "@/lib/icons"
import { propertyLabel, propertyRow, propertyValue } from "@/lib/ui/propertyRow"
import { cn } from "@/lib/utils/helpers/cn"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const TaskVisibilityDialog = lazyPiece(() => import("@/components/task/TaskVisibilityDialog"))

export interface TaskVisibilityProps {
  taskUUID: string
  taskName: string
  /** Kept to a few people, the reader one of them (task_restricted). */
  restricted: boolean
  /** May the reader change it (task_access.restrict)? */
  canChange: boolean
  /** The project's people: whom it can be kept to. */
  members: import("@/types/user").UserProfileDataInterface[]
  /** Always let in: its assignee and whoever made it (user ids). */
  alwaysIn: string[]
  /** Its restriction changed: the panel and the lists follow. */
  onChanged: (restricted: boolean) => void
  /** Opens another task (the one it is restricted with). */
  onOpenTask: (taskUUID: string) => void
}

/**
 * The panel's "Who can see" row: shown when the task is restricted (to
 * anyone it shows to) or the reader may restrict it; for everyone else a
 * task the whole project sees goes unsaid, as before.
 */
export function TaskVisibilityRow(props: TaskVisibilityProps) {
  const { restricted, canChange } = props
  const [open, setOpen] = useState(false)
  if (!restricted && !canChange) return null
  const words = restricted ? "Only some people" : "Everyone in the project"
  return (
    <div className={propertyRow()} data-property="visibility">
      <span className={propertyLabel}>Who can see</span>
      <div className="min-w-0">
        <button
          type="button"
          className={cn(propertyValue, restricted ? "text-foreground" : "text-ink-2")}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Who can see this task: ${words}.${canChange ? " Change who can see it" : " See who can"}`}
          data-restricted={restricted || undefined}
        >
          {restricted ? <Lock aria-hidden className="size-3.5 shrink-0 text-ink-2" /> : <Users aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
          <span className="truncate">{words}</span>
        </button>
      </div>
      {open && (
        <Suspense fallback={null}>
          <TaskVisibilityDialog {...props} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
