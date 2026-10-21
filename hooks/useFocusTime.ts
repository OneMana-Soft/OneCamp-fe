"use client"

// Focus time from the sidebar foot and the profile menu (design v3, shell S12
// and M2). Focus is a calendar event marked as focus: while it runs, the
// creator's notifications pause (the server reports it as focus_until). So
// starting focus makes that event, from now for the length asked, and ending
// it early moves its end to now. The event this browser started is kept, so
// End can find it; focus started from the calendar is ended there.

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePost } from "@/hooks/usePost"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { PostEndpointUrl } from "@/services/endPoints"
import type { CreateEventPayload } from "@/types/calendar"
import { STARTED_FOCUS_KEY, rememberFocus, useStartFocus, type StartedFocus } from "@/hooks/useStartFocus"
import { app_calendar_path } from "@/types/paths"

function readStarted(): StartedFocus | null {
  try {
    const v = JSON.parse(localStorage.getItem(STARTED_FOCUS_KEY) || "null") as StartedFocus | null
    return v && typeof v.uuid === "string" ? v : null
  } catch {
    return null
  }
}

/** How far through a focus block we are, 0 to 1. Pure. */
export function focusProgress(start: Date | null, end: Date | null, now: number): number {
  if (!start || !end) return 0
  const span = end.getTime() - start.getTime()
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (now - start.getTime()) / span))
}

export function useFocusTime() {
  const router = useRouter()
  const { makeRequest, isSubmitting } = usePost()
  const { focusUntil } = usePauseNotifications()

  const started = typeof window === "undefined" ? null : readStarted()
  // The block this browser started, while it is the one running.
  const ours = started && focusUntil && Math.abs(new Date(started.end).getTime() - focusUntil.getTime()) < 120_000 ? started : null
  // Without a start of our own, a block reads as an hour long.
  const focusStart = ours ? new Date(ours.start) : focusUntil ? new Date(focusUntil.getTime() - 60 * 60_000) : null

  // Starting is the phone's and the desktop's one way in (useStartFocus).
  const { startFocus: start } = useStartFocus()

  const end = useCallback(async () => {
    if (!ours) {
      router.push(app_calendar_path)
      return false
    }
    const res = await makeRequest<CreateEventPayload>({
      apiEndpoint: `${PostEndpointUrl.UpdateCalendarEvent}/${ours.uuid}` as string,
      payload: { title: "Focus time", startTime: ours.start, endTime: new Date().toISOString(), isFocus: true },
      showErrorToast: true,
    })
    if (!res) return false
    rememberFocus(null)
    window.dispatchEvent(new Event("dnd-changed"))
    return true
  }, [makeRequest, ours, router])

  return { focusUntil, focusStart, start, end, busy: isSubmitting }
}
