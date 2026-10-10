import { cn } from "@/lib/utils/helpers/cn"
import { healthOf } from "@/lib/projectUpdates"

/**
 * Where a project stands: a dot in its colour and the word. It was a tinted
 * pill, one more filled shape in rows that already had a progress bar and a
 * red count; the dot keeps the colour's meaning and the word says it.
 */
export function HealthPill({ health, className }: { health: string; className?: string }) {
  const h = healthOf(health)
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-foreground", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", h.dot)} />
      {h.label}
    </span>
  )
}
