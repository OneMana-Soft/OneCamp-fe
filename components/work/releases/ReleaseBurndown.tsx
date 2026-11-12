"use client"

// A release's burndown (jira-04), the sheet's Burndown view (./ReleaseSheet):
// how its work went down day by day, against an even pace to its target day,
// or with no pace when it has none. Members read it. Drawn by the cycle
// burndown's own part (components/charts/BurndownPart), and a chunk of its
// own, loaded when the view is first picked; like the rest of the tab it
// reads through the page's client and says a failure with the page's shared
// error state, whose Try again reads it again.

import * as React from "react"
import { BurndownPart } from "@/components/charts/BurndownPart"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import type { CycleState } from "@/lib/tasks/cycles"
import { localDay } from "@/lib/utils/timeZone"
import { releaseBurndownPath, type Release, type ReleaseBurndown as Read, type ReleaseCalls } from "@/lib/work/releases"
import { useKeptRead } from "./releaseParts"

/** Where a release stands, in a burndown's terms: out is completed, past its target day ended. */
export function releaseStage(r: Pick<Release, "state" | "target_date">, now: Date = new Date()): CycleState {
  if (r.state === "released") return "completed"
  return r.target_date && r.target_date < localDay(now) ? "ended" : "current"
}

export default function ReleaseBurndown({
  release,
  projectId,
  calls,
  failed,
}: {
  release: Release
  projectId: string
  calls: ReleaseCalls
  failed: (retry: () => void, part: string) => React.ReactNode
}) {
  const load = React.useCallback(() => calls.burndown(release.id), [calls, release.id])
  const read = useKeptRead<Read>(releaseBurndownPath(projectId, release.id), load)
  if (!read.data) {
    return read.failed ? (
      <>{failed(() => void read.again(), "the burndown")}</>
    ) : (
      <div role="status" aria-label="Loading the burndown">
        <SkeletonRows rows={4} />
      </div>
    )
  }
  return (
    <BurndownPart
      burndown={read.data.burndown}
      of="release"
      state={releaseStage(read.data.release ?? release)}
      empty="No tasks in this release yet. Put tasks in it from their Release field, and its burndown starts here."
    />
  )
}
