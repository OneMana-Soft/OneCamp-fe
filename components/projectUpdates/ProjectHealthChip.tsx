"use client"

import { useProjectUpdates } from "@/hooks/useProjectUpdates"
import { healthOf, updateDue } from "@/lib/projectUpdates"
import { daysAgo } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where the project stands, by its latest update, beside its name: "At risk ·
 * 3 days ago". It opens the updates. An admin whose project has no update yet,
 * or a week-old one, is offered to write the next.
 */
export function ProjectHealthChip({ projectId, onOpen, className }: { projectId: string; onOpen: () => void; className?: string }) {
  const { updates, canPost } = useProjectUpdates(projectId)
  const latest = updates[0]
  const now = Date.now()
  if (!latest) {
    if (!canPost) return null
    return (
      <button type="button" onClick={onOpen} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:bg-muted hover:text-foreground", className)}>
        Post the first update
      </button>
    )
  }
  const h = healthOf(latest.health)
  const due = canPost && updateDue(latest, now)
  return (
    <button
      type="button"
      onClick={onOpen}
      title={due ? "An update is due" : "Open the updates"}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted", className)}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", h.dot)} />
      {h.label}
      <span className="text-muted-foreground">· {daysAgo(latest.created_at, now)}</span>
      {due && <span className="text-muted-foreground">· update due</span>}
    </button>
  )
}
