"use client"

// The task panel's Client row: what a client said about this task from their
// project link. Shown only once a client has given a verdict.

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import type { GuestReview } from "@/services/guestService"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"

export function TaskClientReview({ taskUUID }: { taskUUID: string }) {
  const { data } = useFetch<{ data: GuestReview | null }>(taskUUID ? `${GetEndpointUrl.TaskClientReview}/${taskUUID}` : "")
  const review = data?.data
  if (!review) return null
  return (
    <div className={propertyRow("start")}>
      <div className="pt-0.5">
        <span className={propertyLabel}>Client</span>
      </div>
      <div className="min-w-0">
        <ReviewBadge review={review} withNote />
      </div>
    </div>
  )
}
