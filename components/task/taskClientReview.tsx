"use client"

// The task panel's Client row: what a client said about this task from their
// project link. Shown only once a client has given a verdict.

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import type { GuestReview } from "@/services/guestService"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"

export function TaskClientReview({ taskUUID }: { taskUUID: string }) {
  const { data } = useFetch<{ data: GuestReview | null }>(taskUUID ? `${GetEndpointUrl.TaskClientReview}/${taskUUID}` : "")
  const review = data?.data
  if (!review) return null
  return (
    <div className={fieldRow("start")}>
      <div className="pt-0.5">
        <span className={fieldLabel}>Client</span>
      </div>
      <div className="min-w-0">
        <ReviewBadge review={review} withNote />
      </div>
    </div>
  )
}
