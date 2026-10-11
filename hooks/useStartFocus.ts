"use client"

// Starting focus time from the chrome (design v3: the phone's You block, the
// profile menu's "Start focus time"). Focus time is a calendar event marked as
// focus, and the server reads the pause from it (usePauseNotifications'
// focusUntil), so starting one is creating that event from now. Then
// "dnd-changed" tells every reader of the pause to look again.

import { useCallback } from "react"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import type { CreateEventPayload } from "@/types/calendar"

export const FOCUS_DEFAULT_MINUTES = 60

/** The event a focus block of `minutes` from `now` is. Pure, for its test. */
export function focusEventFor(now: Date, minutes = FOCUS_DEFAULT_MINUTES): CreateEventPayload {
  const end = new Date(now.getTime() + minutes * 60_000)
  return {
    title: "Focus time",
    description: "",
    startTime: now.toISOString(),
    endTime: end.toISOString(),
    syncToGoogleCalendar: false,
    participants: [],
    isFocus: true,
    isAway: false,
  }
}

/** Where this browser keeps the focus block it started, so End can find it. */
export const STARTED_FOCUS_KEY = "onecamp:focus-event"

export interface StartedFocus {
  uuid: string
  start: string
  end: string
}

/** Keeps (or forgets) the block this browser started. Storage may refuse; End then falls back to the calendar. */
export function rememberFocus(v: StartedFocus | null) {
  try {
    if (v) localStorage.setItem(STARTED_FOCUS_KEY, JSON.stringify(v))
    else localStorage.removeItem(STARTED_FOCUS_KEY)
  } catch {
    /* storage refused */
  }
}

export function useStartFocus() {
  const { makeRequest, isSubmitting } = usePost()
  const start = useCallback(
    async (minutes = FOCUS_DEFAULT_MINUTES): Promise<boolean> => {
      const payload = focusEventFor(new Date(), minutes)
      const res = await makeRequest<CreateEventPayload, { eventUuid?: string }>({
        apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
        payload,
        showErrorToast: true,
      })
      if (!res) return false
      if (res.eventUuid) rememberFocus({ uuid: res.eventUuid, start: payload.startTime, end: payload.endTime })
      try {
        window.dispatchEvent(new Event("dnd-changed"))
      } catch {
        /* no window */
      }
      return true
    },
    [makeRequest],
  )
  return { startFocus: start, starting: isSubmitting }
}
