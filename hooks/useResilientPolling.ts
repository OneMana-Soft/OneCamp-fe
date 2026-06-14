"use client"

/**
 * useResilientPolling — single source of truth for "poll the backend
 * as a fallback for missed real-time updates".
 *
 * Design goals:
 *
 *   1. Polling is FALLBACK only. When MQTT is connected we don't poll —
 *      the real-time channel handles freshness and the BE doesn't need
 *      a periodic kick from every browser tab.
 *
 *   2. Polling pauses when the tab is hidden. A user with a forgotten
 *      admin tab open in another window must not keep our API warm.
 *      visibilitychange + focus events drive the gate.
 *
 *   3. Polling has a wall-clock cap so a long-running job (an Slack
 *      import that takes hours) doesn't poll forever — after the cap
 *      the user is expected to refresh manually.
 *
 *   4. Polling backs off exponentially on errors so a flaky BE during
 *      a deploy does not get DDOSed by every connected client.
 *
 *   5. One canonical implementation. Every admin card / live-progress
 *      panel uses this hook with the same shape of options, so an
 *      operator does not need to remember which screen has stale data.
 *
 * Usage:
 *
 *   const { triggerPoll } = useResilientPolling({
 *     enabled: runningJobs.length > 0,
 *     mqttHealthy: isMqttHealthy,
 *     interval: 6_000,
 *     capMs: 10 * 60 * 1000,
 *     onPoll: () => mutate(),
 *   })
 *
 * The returned `triggerPoll` lets callers force an immediate revalidate
 * (e.g., after a manual user action) without waiting for the next tick.
 */

import { useCallback, useEffect, useRef } from "react"

export interface PollingOptions {
    /**
     * Master gate. When false, no polling occurs and any in-flight
     * timer is cleared. Use this to express "is there anything that
     * could change?" — e.g., `runningJobs.length > 0`.
     */
    enabled: boolean

    /**
     * When true, the hook skips scheduling the next tick. MQTT will
     * keep the data fresh; falling back to polling would waste BE
     * cycles. When MQTT goes down, set this to false and polling
     * resumes immediately.
     */
    mqttHealthy: boolean

    /**
     * Base interval between polls in ms. The actual interval is
     * extended on consecutive errors via exponential backoff.
     */
    interval: number

    /**
     * Wall-clock cap. Polling stops after this many ms regardless of
     * tick count. Set to 0 for unbounded (rare; only for genuinely
     * always-running endpoints like /health).
     */
    capMs?: number

    /**
     * Maximum exponential-backoff factor on errors. The next interval
     * is `interval * min(2^errorCount, maxBackoff)`. Default 8 (so
     * a flaky BE caps at ~8x the base interval).
     */
    maxBackoff?: number

    /**
     * Called on every successful tick. Should return a Promise so the
     * hook can detect failures and apply backoff. SWR's mutate is the
     * intended consumer.
     */
    onPoll: () => unknown | Promise<unknown>
}

interface PollingHandle {
    /**
     * Force an immediate poll. Resets the backoff counter. Useful after
     * a user-initiated action (e.g. clicking "Run import") where we
     * don't want to wait for the next interval to see status flip.
     */
    triggerPoll: () => void
}

const DEFAULT_INTERVAL_MS = 6_000
const DEFAULT_CAP_MS = 10 * 60 * 1000 // 10 minutes
const DEFAULT_MAX_BACKOFF = 8

export function useResilientPolling(opts: PollingOptions): PollingHandle {
    const {
        enabled,
        mqttHealthy,
        interval = DEFAULT_INTERVAL_MS,
        capMs = DEFAULT_CAP_MS,
        maxBackoff = DEFAULT_MAX_BACKOFF,
        onPoll,
    } = opts

    // Refs hold the latest values so the effect doesn't tear down /
    // rebuild every render the parent component issues. setInterval
    // cleanup churn was the source of subtle "missed first tick" bugs
    // in the old per-card implementations.
    const onPollRef = useRef(onPoll)
    onPollRef.current = onPoll

    const errorCountRef = useRef(0)
    const startedAtRef = useRef<number | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const inFlightRef = useRef(false)

    const clearTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    const tick = useCallback(async () => {
        // Bail if the gate flipped off between scheduling and firing.
        if (!enabled || mqttHealthy) {
            clearTimer()
            return
        }
        // Skip when tab hidden. We don't even fire onPoll — the user
        // can't see it, so there's no UX cost to deferring until they
        // come back.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            schedule(interval) // re-schedule to retry once visible
            return
        }
        // Cap check.
        if (capMs > 0 && startedAtRef.current && Date.now() - startedAtRef.current > capMs) {
            clearTimer()
            return
        }

        if (inFlightRef.current) {
            // Previous poll still running (e.g., slow network). Skip
            // this tick — overlapping polls produce a thundering herd
            // and break SWR's deduplication.
            schedule(interval)
            return
        }
        inFlightRef.current = true
        try {
            await onPollRef.current()
            errorCountRef.current = 0
            schedule(interval)
        } catch {
            errorCountRef.current = Math.min(errorCountRef.current + 1, 30)
            const factor = Math.min(2 ** errorCountRef.current, maxBackoff)
            schedule(interval * factor)
        } finally {
            inFlightRef.current = false
        }
        // schedule is stable through useCallback below; ESLint can't
        // see through the ref-based bookkeeping.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, mqttHealthy, interval, capMs, maxBackoff, clearTimer])

    const schedule = useCallback((delayMs: number) => {
        clearTimer()
        if (!enabled || mqttHealthy) return
        timeoutRef.current = setTimeout(() => {
            void tick()
        }, delayMs)
    }, [enabled, mqttHealthy, clearTimer, tick])

    // Lifecycle: when enabled flips on, kick off a poll session. When
    // it flips off, tear down. visibilitychange / focus re-arm so a
    // returning user sees fresh data within one tick instead of waiting
    // out a stale schedule.
    useEffect(() => {
        if (!enabled) {
            startedAtRef.current = null
            errorCountRef.current = 0
            clearTimer()
            return
        }
        if (mqttHealthy) {
            // MQTT is healthy: don't schedule, but if it goes down later
            // the next render of this effect (mqttHealthy=false) re-arms.
            clearTimer()
            return
        }
        if (startedAtRef.current === null) {
            startedAtRef.current = Date.now()
            errorCountRef.current = 0
        }
        // First poll fires quickly so the user sees fresh data.
        schedule(0)

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                // User returned: poll immediately to catch up.
                schedule(0)
            }
        }
        document.addEventListener("visibilitychange", handleVisibility)
        window.addEventListener("focus", handleVisibility)
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility)
            window.removeEventListener("focus", handleVisibility)
            clearTimer()
        }
    }, [enabled, mqttHealthy, schedule, clearTimer])

    const triggerPoll = useCallback(() => {
        errorCountRef.current = 0
        schedule(0)
    }, [schedule])

    return { triggerPoll }
}
