// Stub: useResilientPolling — not available in this build.
// Falls back to a simple setInterval-based polling using any poll function found in opts.
import { useEffect, useRef } from "react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useResilientPolling(opts: Record<string, any>) {
    const pollFn = opts.fn ?? opts.onPoll ?? null
    const interval = typeof opts.intervalMs === "number" ? opts.intervalMs
        : typeof opts.interval === "number" ? opts.interval
        : 30_000
    const enabled = opts.enabled !== false

    const fnRef = useRef(pollFn)
    fnRef.current = pollFn

    useEffect(() => {
        if (!enabled || !fnRef.current) return
        const id = setInterval(() => fnRef.current?.(), interval)
        return () => clearInterval(id)
    }, [interval, enabled])
}

