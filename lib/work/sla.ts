// A task's SLA on a row or a card (linear-24 W1): its band, its words and its
// tone. Pure. The server says on track, at risk, breached or met (H1); the
// middle band is Linear's and for display only: a running timer is "medium"
// in the stretch just before its warning, as long as the warning itself
// (a 24 h target warned 6 h before is medium from 12 h left).

import { SLA_CHOICES, type SlaTone } from "@/lib/work/slaFilter"

export { SLA_SORT } from "@/lib/work/slaFilter"
export type { SlaTone }

/**
 * How an SLA is drawn, one map for the chip (components/task/SlaChip) and the Filter's dot (components/task/slaFacet), its tone per
 * state in ./slaFilter SLA_CHOICES (the group header reads danger): quiet ink, a sun or warning tint as the time runs short, danger once breached, success once met, a
 * finished task's chip in ink-3. At risk differs from on track by more than hue: its own glyph on the chip (alert) and
 * a diamond for its dot.
 */
export const SLA_TONES: Record<SlaTone, { chip: string; dot: string; alert?: true }> = {
  quiet: { chip: "text-ink-2", dot: "rounded-full bg-ink-2" },
  sun: { chip: "bg-camp-sun-tint px-1.5 text-camp-sun-ink", dot: "rounded-full bg-camp-sun-ink" },
  warning: { chip: "bg-warning/15 px-1.5 text-warning-ink", dot: "rotate-45 rounded-[1px] bg-warning-ink", alert: true },
  danger: { chip: "bg-destructive/10 px-1.5 text-danger-ink", dot: "rounded-full bg-danger-ink" },
  met: { chip: "text-success-ink", dot: "rounded-full bg-success-ink" },
  done: { chip: "text-ink-3", dot: "rounded-full bg-ink-3" },
  none: { chip: "", dot: "rounded-full border border-ink-3" },
}

/** A state's words ("At risk"); a key it doesn't know, as it came. */
export const slaLabel = (key: string) => SLA_CHOICES.find((c) => c.key === key)?.label ?? key


/** A task's SLA as the server lays it on a task read (H1: left out for a reader who may not read it, or with SLAs off). */
export type SlaState = "on_track" | "at_risk" | "breached" | "met"
export interface TaskSla {
  state: SlaState
  due_at?: string
  risk_at?: string
}

export type SlaBand = "low" | "medium" | "high" | "breached" | "met"

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN)

export function slaBand(sla: TaskSla, now: Date = new Date()): SlaBand {
  if (sla.state === "breached" || sla.state === "met") return sla.state
  if (sla.state === "at_risk") return "high"
  const due = ms(sla.due_at)
  const risk = ms(sla.risk_at)
  if (Number.isNaN(due) || Number.isNaN(risk)) return "low"
  return now.getTime() >= risk - (due - risk) ? "medium" : "low"
}

const UNITS = [
  { ms: 86_400_000, short: "d", long: "day" },
  { ms: 3_600_000, short: "h", long: "hour" },
  { ms: 60_000, short: "m", long: "minute" },
] as const

/** A span in its largest whole unit ("2d", "2 days"); under a minute is a minute. */
export function slaSpan(gap: number) {
  const u = UNITS.find((x) => gap >= x.ms) ?? UNITS[2]
  const n = Math.max(1, Math.floor(gap / u.ms))
  return { short: `${n}${u.short}`, long: `${n} ${u.long}${n === 1 ? "" : "s"}` }
}

/** The chip's words (short) and its tip's (long). */
export function slaWords(sla: TaskSla, now: Date = new Date()): { short: string; long: string } {
  const label = slaLabel(sla.state)
  if (sla.state === "met") return { short: label, long: `SLA ${label.toLowerCase()}` }
  const due = ms(sla.due_at)
  if (sla.state === "breached") return { short: label, long: `SLA ${label.toLowerCase()}${Number.isNaN(due) ? "" : ` ${slaSpan(now.getTime() - due).long} ago`}` }
  const head = sla.state === "at_risk" ? `SLA ${label.toLowerCase()}` : "SLA"
  if (Number.isNaN(due)) return { short: label, long: `${head}: on its clock` }
  const left = slaSpan(due - now.getTime())
  return { short: left.short, long: `${head}: ${left.long} left` }
}

/** Its tone (SLA_TONES above): breached in danger, high in warning, medium in sun, low quiet, met in success; a finished task's in none (as DueLabel). */
export function slaTone(band: SlaBand, done = false): SlaTone {
  if (done) return "done"
  if (band === "met") return "met"
  return band === "breached" ? "danger" : band === "high" ? "warning" : band === "medium" ? "sun" : "quiet"
}

/** What's chosen, in words, for the filter's chip. */
export const slaFilterWords = (values: string[]) => values.map(slaLabel).join(", ")


/** Whether a row draws the chip: an SLA on a task the reader sees, and not one already met. */
export const slaShown = (sla: TaskSla | undefined, hidden?: boolean): sla is TaskSla => !!sla && !hidden && sla.state !== "met"
