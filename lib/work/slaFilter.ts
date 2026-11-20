// The SLA filter's and grouping's ids and words (linear-24 W1) for a list's first load; the rest is ./sla, a chunk.
export const TASK_SLA = "task_sla"
export const NO_SLA = "none"

/** An SLA's tone: lib/work/sla SLA_TONES draws each (the chip, the Filter's dot); the group header reads danger. */
export type SlaTone = "quiet" | "sun" | "warning" | "danger" | "met" | "done" | "none"

/** Each state's words and tone, breaches first, then no SLA. */
export const SLA_CHOICES: { key: string; label: string; tone: SlaTone; closed?: true }[] = [
  { key: "breached", label: "Breached", tone: "danger" },
  { key: "at_risk", label: "At risk", tone: "warning" },
  { key: "on_track", label: "On track", tone: "quiet" },
  { key: "met", label: "Met", tone: "met", closed: true },
  { key: NO_SLA, label: "No SLA", tone: "none" },
]

/** The sort the server runs (H3): breaches soonest first, then the rest by the time left. It has one direction only. */
export const SLA_SORT = { id: TASK_SLA, desc: false, label: "SLA, breaches soonest" } as const
