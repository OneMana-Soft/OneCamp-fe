import { parseISO } from "date-fns"
import { dueState, dueWords } from "@/components/task/DueLabel"

/**
 * A day as a chip reads it on `today` ("2026-10-14"), by the app's one rule
 * for a day (components/task/DueLabel): "Today", "Tomorrow" and "Yesterday"
 * near it, else "12 Oct" (with the year when it isn't this one). Kept as the
 * day, so it ages: tomorrow's "Today" reads "Yesterday" (small-details D5).
 */
export const dateLabel = (day: string, today: string): string => dueWords(parseISO(day), parseISO(today))

/** A day that needs the reader, for something not done: today ("today"), or gone by ("overdue"). */
export function dayTone(day: string, today: string, done = false): "today" | "overdue" | undefined {
  const state = dueState(parseISO(day), done, parseISO(today))
  return state === "today" || state === "overdue" ? state : undefined
}
