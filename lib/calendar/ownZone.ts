/**
 * An event's own time where it keeps a zone the reader isn't in (calendar
 * head 6, gcal-3): the card says it under the reader's own time. Pure but
 * for Intl.
 */

import { clockRange, clockTime } from "@/lib/utils/date/clock"
import { zoneCity } from "@/lib/utils/zones"
import { sameZone } from "@/lib/utils/sameZone"
import { zoneHere } from "@/lib/utils/zoneHere"
import type { CalendarEventInterface } from "@/types/calendar"

/**
 * "11:30 PM – 12:30 AM in Tokyo", or each end in its own zone when the event
 * ends in another ("11:30 PM in Tokyo – 3:30 PM in London"). "" where the
 * event keeps the reader's zone `reader`, keeps none (all day, or none given:
 * the API says none), or keeps one this browser can't write times in.
 */
export function ownZoneLine(event: Pick<CalendarEventInterface, "event_zone" | "event_end_zone">, start: Date, end: Date, reader: string): string {
  const zone = event.event_zone
  const endZone = event.event_end_zone || zone
  if (!zone || !endZone) return ""
  if (!zoneHere(zone) || !zoneHere(endZone) || (sameZone(zone, reader) && sameZone(endZone, reader))) return ""
  if (sameZone(zone, endZone)) return `${clockRange(start, end, { timeZone: zone })} in ${zoneCity(zone)}`
  return `${clockTime(start, { timeZone: zone })} in ${zoneCity(zone)} – ${clockTime(end, { timeZone: endZone })} in ${zoneCity(endZone)}`
}
