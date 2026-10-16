import type { CampHue } from "@/lib/campHue"
import { clockTime } from "@/lib/utils/date/clock"

/**
 * The AI's starter questions, built from what is true for this person now
 * (hub.md AI3). Generic prompts ("What did the team discuss today?") read as
 * a demo of a chatbot; "Prepare me for Launch sync at 11:00" reads as the
 * product knowing the day. Each carries the tile of the FEATURE it is about
 * (a channel, tasks, the calendar, a draft), so the hue names the feature.
 *
 * At most four, real names only, and the generic three when nothing is known.
 */
export type SuggestionIcon = "hash" | "tasks" | "calendar" | "pen" | "spark"

export interface Suggestion {
  text: string
  hue: CampHue | "agent"
  icon: SuggestionIcon
}

export interface SuggestionContext {
  /** The channel the person was last in. */
  recentChannel?: string
  /** Tasks due or overdue for them (the needs-me count). */
  tasksDue?: number
  /** The next event on their calendar today. */
  nextEvent?: { title: string; at?: Date }
  /** Something they could ask the AI to draft (a task due today, say). */
  draft?: string
}

export const GENERIC_SUGGESTIONS: Suggestion[] = [
  { text: "What are the recent updates in my channels?", hue: "sky", icon: "hash" },
  { text: "Summarise my pending tasks", hue: "moss", icon: "tasks" },
  { text: "What did the team discuss today?", hue: "agent", icon: "spark" },
]

export function suggestionsFrom(ctx: SuggestionContext | undefined): Suggestion[] {
  const out: Suggestion[] = []
  const channel = ctx?.recentChannel?.trim().replace(/^#/, "")
  if (channel) out.push({ text: `What changed in #${channel} since yesterday?`, hue: "sky", icon: "hash" })
  const n = ctx?.tasksDue ?? 0
  if (n > 0) out.push({ text: n === 1 ? "Summarise my task that's due" : `Summarise my ${n} tasks that are due`, hue: "moss", icon: "tasks" })
  const ev = ctx?.nextEvent
  if (ev?.title?.trim()) {
    const at = ev.at && !Number.isNaN(ev.at.getTime()) ? ` at ${clockTime(ev.at)}` : ""
    out.push({ text: `Prepare me for ${ev.title.trim()}${at}`, hue: "sky", icon: "calendar" })
  }
  const draft = ctx?.draft?.trim()
  if (draft) out.push({ text: `Draft ${draft.charAt(0).toLowerCase()}${draft.slice(1)}`, hue: "dusk", icon: "pen" })
  return out.length > 0 ? out.slice(0, 4) : GENERIC_SUGGESTIONS
}
