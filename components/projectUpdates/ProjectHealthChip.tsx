"use client"

import { HealthWord } from "@/components/projectUpdates/HealthPill"
import { useProjectUpdates } from "@/hooks/useProjectUpdates"
import { updateDue } from "@/lib/projectUpdates"
import { daysAgo } from "@/lib/utils/relativeTime"

/**
 * Where the project stands, by its latest update, as the header's 24 px health
 * chip (design v3, work.md W09): the signal dot and the word, a button to the
 * updates. With no update yet, someone who may post is offered the first.
 */
export function ProjectHealthChip({ projectId, onOpen, className }: { projectId: string; onOpen: () => void; className?: string }) {
  const { updates, canPost } = useProjectUpdates(projectId)
  const latest = updates[0]
  const now = Date.now()
  if (!latest && !canPost) return null
  const due = !!latest && canPost && updateDue(latest, now)
  return (
    <span title={latest ? `${daysAgo(latest.created_at, now)}${due ? " · an update is due" : ""}` : undefined} className={className}>
      <HealthWord health={latest?.health ?? null} chip onClick={onOpen} canWrite={canPost} />
    </span>
  )
}
