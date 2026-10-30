"use client"

// Focus time from the sidebar foot, the profile menu and the phone's You sheet
// (design v3, shell S12 and M2). Focus is a calendar event marked as focus:
// while it runs, the creator's notifications pause (the server reports it as
// focus_until). Starting focus makes that event, from now for the length
// asked (useStartFocus). Ending it asks the server to end whatever focus time
// is running, wherever it was started: the phone, the desktop app, the
// calendar or another browser.

import { useCallback } from "react"
import { usePost } from "@/hooks/usePost"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { FOCUS_DEFAULT_MINUTES, focusTimeChanged, useStartFocus } from "@/hooks/useStartFocus"
import { PostEndpointUrl } from "@/services/endPoints"

/** How far through a focus block we are, 0 to 1. Pure. */
export function focusProgress(start: Date | null, end: Date | null, now: number): number {
  if (!start || !end) return 0
  const span = end.getTime() - start.getTime()
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (now - start.getTime()) / span))
}

export function useFocusTime() {
  const { makeRequest, isSubmitting } = usePost()
  const { focusUntil } = usePauseNotifications()
  // The server says when focus time ends, not when it began: a block reads as
  // long as one started from here.
  const focusStart = focusUntil ? new Date(focusUntil.getTime() - FOCUS_DEFAULT_MINUTES * 60_000) : null

  // Starting is the phone's and the desktop's one way in (useStartFocus).
  const { startFocus: start, starting } = useStartFocus()

  // Ends whatever focus time the caller is in, wherever it was started.
  const end = useCallback(async (): Promise<boolean> => {
    try {
      const res = await makeRequest<Record<string, never>, { ended?: string[] }>({
        apiEndpoint: PostEndpointUrl.EndFocus,
        payload: {},
        showErrorToast: true,
        failureTitle: "Couldn't end focus time",
      })
      focusTimeChanged(res?.ended)
      return true
    } catch {
      // makeRequest's toast said why. What the server did end still shows.
      focusTimeChanged()
      return false
    }
  }, [makeRequest])

  return { focusUntil, focusStart, start, end, busy: isSubmitting || starting }
}
