"use client"

/**
 * useStreamGapResync — "the realtime stream was untrustworthy for a while; go
 * check the server once".
 *
 * OneCamp's freshness model has three layers, and this is the middle one:
 *
 *   1. PUSH. MQTT with QoS 1 and a persistent session (clean:false, one-hour
 *      expiry, a stable per-tab client id) — a brief drop loses nothing, because
 *      the broker queues what the client missed.
 *   2. RECONCILE ON GAP (this hook). When the session was gone long enough to
 *      distrust — a reconnect after a >30s gap, or a backgrounded PWA coming
 *      forward, which on iOS is where sockets die without firing 'close' — ask
 *      the server ONCE. One request per gap, not one per interval.
 *   3. FALLBACK POLL. Only while MQTT is actually unhealthy, and only for
 *      surfaces where a missed terminal event would leave the UI lying (see
 *      useResilientPolling).
 *
 * The gap signal is already computed centrally by useMessageSyncManager (it owns
 * the health watermark and the foreground/reconnect detection) and published as a
 * nonce. This hook is the read side, so any surface can join that one signal
 * instead of growing its own timer — which is how a product ends up with a dozen
 * uncoordinated intervals.
 */

import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

/**
 * Calls onResync once per gap signal. Skips the initial render (there is nothing
 * to reconcile against on first mount — the caller has just fetched).
 */
export function useStreamGapResync(onResync: () => void, enabled = true): void {
    const nonce = useSelector((s: RootState) => s.messageResync.nonce)
    const onResyncRef = useRef(onResync)
    onResyncRef.current = onResync
    const lastHandledRef = useRef(0)

    useEffect(() => {
        if (!enabled || nonce === 0 || nonce === lastHandledRef.current) return
        lastHandledRef.current = nonce
        onResyncRef.current()
    }, [nonce, enabled])
}

export default useStreamGapResync
