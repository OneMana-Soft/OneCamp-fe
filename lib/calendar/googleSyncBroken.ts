import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import type { GoogleSync } from "@/lib/calendar/googleSync"

export const googleSyncUrl = "/calendar/sync/google"

/** Google stopped answering for the sync (C9), for the closed Calendars button; small, as it loads with the grid. */
export function useGoogleSyncBroken(connected: boolean): boolean {
  return useFetch<{ data?: GoogleSync }>(connected ? googleSyncUrl : "", undefined, undefined, OWN_ERRORS).data?.data?.state === "broken"
}
