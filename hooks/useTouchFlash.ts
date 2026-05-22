"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * useTouchFlash — production-grade press-flash for touch devices.
 *
 * Notion / Linear / Things-style "tap registered" feedback:
 *  - On touchstart: sets `pressed=true` (CSS picks it up via data attribute).
 *  - On touchend / touchcancel / blur / scroll: holds `pressed` for `holdMs`,
 *    then releases. The hold gives the user lasting feedback on slow nav,
 *    even if the next view takes a beat to mount.
 *
 * Why a hook + CSS instead of `<TouchableDiv>` ripple:
 *  - No `styled-jsx`, no per-instance keyframe injection.
 *  - Works inside virtualized lists (no DOM-level ref forwarding required).
 *  - Lets the consumer's own Tailwind classes own the transition timing
 *    so the visual matches the rest of the design system.
 *  - Auto-cancels on scroll, which prevents the "row lights up while
 *    swiping past" Material problem.
 *
 * Usage:
 *
 *   const { pressed, bind } = useTouchFlash()
 *   return <div data-pressed={pressed || undefined} {...bind} className="..." />
 *
 * In Tailwind, target the state with:
 *
 *   data-[pressed=true]:bg-accent
 *   transition-colors duration-150
 */

export interface UseTouchFlashOptions {
    /** How long to hold the pressed state after release. Default 150ms. */
    holdMs?: number
    /** Disable the flash entirely (e.g. on desktop). */
    disabled?: boolean
}

export interface UseTouchFlashBindings {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
    onTouchCancel: (e: React.TouchEvent) => void
}

export interface UseTouchFlashResult {
    pressed: boolean
    bind: UseTouchFlashBindings
}

export function useTouchFlash({
    holdMs = 150,
    disabled = false,
}: UseTouchFlashOptions = {}): UseTouchFlashResult {
    const [pressed, setPressed] = useState(false)
    const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const startedAt = useRef<number>(0)

    const clearTimer = useCallback(() => {
        if (releaseTimer.current) {
            clearTimeout(releaseTimer.current)
            releaseTimer.current = null
        }
    }, [])

    const release = useCallback(() => {
        clearTimer()
        // Ensure the flash is visible for at least one paint, even on fast taps.
        const elapsed = Date.now() - startedAt.current
        const remaining = Math.max(holdMs - elapsed, 0)
        if (remaining === 0) {
            setPressed(false)
        } else {
            releaseTimer.current = setTimeout(() => setPressed(false), remaining)
        }
    }, [clearTimer, holdMs])

    const onTouchStart = useCallback(
        (_e: React.TouchEvent) => {
            if (disabled) return
            startedAt.current = Date.now()
            clearTimer()
            setPressed(true)
        },
        [disabled, clearTimer],
    )

    const onTouchEnd = useCallback(
        (_e: React.TouchEvent) => {
            if (disabled) return
            release()
        },
        [disabled, release],
    )

    const onTouchCancel = useCallback(
        (_e: React.TouchEvent) => {
            if (disabled) return
            // Cancel = scroll started or system intercepted; don't flash on release.
            clearTimer()
            setPressed(false)
        },
        [disabled, clearTimer],
    )

    // Cleanup on unmount.
    useEffect(() => clearTimer, [clearTimer])

    return {
        pressed: disabled ? false : pressed,
        bind: { onTouchStart, onTouchEnd, onTouchCancel },
    }
}
