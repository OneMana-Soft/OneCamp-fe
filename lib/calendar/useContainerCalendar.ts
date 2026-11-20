"use client"

/** A project's, channel's or team's own calendar (gcal-14). Static: a lazy chunk would carry the shared core. */

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorStatus } from "@/lib/utils/apiError"
import { isAppOffline } from "@/lib/connectivity"
import { toast } from "@/hooks/use-toast"

export type ContainerKind = "project" | "channel" | "team"

/** calendarList's calendarListUrl (the test holds them equal): importing it would bring the list's hooks. */
export const LIST_URL = "/calendar/calendars"

/** Why it didn't open, in a line. Pure. */
export function openingProblem(err: unknown, kind: ContainerKind, offline = false): string {
  if (offline) return "You're offline. Open it when you're back online."
  if (apiErrorStatus(err) === 404) return `This ${kind}'s calendar isn't available.`
  return "Its calendar couldn't be opened. Try again in a moment."
}

/** onLeave closes the sheet it's opened from as it opens, never when it can't (V-1043). */
export function useContainerCalendar(kind: ContainerKind, id: string | undefined, onLeave?: () => void) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = useState(false)
  const open = useCallback(async () => {
    if (!id || busy) return
    if (isAppOffline()) return void toast({ title: openingProblem(null, kind, true), tone: "warning" })
    setBusy(true)
    try {
      const cal = (await axiosInstance.post(`/calendar/${kind}s/${encodeURIComponent(id)}/calendar`, undefined, OWN_ERRORS))?.data?.data?.id
      if (typeof cal !== "string" || !cal) throw new Error("no calendar")
      await mutate(LIST_URL)
      onLeave?.()
      router.push(`/app/calendar?calendar=${encodeURIComponent(cal)}`)
    } catch (err) {
      toast({ title: openingProblem(err, kind), tone: "error" })
    } finally {
      setBusy(false)
    }
  }, [kind, id, busy, router, mutate, onLeave])
  return { open, busy }
}
