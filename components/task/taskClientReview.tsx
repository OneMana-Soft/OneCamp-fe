"use client"

// The task panel's Client row: what a client said about this task from their
// project link. Shown only once a client has given a verdict.

import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import type { GuestReview } from "@/services/guestService"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"

export function TaskClientReview({ taskUUID }: { taskUUID: string }) {
  const { data } = useFetch<{ data: GuestReview | null }>(taskUUID ? `${ProjectsGet.TaskClientReview}/${taskUUID}` : "")
  const review = data?.data
  if (!review) return null
  return (
    <div className={propertyRow("start")}>
      <span className={propertyLabel}>Client</span>
      {/* The badge's 12 px line, centred on the name's 32 px one. */}
      <div className="min-w-0 pt-2">
        <ReviewBadge review={review} withNote />
      </div>
    </div>
  )
}
