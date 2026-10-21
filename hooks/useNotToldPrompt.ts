"use client"

import { useCallback } from "react"

/**
 * After a channel message names someone who isn't in it, says they weren't
 * told, with Add them (lib/conversation/notToldPrompt, loaded only for a
 * message that names someone).
 */
export function useNotToldPrompt() {
  return useCallback(async (channelId: string, channelName: string, html: string | null | undefined) => {
    if (!channelId || !html?.includes('data-type="mention"')) return
    const { promptNotTold } = await import("@/lib/conversation/notToldPrompt")
    await promptNotTold(channelId, channelName, html)
  }, [])
}
