"use client"

// usePauseNotifications: whether the person has paused notifications, and the
// two moves (pause until a moment, resume). The pause lives on the server, so
// it covers every device; this device keeps a copy for pushes already in
// flight. /dnd changes it server-side and says so with a "dnd-changed" event.

import { useCallback, useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { activePause, rememberPause } from "@/lib/notifications/pause"

type PauseState = { notifications_paused_until?: string | null }

export function usePauseNotifications() {
  const { data, mutate } = useFetch<{ data?: PauseState }>(GetEndpointUrl.GetNotificationPreferences)
  const { makeRequest, isSubmitting } = usePost()
  const raw = data?.data?.notifications_paused_until
  const until = activePause(raw)
  const untilMs = until?.getTime() ?? 0

  // Keep this device's copy in step with the server.
  useEffect(() => {
    if (data) rememberPause(untilMs ? new Date(untilMs) : null)
  }, [data, untilMs])

  // Show the pause ending when it ends.
  useEffect(() => {
    if (!untilMs) return
    const t = setTimeout(() => void mutate(), Math.min(untilMs - Date.now() + 1000, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [untilMs, mutate])

  useEffect(() => {
    const onChanged = () => void mutate()
    window.addEventListener("dnd-changed", onChanged)
    return () => window.removeEventListener("dnd-changed", onChanged)
  }, [mutate])

  const set = useCallback(
    async (at: Date | null): Promise<boolean> => {
      const res = await makeRequest<{ until?: string }, PauseState>({
        apiEndpoint: PostEndpointUrl.PauseNotifications,
        payload: at ? { until: at.toISOString() } : {},
        showErrorToast: true,
      })
      if (!res) return false
      rememberPause(res.notifications_paused_until ?? null)
      await mutate()
      return true
    },
    [makeRequest, mutate],
  )

  return {
    pausedUntil: until,
    pause: (at: Date) => set(at),
    resume: () => set(null),
    busy: isSubmitting,
  }
}
