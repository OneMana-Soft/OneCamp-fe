/**
 * Cycles across projects (linear-12, part 3): every project's running cycle,
 * as GET /project/cycles/running answers it for the reader. Pure.
 */

import type { Cycle } from "@/lib/tasks/cycles"

export type CyclePace = "on_track" | "behind" | "empty"

export interface RunningCycle extends Cycle {
  project_name: string
  /** How much of its time has gone, 0 to 1. */
  elapsed: number
  days_left: number
  pace: CyclePace
}

export const RUNNING_CYCLES_URL = "/project/cycles/running"

/** The pace in words, and the chip tone that goes with it (none when fine). */
export function paceWords(p: CyclePace): { label: string; tone?: "sun" } {
  if (p === "behind") return { label: "Behind", tone: "sun" }
  if (p === "empty") return { label: "No tasks yet" }
  return { label: "On track" }
}

/** "3 days left", "1 day left", "Ends today". */
export function daysLeftWords(days: number): string {
  if (days <= 0) return "Ends today"
  return days === 1 ? "1 day left" : `${days} days left`
}

/** "4 of 9 done". */
export function doneWords(p?: { total: number; done: number }): string {
  if (!p || p.total === 0) return "No tasks"
  return `${p.done} of ${p.total} done`
}

/** The cycles behind first, then by the server's order (soonest to end). */
export function behindFirst(list: RunningCycle[]): RunningCycle[] {
  return list.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.pace === "behind") - Number(a.c.pace === "behind") || a.i - b.i).map(({ c }) => c)
}
