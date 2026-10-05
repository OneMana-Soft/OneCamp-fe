"use client"

// A client's verdict on a task, the same on their board and in the team's task
// panel: approved, or changes requested (with what to change).

import { AlertCircle, CheckCircle2 } from "@/lib/icons"
import type { GuestReview } from "@/services/guestService"

const ago = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

export function ReviewBadge({ review, withNote = false }: { review: GuestReview; withNote?: boolean }) {
  const approved = review.decision === "approved"
  const Icon = approved ? CheckCircle2 : AlertCircle
  return (
    <span className="inline-grid gap-1">
      <span
        className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${approved ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
        title={`${approved ? "Approved" : "Changes requested"} by ${review.name}, ${ago(review.created_at)}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {approved ? "Approved" : "Changes requested"}
        <span className="font-normal opacity-80">· {review.name}</span>
      </span>
      {withNote && review.note && <span className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{review.note}</span>}
    </span>
  )
}
