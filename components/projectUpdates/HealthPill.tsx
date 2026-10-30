import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { healthOf } from "@/lib/projectUpdates"

/**
 * Where a project stands: a dot in its colour and the word. It was a tinted
 * pill, one more filled shape in rows that already had a progress bar and a
 * red count; the dot keeps the colour's meaning and the word says it.
 */
export function HealthPill({ health, className }: { health: string; className?: string }) {
  return <HealthWord health={health} className={className} />
}

/** The signal dot's colour and ring, by health (work.md W09): moss, sun, danger; ink for the rest. */
const SIGNAL: Record<string, { dot: string; ring: string }> = {
  on_track: { dot: "var(--camp-moss)", ring: "color-mix(in oklab, var(--camp-moss) 20%, transparent)" },
  at_risk: { dot: "var(--camp-sun)", ring: "color-mix(in oklab, var(--camp-sun) 20%, transparent)" },
  off_track: { dot: "var(--destructive)", ring: "color-mix(in oklab, var(--destructive) 20%, transparent)" },
  on_hold: { dot: "var(--ink-3)", ring: "color-mix(in oklab, var(--ink-3) 20%, transparent)" },
  done: { dot: "var(--camp-sky)", ring: "color-mix(in oklab, var(--camp-sky) 20%, transparent)" },
}

/**
 * A health's 8 px signal dot with its 2 px ring (W09), as the health word draws
 * it; a forecast held up carries at_risk's (components/project/ForecastChip).
 */
export function SignalDot({ health, ...rest }: { health: string } & HTMLAttributes<HTMLSpanElement>) {
  const signal = SIGNAL[health] ?? SIGNAL.on_hold
  return (
    <span
      aria-hidden="true"
      {...rest}
      className="size-2 shrink-0 rounded-full [animation:work-glyph-in_220ms_var(--ease-spring)_both]"
      style={{ background: signal.dot, boxShadow: `0 0 0 2px ${signal.ring}` }}
    />
  )
}

/**
 * The health word (design v3, work.md W09): an 8 px signal dot with a 2 px
 * ring in a fifth of its own hue (a signal, distinct from a label's 6 px
 * dot), then the word at 13/510. No update yet is an ink-4 dashed ring and
 * ink-3 words, and becomes "Write the first update" when the person may.
 * `chip` draws it as the header's 24 px chip, a button to the updates.
 */
export function HealthWord({
  health,
  chip = false,
  onClick,
  canWrite = false,
  className,
}: {
  /** A health, or empty for no update yet. */
  health?: string | null
  chip?: boolean
  onClick?: () => void
  /** No update yet: whether this person may write the first one. */
  canWrite?: boolean
  className?: string
}) {
  const none = !health
  const h = none ? null : healthOf(health)
  const body = (
    <>
      {h ? (
        <SignalDot health={h.value} data-health-dot={h.value} />
      ) : (
        <span aria-hidden="true" data-health-dot="none" className="size-2 shrink-0 rounded-full border border-dashed border-ink-4" />
      )}
      <span className={cn("text-xs font-[510]", none ? "text-ink-3" : "text-foreground")}>
        {none ? (canWrite ? "Write the first update" : "No update yet") : h!.label}
      </span>
    </>
  )
  const base = cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap", chip && "chip h-6", className)
  if (onClick && (chip || (none && canWrite))) {
    return (
      <button type="button" data-health-word={h?.value ?? "none"} onClick={onClick} data-touch-target="" {...ix("chip")} className={base}>
        {body}
      </button>
    )
  }
  return (
    <span data-health-word={h?.value ?? "none"} className={base}>
      {body}
    </span>
  )
}
