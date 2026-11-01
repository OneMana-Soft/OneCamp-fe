"use client"

import { useConfirm } from "@/hooks/useConfirm"
import { usePost } from "@/hooks/usePost"
import { addCallRequest, callLobbyRequest, removeCallRequest } from "@/lib/calendar/eventsApi"

/**
 * An event's own call (calendar B11) added and taken off, for its card and its
 * page alike: add makes it on demand; remove asks first, in red, as its link
 * stops working and anyone in the call leaves; setInviteesWait makes its
 * guests by email knock at it, or come straight in again (meet-02). The server
 * decides who may (whoever may change the event). refresh reads the event
 * again after each.
 */
export function useEventCallActions(eventId: string, refresh: () => unknown) {
  const post = usePost()
  const confirm = useConfirm()
  const add = async () => {
    try {
      await post.makeRequest(addCallRequest(eventId))
      await refresh()
    } catch {
      // The request's own toast says why (showErrorToast).
    }
  }
  const remove = () =>
    confirm({
      title: "Remove this event's call?",
      description: "Its link stops working, and anyone in the call leaves it. You can add a new call later.",
      confirmText: "Remove call",
      destructive: true,
      onConfirm: async () => {
        await post.makeRequest(removeCallRequest(eventId))
        await refresh()
      },
    })
  // Resolves to whether it held.
  const setInviteesWait = async (wait: boolean) => {
    try {
      await post.makeRequest(callLobbyRequest(eventId, wait))
      await refresh()
      return true
    } catch {
      // The request's own toast says why (showErrorToast).
      return false
    }
  }
  return { add, remove, setInviteesWait, adding: post.isSubmitting }
}
