/**
 * Instance ids (calendar A7): the server names one instance of a repeating
 * event "<series id>_20261020T081500Z" ("<series id>_20261020" for an all-day
 * series), as Google does. Only the calendar's one store has them, so an id
 * of this shape is also how the calendar knows events repeat there. Kept
 * apart from lib/calendar/repeat so the calendar's first screen brings only
 * this. Pure.
 */

const INSTANCE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(\d{8}(T\d{6}Z)?)$/i

/** Whether an event's id names one instance of a repeating event. */
export function isInstanceId(id: string): boolean {
  return INSTANCE.test(id)
}

/** The series an instance's id names; the id itself for anything else. */
export function seriesIdOf(id: string): string {
  return INSTANCE.exec(id)?.[1] ?? id
}
