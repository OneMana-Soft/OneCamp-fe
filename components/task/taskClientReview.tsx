"use client"

// The task panel's Client row: what a client said about this task from their
// project link. Shown only once a client has given a verdict.

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ReviewBadge } from "@/components/guest/ReviewBadge"
import type { GuestReview } from "@/services/guestService"

export function TaskClientReview({ taskUUID }: { taskUUID: string }) {
  const { data } = useFetch<{ data: GuestReview | null }>(taskUUID ? `${GetEndpointUrl.TaskClientReview}/${taskUUID}` : "")
  const review = data?.data
  if (!review) return null
  return (
    <div className="mb-2 grid grid-cols-1 gap-1 sm:grid-cols-6 sm:items-start sm:gap-0">
      <div className="pt-0.5 sm:col-span-1">
        <span className="text-xs text-muted-foreground sm:text-foreground">Client</span>
      </div>
      <div className="sm:col-span-5">
        <ReviewBadge review={review} withNote />
      </div>
    </div>
  )
}
