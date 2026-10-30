"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { busyWith } from "@/lib/ui/busyWith"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import type { Milestone } from "@/lib/work/milestones"

/** A project to share it with: a radio row, whose shape and pitch its loading rows keep. */
const CHOICE_ROW = "flex min-h-11 items-center gap-2 rounded-md px-1.5"

/**
 * Where a milestone shows (linear-16), for its home's admins: the projects it's
 * shared with, each to take it off again (onTakeOff asks first), and another
 * project they run to share it with, whose tasks may then join it. Linear keeps
 * a milestone to one project. The server checks they run both.
 */
export function ShareMilestoneDialog({
  milestone,
  onClose,
  onShare,
  onTakeOff,
}: {
  milestone: Milestone
  onClose: () => void
  onShare: (project: string) => Promise<void>
  onTakeOff: (project: string) => void
}) {
  const { projects, isError, mutate } = useProjectsOverview()
  const [to, setTo] = useState("")
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = new Set(milestone.projects.map((p) => p.project_uuid.toLowerCase()))
  const others = milestone.projects.filter((p) => p.project_uuid.toLowerCase() !== milestone.project_uuid.toLowerCase())
  const choices = (projects ?? []).filter((p) => p.is_admin > 0 && !shown.has(p.project_uuid.toLowerCase()))
  // Nothing left to pick: Done alone closes it.
  const none = !!projects && choices.length === 0

  const share = async () => {
    setRunning("share")
    setError(null)
    try {
      await onShare(to)
      setTo("")
    } catch (e) {
      setError(apiErrorMessage(e, "It couldn't be shared. Try again."))
    } finally {
      setRunning(null)
    }
  }

  return (
    <ResponsiveDialog
      title={`Share ${milestone.name}`}
      description="Tasks in a project it's shared with can join it too, and its progress counts them."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
          {!none && (
            <Button size="sm" onClick={() => void share()} {...busyWith(running, "share")} disabled={!to}>
              Share
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4" data-share-milestone="">
        {(others.length > 0 || milestone.hidden_projects > 0) && (
          <div className="grid gap-1">
            <p className="text-meta font-medium text-ink-3">Shared with</p>
            {others.map((p) => (
              <div key={p.project_uuid} className="flex min-h-9 items-center justify-between gap-2">
                <span className="truncate text-ui-sm text-ink-1">{p.project_name}</span>
                <Button variant="ghost" size="sm" className="text-danger-ink" onClick={() => onTakeOff(p.project_uuid)} {...busyWith(running, p.project_uuid)}>
                  Take off
                </Button>
              </div>
            ))}
            {milestone.hidden_projects > 0 && (
              <p className="text-meta text-ink-3">
                And {milestone.hidden_projects} {milestone.hidden_projects === 1 ? "project" : "projects"} you can&apos;t open.
              </p>
            )}
          </div>
        )}
        {none ? (
          <p className="text-ui-sm text-ink-3">There&apos;s no other project you run to share it with.</p>
        ) : (
          <div className="grid gap-1">
            <p className="text-meta font-medium text-ink-3">Share with</p>
            {projects === undefined ? (
              isError ? (
                <ErrorState compact subject="your projects" onRetry={() => void mutate()} />
              ) : (
                <ChoiceRowsLoading />
              )
            ) : (
              <RadioGroup value={to} onValueChange={setTo} aria-label="A project to share it with" disabled={running !== null}>
                {choices.map((p) => (
                  <Label key={p.project_uuid} className={cn(CHOICE_ROW, "cursor-pointer text-sm font-normal hover:bg-hover")}>
                    <RadioGroupItem value={p.project_uuid} aria-label={p.project_name} />
                    <span className="truncate">{p.project_name}</span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-meta text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  )
}

/**
 * The choices while the projects are read: rows in a radio row's own shape and
 * pitch (a circle, a name), so the first choice lands where the first stood.
 */
function ChoiceRowsLoading() {
  return (
    <div role="status" aria-label="Loading your projects" className="grid gap-2">
      {[0, 1].map((i) => (
        <div key={i} aria-hidden data-share-loading="" className={CHOICE_ROW}>
          <Skeleton variant="circle" className="size-4 shrink-0" />
          <Skeleton className={cn("h-3", i === 0 ? "w-32" : "w-24")} />
        </div>
      ))}
    </div>
  )
}
