import { dateTimeFormat } from "@/lib/utils/date/clock"

/** A zone's name as this runtime reads it, or "" ("Asia/Kolkata" is "Asia/Calcutta" in Chromium; WebKit keeps names as given). */
export function zoneHere(zone: string): string {
  try {
    return dateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return ""
  }
}
