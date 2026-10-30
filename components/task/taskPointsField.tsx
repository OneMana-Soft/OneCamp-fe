"use client"

// The Points row's value (linear-05), a chunk of its own drawn by the row
// (components/task/taskPointsRow), which has the scale with the task. Whoever
// may edit the task picks its size from the scale, or None, in a menu like the
// Type row's (an action sheet on a phone); others read it.

import { ChevronDown } from "@/lib/icons"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MenuCheck } from "@/components/ui/menuCheck"
import { useToast } from "@/hooks/use-toast"
import { appMutate } from "@/lib/swrMutate"
import { propertyValue } from "@/lib/ui/propertyRow"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { backlogPath } from "@/lib/work/backlog"
import { setTaskPoints } from "@/lib/work/estimateWrites"
import { pointsLabel } from "@/lib/work/points"
import type { PointsValueProps } from "@/components/task/taskPointsRow"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"

export default function TaskPointsField({ taskUUID, projectUUID, points, scale, canEdit }: PointsValueProps) {
  const { toast } = useToast()

  const patch = (value: number | undefined) =>
    void appMutate(
      `${GetEndpointUrl.GetTaskInfo}/${taskUUID}`,
      (current: { data?: object } | undefined) => (current?.data ? { ...current, data: { ...current.data, task_estimate_points: value } } : current),
      { revalidate: false },
    )

  // Painted at once, put back if the server refuses; the backlog's totals follow.
  const pick = async (next: number | null) => {
    if ((next ?? undefined) === points) return
    patch(next ?? undefined)
    try {
      await setTaskPoints(taskUUID, next)
      void appMutate(backlogPath(projectUUID))
    } catch (err) {
      patch(points)
      toast({ variant: "destructive", title: "The points weren't saved", description: apiErrorMessage(err, "Try again in a moment.") })
    }
  }

  const shown = points === undefined ? "" : pointsLabel(scale, points)
  if (!canEdit) return <span className={cn("inline-flex h-8 items-center text-sm tabular-nums", shown ? "text-ink-2" : "text-ink-3")}>{shown || "None"}</span>
  const choices: { value: number | null; label: string }[] = [
    { value: null, label: "None" },
    ...scale.sizes.map((n, i) => ({ value: n, label: scale.labels[i] })),
    // Points off the scale (an import's, or from before it changed) stay pickable as they are.
    ...(points !== undefined && !scale.sizes.includes(points) ? [{ value: points, label: shown }] : []),
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(propertyValue, "tabular-nums")} aria-label={`Points: ${shown || "none"}. Change them`}>
          <span className={cn("truncate", !shown && "text-ink-3")}>{shown || "Add points"}</span>
          <ChevronDown aria-hidden className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover/value:opacity-100 group-focus-visible/value:opacity-100 [@media(hover:none)]:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {choices.map((c) => (
          <DropdownMenuItem key={c.value ?? "none"} onSelect={() => void pick(c.value)} className="gap-2 tabular-nums">
            <span className="flex-1 truncate">{c.label}</span>
            <MenuCheck checked={(c.value ?? undefined) === points} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
