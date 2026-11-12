"use client"

// What the board's Call button says when no call has shown the board (miro-27), passed in by the page with the
// EmptyState it already loads: the calls' lazy chunk brings none of the shared core (components/board/boardCall).

import { EmptyState } from "@/components/ui/empty-state"
import { Video } from "@/lib/icons"

export function NoBoardCallsYet() {
  return <EmptyState icon={Video} hue="lake" tone="muted" className="py-8" title="No calls with this board yet." description="Show this board in a call, and its recording, words and notes gather here." />
}
