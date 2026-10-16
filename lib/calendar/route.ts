/**
 * Where the calendar opens: the one rule for every link to an event or to the
 * calendar (calendar programme, PROGRAM.md §5), which notifications, chips,
 * search and email call.
 *
 * DAY 0. Today's addresses: an event at /app/calendar/event/<id> (the page that
 * opens it by id, on a phone and from a link), anything else at /app/calendar.
 * A0 puts the day and the view in the address (?date=2026-10-13&view=week) and
 * grows this rule to say them. Pure.
 */
export function calendarRoute(to: { event?: string | null } = {}): string {
  return to.event ? `/app/calendar/event/${to.event}` : "/app/calendar"
}
