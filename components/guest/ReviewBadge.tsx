"use client"

// A client's verdict on a task, the same on their board and in the team's task
// panel: approved, or changes requested (with what to change).

import { AlertCircle, CheckCircle2 } from "@/lib/icons"
import type { GuestReview } from "@/services/guestService"
import { shortDate } from "@/lib/utils/date/shortDate"

const ago = (iso: string) => shortDate(new Date(iso))

export function ReviewBadge({ review, withNote = false }: { review: GuestReview; withNote?: boolean }) {
  const approved = review.decision === "approved"
  const Icon = approved ? CheckCircle2 : AlertCircle
  return (
    <span className="inline-grid gap-1">
      <span
        // The verdict in words, its colour on the icon alone: a tinted chip
        // under the dates and the assignee was the loudest thing on the card.
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground"
        title={`${approved ? "Approved" : "Changes requested"} by ${review.name}, ${ago(review.created_at)}`}
      >
        <Icon className={`h-3.5 w-3.5 ${approved ? "text-success-ink" : "text-warning-ink"}`} aria-hidden />
        {approved ? "Approved" : "Changes requested"}
        <span className="font-normal text-muted-foreground">· {review.name}</span>
      </span>
      {withNote && review.note && <span className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{review.note}</span>}
    </span>
  )
}
