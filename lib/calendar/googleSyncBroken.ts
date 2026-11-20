import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import type { CalendarSync, staleWords } from "@/lib/calendar/calendarSync"
import { SYNC, syncUrl, type SyncProvider } from "@/lib/calendar/syncProviders"

type Read = { data?: CalendarSync }
type Connectors = { data?: { connectors?: { id: string; connected: boolean }[] } }
const PROVIDERS = Object.keys(SYNC) as SyncProvider[]
/** The Calendars panel's chunk (lazyView), which says a stale sync. */
type Panel = { useLoaded: (ask?: boolean) => { staleWords: typeof staleWords } | null }

/**
 * What the closed Calendars button says of the person's syncs, and how loud: a
 * linked provider that stopped answering (C9, B7; CR-B22 F1: only a linked
 * one), as danger, "Google needs connecting again"; else one its provider
 * can't be read for (gcal-18), as a warning, in the panel's words (its chunk
 * is asked for once one is stale). It reads the panel's keys, the connectors only
 * while Outlook's says broken. Small: it loads with the grid.
 */
export function useSyncNote(googleConnected: boolean, panel: Panel): { words: string; tone?: "danger" | "warning" } {
  const sync: Record<SyncProvider, CalendarSync | undefined> = {
    google: useFetch<Read>(googleConnected ? syncUrl("google") : "", undefined, undefined, OWN_ERRORS).data?.data,
    microsoft: useFetch<Read>(syncUrl("microsoft"), undefined, undefined, OWN_ERRORS).data?.data,
  }
  const said = panel.useLoaded(PROVIDERS.some((p) => sync[p]?.state === "synced" && sync[p]?.stale_since))
  const connectors = useFetch<Connectors>(sync.microsoft?.state === "broken" ? "/connectors" : "", undefined, undefined, OWN_ERRORS).data?.data?.connectors
  const linked = (p: SyncProvider) => (p === "google" ? googleConnected : !!connectors?.find((c) => c.id === SYNC[p].connector)?.connected)
  const names = PROVIDERS.filter((p) => linked(p) && sync[p]?.state === "broken").map((p) => SYNC[p].name)
  if (names.length) return { words: `${names.join(" and ")} ${names.length > 1 ? "need" : "needs"} connecting again`, tone: "danger" }
  const stale = said ? PROVIDERS.map((p) => said.staleWords(p, sync[p])).filter(Boolean).join("; ") : ""
  return stale ? { words: stale, tone: "warning" } : { words: "" }
}
