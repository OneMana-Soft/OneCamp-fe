import { cn } from "@/lib/utils/helpers/cn"
import { healthOf } from "@/lib/projectUpdates"

/** Where a project stands, as a small coloured pill. */
export function HealthPill({ health, className }: { health: string; className?: string }) {
  const h = healthOf(health)
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", h.pill, className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", h.dot)} />
      {h.label}
    </span>
  )
}
