"use client"

import { useCallback, useRef } from "react"
import { useDispatch } from "react-redux"
import { triggerMessageResync } from "@/store/slice/messageResyncSlice"
import { mutate } from "swr"
import { GetEndpointUrl } from "@/services/endPoints"

// Threshold in milliseconds: if the gap between last healthy connection
// and reconnection exceeds this, we reconcile mounted conversations
// against the server. 30 seconds is generous enough that MQTT persistent
// sessions handle short blips, but catches any real gaps where messages
// could be lost.
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
     * On subsequent reconnects, it checks the gap and reconciles if stale.
     *
     * NON-DESTRUCTIVE STRATEGY:
     * We do NOT clear Redux message/comment state here. Wiping state made
     * the conversation pane flash empty on every return-to-tab — and, when
     * the refetch effects' dependency arrays didn't observe the wipe, the
     * pane stayed permanently empty (the "messages disappear when the tab
     * is idle" bug). Instead we:
     *   1. Bump the resync nonce. Mounted conversation views observe it,
     *      refetch their "latest" page, and MERGE new messages in by uuid.
     *      Nothing visible is removed; missed messages simply appear.
     *   2. Revalidate the chat-list SWR key so sidebar unread counts and
     *      previews catch up.
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
            // 1. Tell every mounted conversation to reconcile against the
            //    server (window-reconcile — applies adds/edits/deletes within
            //    the latest window, no wipe, no empty flash).
            dispatch(triggerMessageResync())

            // 2. Refresh the chat list so unread counts / previews update.
            //    This is a list (not the message body) so a background
            //    revalidate is the right tool — no flash risk here.
            mutate(
                (key: string) =>
                    typeof key === "string" &&
                    (key.startsWith(GetEndpointUrl.GetUserLatestChatList) ||
                        // Admin archive panel: published over MQTT, so a long
                        // gap could mean we missed a "completed" event. Cheap
                        // to revalidate (admin-only, two endpoints).
                        key.startsWith(GetEndpointUrl.GetArchiveJobs) ||
                        key.startsWith(GetEndpointUrl.GetArchiveStats)),
                undefined,
                { revalidate: true }
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

    /**
     * Called when the tab/PWA returns to the foreground (visibilitychange →
     * visible, or window focus).
     *
     * WHY THIS EXISTS (the iOS-PWA "stale tab" bug):
     * On mobile — iOS Safari/PWA especially — a backgrounded tab is frozen:
     * JS is suspended and the WebSocket often dies silently. On resume the
     * mqtt.js client can still report `connected === true` (a "zombie"
     * socket), so NO 'close'/'reconnect' event fires and the reconnect-driven
     * reconcile in handleConnectionEstablished never runs. The conversation
     * then shows stale state (missed edits/deletes, sometimes missed messages)
     * until a manual refresh.
     *
     * So we reconcile on foreground INDEPENDENTLY of socket state: if we were
     * hidden long enough to distrust the stream, bump the resync nonce (mounted
     * conversations window-reconcile against the server) and revalidate the
     * chat list. This converges the open conversation on the user's very next
     * glance, with no refresh and no empty flash.
     */
    const handleForeground = useCallback(() => {
        const gap = Date.now() - lastHealthyTimestampRef.current
        if (gap < STALE_THRESHOLD_MS) return

        dispatch(triggerMessageResync())
        mutate(
            (key: string) =>
                typeof key === "string" &&
                (key.startsWith(GetEndpointUrl.GetUserLatestChatList) ||
                    key.startsWith(GetEndpointUrl.GetArchiveJobs) ||
                    key.startsWith(GetEndpointUrl.GetArchiveStats)),
            undefined,
            { revalidate: true }
        )
        // Treat the foreground reconcile as a fresh healthy baseline so we
        // don't immediately re-fire on a subsequent MQTT reconnect event.
        lastHealthyTimestampRef.current = Date.now()
    }, [dispatch])

    return {
        markHealthy,
        handleConnectionEstablished,
        handleDisconnected,
        handleForeground,
    }
}
