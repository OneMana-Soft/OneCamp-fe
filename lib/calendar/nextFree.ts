import { addDays, endOfDay } from "date-fns"
import { CalendarPost } from "@/services/endpoints/calendar"
import type { WorkingHours } from "@/lib/calendar/availability"
import { DEFAULT_DRAFT_MINUTES, SNAP_MINUTES, ceilSnap } from "@/lib/calendar/calendarDrag"

/** A task's block from the calendar's Tasks list: its estimate snapped up, 15 minutes to 8 hours, else half an hour. Pure. */
export function taskBlockMinutes(estimate?: number): number {
  return estimate && estimate > 0 ? Math.min(480, Math.max(SNAP_MINUTES, ceilSnap(estimate))) : DEFAULT_DRAFT_MINUTES
}

/**
 * Your next free time for a task (gcal-new-task-blocks T1, the Tasks list's
 * "Block time"): the Availability Engine's suggestions for you alone (no
 * participants: the asker), from now to the end of the first working day
 * after tomorrow (a weekend or a Friday evening still finds Monday; the
 * earliest offered wins), a block's length long (the engine takes 15 minutes
 * to 8 hours). `hours` is what the event form's finder sends (defaultHours).
 * In the Tasks list's chunk. Pure.
 */
export function nextFreeAsk(now: Date, minutes: number, hours: WorkingHours) {
  let last = addDays(now, 2)
  for (let i = 0; i < 7 && !hours.days.includes(last.getDay()); i++) last = addDays(last, 1)
  return {
    apiEndpoint: CalendarPost.SuggestTimes,
    payload: { participants: [] as string[], duration_minutes: Math.min(480, Math.max(15, minutes)), from: now.toISOString(), to: endOfDay(last).toISOString(), hours },
    showErrorToast: true,
  }
}

/** The earliest time the engine offered, or null when it offered none. Pure. */
export function firstFree(answer: { suggestions?: { start: string; end: string }[] } | undefined): { start: Date; end: Date } | null {
  const first = [...(answer?.suggestions ?? [])].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]
  return first ? { start: new Date(first.start), end: new Date(first.end) } : null
}
