"use client"

import { clockTime } from "@/lib/utils/date/clock"
import { browserTZ } from "@/lib/utils/timeZone"
import { zoneCity, zoneLabel } from "@/lib/utils/zones"
import { zoneHere, type OtherZone } from "@/lib/calendar/otherZones"

/*
 * The zones a person keeps beside their own on the day and the week (calendar
 * head 6, gcal-3): a column each, left of their own hours, with its name over
 * it (the label they gave, else its city) and the time there at each of the
 * day's hours here, written short ("2pm", "2:30pm" where a zone is half an
 * hour off). A chunk of its own: only someone who keeps another zone fetches
 * it, and the week keeps its columns' room until it lands.
 */

/** Each zone's name over its column. */
export function ZoneNames({ zones, width }: { zones: OtherZone[]; width: number }) {
  return (
    <>
      {zones.map((z) => (
        <div key={z.zone} className="flex shrink-0 items-end justify-end pb-1.5 pr-1.5" style={{ width }} data-zone-name={z.zone}>
          <span className="line-clamp-2 break-words text-right text-micro font-medium text-ink-3" title={zoneLabel(z.zone)}>
            {z.label || zoneCity(z.zone)}
          </span>
        </div>
      ))}
    </>
  )
}

/** The reader's own zone's name, over their hours, once others stand beside it. */
export function OwnZoneName() {
  const own = browserTZ()
  return (
    <span className="line-clamp-2 break-words text-right" title={zoneLabel(own)} data-zone-name="">
      {zoneCity(own)}
    </span>
  )
}

/**
 * Each zone's hours on the lines of the reader's own: the time there at each
 * of `day`'s hours here. One day's offsets serve the week: a week the clocks
 * change in reads true from that day.
 */
export function ZoneHours({ zones, day, hours, width }: { zones: OtherZone[]; day: Date; hours: number[]; width: number }) {
  return (
    <>
      {zones.map((z) => (
        <div key={z.zone} className="shrink-0" style={{ width }} data-zone-hours={z.zone}>
          {hours.map((h) => (
            <div key={h} className="relative h-[var(--cal-hour)]">
              {/* A zone this browser can't read would show the device's own hours under its name. */}
              {h > 0 && zoneHere(z.zone) ? (
                <span className="absolute right-1.5 top-0 -translate-y-1/2 whitespace-nowrap text-micro tabular-nums text-ink-3">
                  {clockTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h), { timeZone: z.zone, compact: true })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
