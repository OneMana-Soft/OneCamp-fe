/**
 * A table's AI fills as they go: the table's topic says {"action": "ai_fill",
 * "fill"} as one moves on, stops or ends (useTableRows hears it, reading no
 * rows again); whatever shows its progress listens here (useAIFills).
 */
import type { AIFill } from "@/services/tableService"
import { formatLocale } from "@/lib/tables/numberFormat"

const listeners = new Map<string, Set<(fill: AIFill) => void>>()

/** Calls fn with each fill of the table as it moves; answers how to stop. */
export function onAIFill(tableId: string, fn: (fill: AIFill) => void): () => void {
  let set = listeners.get(tableId)
  if (!set) {
    set = new Set()
    listeners.set(tableId, set)
  }
  set.add(fn)
  return () => {
    const now = listeners.get(tableId)
    now?.delete(fn)
    if (now && now.size === 0) listeners.delete(tableId)
  }
}

/** Tells whatever shows the table's fills how one stands. */
export function aiFillHeard(tableId: string, fill: AIFill): void {
  for (const fn of listeners.get(tableId) ?? []) fn(fill)
}

/** The fill a table message carries; null when it isn't one. Pure. */
export function aiFillMessage(data: { action?: unknown; fill?: unknown } | undefined): AIFill | null {
  if (data?.action !== "ai_fill") return null
  const f = data.fill as Partial<AIFill> | null | undefined
  return f && typeof f.id === "string" && typeof f.field_id === "string" && typeof f.total === "number" ? (f as AIFill) : null
}

const n = (v: number) => formatLocale(v, {})

/** "1,200 of 3,200 done": Stop's name and tip, since the header keeps its width for the name. Pure. */
export function fillDone(f: AIFill): string {
  return `${n(Math.min(f.asked, f.total))} of ${n(f.total)} done`
}

/** A running fill's progress, as its column's header says it: "Filling 340 of 3,200". Pure. */
export function fillProgress(f: AIFill): string {
  return `Filling ${n(Math.min(f.asked, f.total))} of ${n(f.total)}`
}
