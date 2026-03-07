"use client"

import { useCallback, useRef } from "react"
import { useDispatch } from "react-redux"
import { invalidateAllChatMessages } from "@/store/slice/chatSlice"
import { invalidateChannelPosts } from "@/store/slice/channelSlice"
import { invalidateGroupChatMessages } from "@/store/slice/groupChatSlice"
import { invalidateChatComments } from "@/store/slice/chatCommentSlice"
import { invalidateChannelComments } from "@/store/slice/channelCommentSlice"
import { invalidateTaskComments } from "@/store/slice/createTaskCommentSlice"
import { invalidateDocComments } from "@/store/slice/createDocCommentSlice"
import { mutate } from "swr"
import { GetEndpointUrl } from "@/services/endPoints"

// Threshold in milliseconds: if the gap between last healthy connection
// and reconnection exceeds this, we invalidate Redux state and force API refetch.
// 30 seconds is generous enough that MQTT persistent sessions handle short blips,
// but catches any real gaps where messages could be lost.
const STALE_THRESHOLD_MS = 30_000

export const useMessageSyncManager = () => {
    const dispatch = useDispatch()

    // Timestamp of the last known healthy MQTT state (message received or connection confirmed stable)
    const lastHealthyTimestampRef = useRef<number>(Date.now())

    // Whether the MQTT client has connected at least once (to distinguish first connect from reconnect)
    const hasConnectedOnceRef = useRef<boolean>(false)

    /**
     * Called whenever an MQTT message is successfully received or the connection is confirmed stable.
     * Keeps the "last healthy" watermark fresh.
     */
    const markHealthy = useCallback(() => {
        lastHealthyTimestampRef.current = Date.now()
    }, [])

    /**
     * Called when MQTT connects. On first connect this is a no-op.
     * On subsequent reconnects, it checks the gap and invalidates if stale.
     */
    const handleConnectionEstablished = useCallback(() => {
        if (!hasConnectedOnceRef.current) {
            // First connection — nothing to sync, data is fresh from API
            hasConnectedOnceRef.current = true
            lastHealthyTimestampRef.current = Date.now()
            return
        }

        // This is a RECONNECT — check how long we were disconnected
        const gap = Date.now() - lastHealthyTimestampRef.current

        if (gap >= STALE_THRESHOLD_MS) {
            console.log(
                `[SYNC] Stale connection detected (gap: ${Math.round(gap / 1000)}s). Invalidating message state and refetching...`
            )

            // 1. Clear all loaded messages AND comments from Redux
            //    This triggers useMessagePagination to refetch when messages.length === 0
            dispatch(invalidateAllChatMessages())
            dispatch(invalidateChannelPosts())
            dispatch(invalidateGroupChatMessages())
            dispatch(invalidateChatComments())
            dispatch(invalidateChannelComments())
            dispatch(invalidateTaskComments())
            dispatch(invalidateDocComments())

            // 2. Bust the SWR cache for message endpoints so the next fetch is fresh
            //    mutate() with a filter invalidates all matching keys
            mutate(
                (key: string) =>
                    typeof key === "string" &&
                    (key.startsWith(GetEndpointUrl.GetChatLatestMessage) ||
                        key.startsWith(GetEndpointUrl.GetChannelLatestPost) ||
                        key.startsWith(GetEndpointUrl.GetGroupChatLatestMessage) ||
                        key.startsWith(GetEndpointUrl.GetUserLatestChatList) ||
                        key.startsWith("/dm/") ||
                        key.startsWith("/po/") ||
                        key.startsWith("/groupChat/")),
                undefined,
                { revalidate: true }
            )

            // 3. Also refetch the chat list to update unread counts
            mutate(
                (key: string) =>
                    typeof key === "string" &&
                    key.startsWith(GetEndpointUrl.GetUserLatestChatList),
                undefined,
                { revalidate: true }
            )
        } else {
            console.log(
                `[SYNC] Reconnected after short gap (${Math.round(gap / 1000)}s). Trusting MQTT persistent session.`
            )
        }

        // Reset the healthy timestamp
        lastHealthyTimestampRef.current = Date.now()
    }, [dispatch])

    /**
     * Called when MQTT disconnects. We freeze the timestamp so the gap measurement
     * starts from the last healthy point, not from when we reconnect.
     */
    const handleDisconnected = useCallback(() => {
        // Don't update lastHealthyTimestampRef — we want it frozen at the last good time
    }, [])

    return {
        markHealthy,
        handleConnectionEstablished,
        handleDisconnected,
    }
}
