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

/**
 * STREAM_BACKED_KEY_PREFIXES — the SWR caches whose freshness depends on the
 * realtime stream, and which therefore need exactly one revalidate after a gap
 * the stream can't vouch for.
 *
 * This list is the alternative to polling. Each of these is kept current by an
 * MQTT message in normal operation (a channel update, a table row, a doc comment,
 * an archive job transition, a chat-list preview), so a timer would be pure waste
 * — but a MISSED message leaves the UI quietly wrong until the user acts. Naming
 * them in one place means adding a streamed feature is a one-line entry here
 * instead of another private interval somewhere in the tree.
 *
 * Deliberately prefixes, not exact keys: these endpoints are all
 * `<prefix>/<id>`, and a gap invalidates every id, not just the one on screen.
 */
export const STREAM_BACKED_KEY_PREFIXES: readonly string[] = [
    // Conversations: previews + unread counts (bodies are reconciled by the
    // resync nonce, which preserves local/optimistic state).
    GetEndpointUrl.GetUserLatestChatList,
    // Channel metadata: post policy, archive state, name, privacy, membership.
    // Missing a Channel_Update leaves a composer enabled on an archived channel.
    GetEndpointUrl.ChannelBasicInfo,
    GetEndpointUrl.GetUserActiveChannelList,
    GetEndpointUrl.GetUserArchiveChannelList,
    GetEndpointUrl.GetAllActiveChannelList,
    // Tables: rows arrive as MESSAGE_TABLE_ROW on the table's own topic, so a
    // missed message shows a stale grid to someone who thinks it's live.
    GetEndpointUrl.GetTable,
    // Docs: comment threads arrive on the doc topic.
    GetEndpointUrl.GetDocInfo,
    // Admin archive panel: published over MQTT, so a long gap can hide a
    // "completed" transition behind a permanent "running".
    GetEndpointUrl.GetArchiveJobs,
    GetEndpointUrl.GetArchiveStats,
]

/**
 * revalidateStreamBackedKeys asks SWR to refetch every stream-backed cache once.
 * Pure fan-out over the list above — no component needs to know it exists.
 */
export function revalidateStreamBackedKeys(): void {
    void mutate(
        (key: unknown) =>
            typeof key === "string" && STREAM_BACKED_KEY_PREFIXES.some((prefix) => key.includes(prefix)),
        undefined,
        { revalidate: true },
    )
}

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
            //    the latest window, no wipe, no empty flash). Non-conversation
            //    surfaces observe the same nonce via useStreamGapResync.
            dispatch(triggerMessageResync())

            // 2. Revalidate every cache the stream keeps fresh (lists, channel
            //    metadata, tables, docs, admin jobs). Background revalidate, so
            //    no flash risk — and one declared list instead of a timer per
            //    feature.
            revalidateStreamBackedKeys()
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
        revalidateStreamBackedKeys()
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
