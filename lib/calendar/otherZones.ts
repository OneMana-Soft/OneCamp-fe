import { dateTimeFormat } from "@/lib/utils/date/clock"

/** A zone kept beside the reader's own (calendar head 6; preference calendar.zones), named for its column. */
export interface OtherZone {
  zone: string
  label?: string
}

/** Three columns with the reader's own (the server's MaxOtherZones). */
export const MAX_OTHER_ZONES = 2

/** A zone as this browser names it (Asia/Kolkata may be Asia/Calcutta), or "" for one it can't read. */
export function zoneHere(zone: string): string {
  try {
    return dateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return ""
  }
}
