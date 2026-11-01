import type { ComponentProps } from "react"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { cn } from "@/lib/utils/helpers/cn"

/** What a project's status draws (linear-15): a task status's shapes, and paused, which only a project has. */
export type ProjectStatusKind = StatusKind | "paused"

/**
 * A project's status as a 16px glyph: its category's task glyph (planned the
 * to-do ring, in progress the half-filled sun ring, done and cancelled their
 * discs), and paused, which only a project has: the to-do ring with a pause's
 * two bars, in the ring's ink-2 or the status's own camp hue. A module of its
 * own that only the screens showing a project's status import, so the task
 * glyphs every route carries keep their bytes (V-49).
 */
export function ProjectStatusGlyph({ status, ...glyph }: Omit<ComponentProps<typeof StatusGlyph>, "status"> & { status: ProjectStatusKind }) {
  if (status !== "paused") return <StatusGlyph status={status} {...glyph} />
  const { size = 16, label, hue, onTint = false, className } = glyph
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }
  const own = hue && hue !== "neutral" ? `var(--camp-${hue}${onTint ? "-ink" : ""})` : null
  const ink = own ?? "var(--ink-2)"
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" data-status-glyph="paused" data-hue={own ? hue : undefined} className={cn("shrink-0", className)} {...a11y}>
      <circle cx="8" cy="8" r="6" fill="none" stroke={ink} strokeWidth="1.5" />
      <path d="M6.6 5.9v4.2M9.4 5.9v4.2" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
