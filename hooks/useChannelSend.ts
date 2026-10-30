"use client"

import { useCallback } from "react"
import { useBroadcastConfirm } from "@/hooks/useBroadcastConfirm"
import { useNotToldPrompt } from "@/hooks/useNotToldPrompt"

/**
 * What a channel's send goes through (the message box's sendThrough): a
 * broadcast to six or more asks first (D-T12), and once it goes, someone
 * named who isn't in the channel is said not to have been told (MC-83).
 */
export function useChannelSend(channelId: string, channelName: string) {
    const confirmBroadcast = useBroadcastConfirm()
    const notTold = useNotToldPrompt()
    return useCallback(
        (html: string, send: () => boolean | void) =>
            void confirmBroadcast(channelId, channelName, html, () => {
                if (send() !== false) void notTold(channelId, channelName, html)
            }),
        [confirmBroadcast, notTold, channelId, channelName],
    )
}
