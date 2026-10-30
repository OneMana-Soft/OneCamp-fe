import { clockHour, clockRange, clockTime, readsTwelveHour } from "@/lib/utils/date/clock"

/** An event's span: across noon, "11 AM – 12 PM" as Google writes it; else clockRange's. The calendar's own: the shared clock stays as it is. */
export function spanLabel(a: Date, b: Date): string {
  const at = (d: Date) => (d.getMinutes() ? clockTime(d) : clockHour(d))
  return readsTwelveHour() && a.toDateString() === b.toDateString() && a.getHours() < 12 !== b.getHours() < 12 ? `${at(a)} – ${at(b)}` : clockRange(a, b)
}
