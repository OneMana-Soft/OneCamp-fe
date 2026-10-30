"use client"

// The task panel's Points row (linear-05), in a project that estimates in
// points. Its scale comes with the task (lib/work/panelIncludes), so the row
// paints with the panel; its value is a chunk of its own (lib/lazy/lazyPart).
// A task made with no network gets the scale the device holds for its project
// (lib/offline/tasks); when it holds none, the row says when points can be set.

import { PartRetry } from "@/components/ui/part-retry"
import { Skeleton } from "@/components/ui/skeleton"
import { WifiOff } from "@/lib/icons"
import { loadFailure } from "@/lib/http/loadFailure"
import { madeOffline } from "@/lib/offline/offlineId"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"
import { useEstimates } from "@/lib/work/estimates"
import type { EstimateScale } from "@/lib/work/points"

/** What the value's chunk (taskPointsField) is given. */
export interface PointsValueProps {
  taskUUID: string
  projectUUID: string
  points?: number
  scale: EstimateScale
  canEdit: boolean
}

const value = lazyPart<PointsValueProps>(() => import("@/components/task/taskPointsField").then((m) => m.default), {
  placeholder: function PointsComing() {
    return (
      <span className="inline-flex h-8 items-center" aria-hidden="true" data-points-coming="">
        <Skeleton className="h-3.5 w-12" />
      </span>
    )
  },
  failed: function PointsRetry({ retry }) {
    return <PartRetry what="the points" retry={retry} />
  },
})

export function TaskPointsRow({ taskUUID, projectUUID, points, canEdit }: Omit<PointsValueProps, "scale">) {
  const estimates = useEstimates(projectUUID)
  const answer = estimates.data
  const scale = answer?.data?.scale
  // A reader the project refuses (403, 404: a task's assignee from outside it, who may open the task but not its
  // project) has no points to see: no row, as for hours or a scale not read yet. A read that failed, or came with
  // the task as that part's error, says so in the row with Try again; for a task made on this device, which the
  // server hasn't got yet, it says calmly when points can be set (main, 29 Oct): no error, and never no row.
  const refused = !!estimates.isError && loadFailure(estimates.isError) !== "failed"
  const failed = !refused && (!!estimates.isError || (answer !== undefined && !answer.data))
  if (refused || (!failed && !scale)) return null
  return (
    <div className={propertyRow()} data-property="points" data-field-empty={points === undefined ? "" : undefined}>
      <span className={propertyLabel}>Points</span>
      {scale ? (
        <value.Part taskUUID={taskUUID} projectUUID={projectUUID} points={points} scale={scale} canEdit={canEdit} />
      ) : madeOffline(taskUUID) ? (
        <span className="inline-flex min-h-8 min-w-0 items-center gap-1.5 py-1 text-meta leading-snug text-ink-3" data-points-later="">
          <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{"Set points when you're back online"}</span>
        </span>
      ) : (
        <PartRetry what="the points" retry={() => void estimates.mutate()} />
      )}
    </div>
  )
}
