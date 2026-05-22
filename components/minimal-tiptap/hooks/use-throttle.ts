"use client"

import { useRef, useCallback } from 'react'

export interface ThrottledFn<T extends (...args: any[]) => void> {
    (...args: Parameters<T>): void
    /**
     * Synchronously invoke the most recently scheduled trailing-edge call,
     * if any, with the latest args. Used to guarantee the parent has the
     * freshest editor content right before a submit. No-op if nothing is
     * pending.
     */
    flush: () => void
    /** Drop any pending trailing-edge call without invoking it. */
    cancel: () => void
}

export function useThrottle<T extends (...args: any[]) => void>(
    callback: T,
    delay: number
): ThrottledFn<T> {
    const lastRan = useRef(Date.now())
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    const pendingArgsRef = useRef<Parameters<T> | null>(null)
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    const throttled = useCallback(
        (...args: Parameters<T>) => {
            pendingArgsRef.current = args
            if (Date.now() - lastRan.current >= delay) {
                callbackRef.current(...args)
                lastRan.current = Date.now()
                pendingArgsRef.current = null
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current)
                    timeoutRef.current = null
                }
            } else {
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current)
                }
                timeoutRef.current = setTimeout(
                    () => {
                        const pending = pendingArgsRef.current
                        if (pending) {
                            callbackRef.current(...pending)
                        }
                        lastRan.current = Date.now()
                        timeoutRef.current = null
                        pendingArgsRef.current = null
                    },
                    delay - (Date.now() - lastRan.current)
                )
            }
        },
        [delay]
    ) as ThrottledFn<T>

    throttled.flush = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
        const pending = pendingArgsRef.current
        if (pending) {
            callbackRef.current(...pending)
            lastRan.current = Date.now()
            pendingArgsRef.current = null
        }
    }, [])

    throttled.cancel = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
        pendingArgsRef.current = null
    }, [])

    return throttled
}
