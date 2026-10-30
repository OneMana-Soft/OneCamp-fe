/**
 * An event's own time where it keeps a zone the reader isn't in (calendar
 * head 6, gcal-3): the card says it under the reader's own time. Pure but
 * for Intl.
 */

import { clockRange, clockTime } from "@/lib/utils/date/clock"
import { zoneCity } from "@/lib/utils/zones"
import { zoneHere } from "@/lib/calendar/otherZones"
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
  const [at, until, here] = [zoneHere(zone), zoneHere(endZone), zoneHere(reader)]
  if (!at || !until || (at === here && until === here)) return ""
  if (at === until) return `${clockRange(start, end, { timeZone: zone })} in ${zoneCity(zone)}`
  return `${clockTime(start, { timeZone: zone })} in ${zoneCity(zone)} – ${clockTime(end, { timeZone: endZone })} in ${zoneCity(endZone)}`
}
