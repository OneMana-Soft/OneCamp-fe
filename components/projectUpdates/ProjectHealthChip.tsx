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
export function ProjectHealthChip({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const { updates, canPost } = useProjectUpdates(projectId)
  const latest = updates[0]
  const now = Date.now()
  if (!latest) {
    if (!canPost) return null
    return (
      <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
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
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80", h.pill)}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", h.dot)} />
      {h.label}
      <span className="font-normal opacity-75">· {daysAgo(latest.created_at, now)}</span>
      {due && <span className="font-normal opacity-75">· update due</span>}
    </button>
  )
}
