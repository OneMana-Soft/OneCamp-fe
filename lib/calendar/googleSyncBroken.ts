import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import type { CalendarSync } from "@/lib/calendar/calendarSync"
import { SYNC, syncUrl, type SyncProvider } from "@/lib/calendar/syncProviders"

type Read = { data?: CalendarSync }
type Connectors = { data?: { connectors?: { id: string; connected: boolean }[] } }
const PROVIDERS = Object.keys(SYNC) as SyncProvider[]

/**
 * A linked provider stopped answering the sync (C9: Google's, or Outlook's,
 * B7), for the closed Calendars button, in words: "Google needs connecting
 * again", "Google and Outlook need connecting again", or "". Only a linked
 * one (CR-B22 F1): the person's own Disconnect leaves Outlook's sync "broken"
 * (the next sweep finds no token) with nothing to connect again, while a token
 * Microsoft revoked keeps its connector row, so that one is still said.
 * Google's sync is read once it is connected; Outlook's always, and its link
 * from the connectors only while that sync says broken (the Calendars panel
 * reads the same keys). Small: it loads with the grid.
 */
export function useSyncBroken(googleConnected: boolean): string {
  const sync: Record<SyncProvider, CalendarSync | undefined> = {
    google: useFetch<Read>(googleConnected ? syncUrl("google") : "", undefined, undefined, OWN_ERRORS).data?.data,
    microsoft: useFetch<Read>(syncUrl("microsoft"), undefined, undefined, OWN_ERRORS).data?.data,
  }
  const connectors = useFetch<Connectors>(sync.microsoft?.state === "broken" ? "/connectors" : "", undefined, undefined, OWN_ERRORS).data?.data?.connectors
  const linked = (p: SyncProvider) => (p === "google" ? googleConnected : !!connectors?.find((c) => c.id === SYNC[p].connector)?.connected)
  const names = PROVIDERS.filter((p) => linked(p) && sync[p]?.state === "broken").map((p) => SYNC[p].name)
  return names.length ? `${names.join(" and ")} ${names.length > 1 ? "need" : "needs"} connecting again` : ""
}
