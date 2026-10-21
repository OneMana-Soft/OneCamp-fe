"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"

/** Asks before a message notifies a whole channel (lib/conversation/broadcastConfirm, loaded only for a broadcast). */
export function useBroadcastConfirm() {
  const dispatch = useDispatch()
  return useCallback(
    async (channelId: string, channelName: string, html: string | null | undefined, send: () => void) => {
      if (!channelId || !html?.includes('data-id="broadcast:')) return send()
      const { askBeforeBroadcast } = await import("@/lib/conversation/broadcastConfirm")
      return askBeforeBroadcast(dispatch, channelId, channelName, html, send)
    },
    [dispatch],
  )
}
