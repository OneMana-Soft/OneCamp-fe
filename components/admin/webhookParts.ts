/**
 * What a webhook row says (design v3, admin §A20), as pure functions so the
 * rules are tested without the card: its address with the middle elided, at
 * most three events and a count of the rest, and how its last delivery went.
 */

import { middleEllipsis } from "@/components/ui/settingsControls"
import { relativeTime } from "@/lib/utils/relativeTime"
import type { StateTone } from "@/components/admin/connectParts"

/** How many event chips a row shows before "+N". */
export const EVENTS_SHOWN = 3

/** The events a webhook stores, as a JSON array in a string; anything else reads as none. */
export function parseEvents(raw: string | undefined | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : []
  } catch {
    return []
  }
}

/** The first three events and how many more there are: a row stays one line. */
export function eventChips(events: string[], shown = EVENTS_SHOWN): { shown: string[]; more: number } {
  return { shown: events.slice(0, shown), more: Math.max(0, events.length - shown) }
}

/**
 * A long address with its middle elided, keeping the host and the last part of
 * the path, the two parts an admin tells webhooks apart by.
 */
export function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "")
  return middleEllipsis(bare, 22, 14)
}

export interface DeliveryState {
  tone: StateTone
  word: string
}

/**
 * How the webhook's last delivery went, as a dot and a word: "Delivered · 2m
 * ago" in moss, "Failing · 3 in a row" in danger, "Off" in ink-3. The list
 * carries no response code (see the report: the backend gives a failure count
 * and the last time it fired, not the last status), so the word says what the
 * count says.
 */
export function deliveryState(
  w: { type: "incoming" | "outgoing"; is_active: boolean; failure_count: number; last_triggered_at?: string; paused_at?: string },
  now: number = Date.now(),
): DeliveryState {
  if (!w.is_active) return { tone: "neutral", word: "Off" }
  if (w.paused_at) return { tone: "warning", word: "Paused" }
  const ago = w.last_triggered_at ? relativeTime(w.last_triggered_at, now) : ""
  if (w.type === "outgoing") {
    if (w.failure_count > 0) return { tone: "danger", word: `Failing · ${w.failure_count} in a row` }
    return ago ? { tone: "success", word: `Delivered · ${ago}` } : { tone: "neutral", word: "Nothing sent yet" }
  }
  return ago ? { tone: "success", word: `Used · ${ago}` } : { tone: "neutral", word: "Not used yet" }
}

/**
 * Why a paused webhook waits, as the list says it (business/Hooks' reasons), or
 * null when it isn't paused. Its deliveries wait meanwhile, and Resume sends
 * them; an admin who resumes one its owner can no longer send takes it over.
 */
export function pausedWhy(w: { paused_at?: string; paused_reason?: string; scope_type?: string }): string | null {
  if (!w.paused_at) return null
  switch (w.paused_reason) {
    case "owner_cant_read":
      return `Paused: its owner can't read the ${w.scope_type === "project" ? "project" : "channel"} it's set up for.`
    case "owner_left":
      return "Paused: its owner is no longer a member."
    case "failing":
      return "Paused after failing 50 times in a row."
  }
  return "Paused by an admin."
}

/** Whether it fired in the last seven days: deleting it then asks for its name. */
export function deliveredRecently(lastTriggeredAt: string | undefined, now: number = Date.now()): boolean {
  if (!lastTriggeredAt) return false
  const t = Date.parse(lastTriggeredAt)
  return Number.isFinite(t) && now - t < 7 * 86_400_000
}

/** Events grouped by what they are about: "task.created" goes under "task". */
export function groupEvents(events: string[]): Array<{ resource: string; events: string[] }> {
  const groups = new Map<string, string[]>()
  for (const ev of events) {
    const resource = ev.includes(".") ? ev.slice(0, ev.indexOf(".")) : "other"
    groups.set(resource, [...(groups.get(resource) ?? []), ev])
  }
  return [...groups.entries()].map(([resource, evs]) => ({ resource, events: evs }))
}
