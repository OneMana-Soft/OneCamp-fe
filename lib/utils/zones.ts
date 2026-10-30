/**
 * Time zones as people know them: "Eastern Time · New York (GMT-4)", never
 * "America/New_York". Every picker shares the list (components/ui/zonePicker).
 * Pure but for the browser's zone list, read once a picker first opens.
 */

import { dateTimeFormat } from "@/lib/utils/date/clock"
import { timeZones } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"

/**
 * A zone's name as Intl says it ("long", "longGeneric", "shortOffset"), or ""
 * when it can't. `keep` false builds a formatter that isn't kept: the zone
 * list asks once for each of some 420 zones.
 */
export function zoneName(tz: string, style: "long" | "longGeneric" | "shortOffset", keep = true): string {
  try {
    const f = keep ? dateTimeFormat("en-US", { timeZone: tz, timeZoneName: style }) : new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style })
    return f.formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

const RENAMED: Record<string, string> = { Calcutta: "Kolkata", Saigon: "Ho Chi Minh", Kiev: "Kyiv", Katmandu: "Kathmandu", Rangoon: "Yangon", Godthab: "Nuuk", Faeroe: "Faroe", Truk: "Chuuk", Ponape: "Pohnpei", Enderbury: "Kanton", Asmera: "Asmara" }

/** "New York": the place a zone is named for, by today's name ("Asia/Calcutta" is Kolkata). */
export const zoneCity = (tz: string) => ((c) => RENAMED[c] ?? c)(tz.split("/").pop() || tz).replace(/_/g, " ")

/** "India Standard Time (GMT+5:30)". */
export function zoneLabel(tz: string): string {
  const name = zoneName(tz, "long")
  const off = zoneName(tz, "shortOffset")
  return name ? `${name}${off ? ` (${off})` : ""}` : zoneCity(tz)
}

/**
 * A zone said ever shorter, for a label with little room: "Eastern Daylight
 * Time (GMT-4)", "Eastern Time (GMT-4)", "New York (GMT-4)", "GMT-4". The
 * aside cut the first to "Eastern Daylight Time (…", losing the offset,
 * which is the part a visitor checks.
 */
export function zoneLabels(tz: string): string[] {
  const off = zoneName(tz, "shortOffset")
  const withOff = (n: string) => (off ? `${n} (${off})` : n)
  const out = [zoneLabel(tz), withOff(zoneName(tz, "longGeneric") || zoneCity(tz)), withOff(zoneCity(tz))]
  if (off) out.push(off)
  return out.filter((v, i) => v && out.indexOf(v) === i)
}

/** One zone in a picker: its id, its name as people know it, its offset, and what a search finds it by. */
export interface ZoneRow {
  z: string
  label: string
  off: string
  hay: string
}

/**
 * Every zone as people know it ("Eastern Time · New York", with its offset),
 * the reader's own first: built the first time a picker opens and kept for
 * the page's life. It costs two formatters a zone, about 840, and was built
 * on load, twice, for two pickers nobody had opened (CAL-BUG-20).
 */
let zoneRowsKept: { first: string; rows: ZoneRow[] } | null = null
export function zoneRows(): ZoneRow[] {
  const first = browserTZ()
  if (zoneRowsKept?.first !== first) {
    const rows = timeZones(first).map((z) => {
      const generic = zoneName(z, "longGeneric", false)
      const city = zoneCity(z)
      const label = generic && !/^GMT/.test(generic) ? `${generic} · ${city}` : city
      return { z, label, off: zoneName(z, "shortOffset", false), hay: `${z.replace(/_/g, " ")} ${label}`.toLowerCase() }
    })
    zoneRowsKept = { first, rows }
  }
  return zoneRowsKept.rows
}
