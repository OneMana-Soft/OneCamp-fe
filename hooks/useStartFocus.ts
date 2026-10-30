"use client"

// Starting focus time from the chrome (design v3: the phone's You block, the
// profile menu's "Start focus time"). Focus time is a calendar event marked as
// focus, and the server reads the pause from it (usePauseNotifications'
// focusUntil), so starting one is creating that event from now. Then
// focusTimeChanged has every reader of the pause and the calendar look again.

import { useCallback } from "react"
import { usePost } from "@/hooks/usePost"
import { showsEvent } from "@/lib/calendar/eventCache"
import { appMutate } from "@/lib/swrMutate"
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

/**
 * After focus time starts or ends from the chrome: every reader of the pause
 * ("dnd-changed": the sidebar's foot, the profile menu, the You sheet) and the
 * calendar's lists, and the events named, read again.
 */
export function focusTimeChanged(eventIds: readonly string[] = []) {
  window.dispatchEvent(new Event("dnd-changed"))
  void appMutate((key) => showsEvent(key, null) || eventIds.some((id) => showsEvent(key, id)))
}

export function useStartFocus() {
  const { makeRequest, isSubmitting } = usePost()
  const start = useCallback(
    async (minutes = FOCUS_DEFAULT_MINUTES): Promise<boolean> => {
      try {
        await makeRequest<CreateEventPayload>({
          apiEndpoint: PostEndpointUrl.CreateCalendarEvent,
          payload: focusEventFor(new Date(), minutes),
          showErrorToast: true,
          failureTitle: "Couldn't start focus time",
        })
      } catch {
        // makeRequest's toast said why.
        return false
      }
      focusTimeChanged()
      return true
    },
    [makeRequest],
  )
  return { startFocus: start, starting: isSubmitting }
}
