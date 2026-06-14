"use client"

import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import axiosInstance from "@/lib/axiosInstance"
import type { RootState } from "@/store/store"

interface UseMessageResyncOptions<T> {
    /**
     * When false the hook is inert. Used to skip resync for views that
     * shouldn't reconcile against "latest" — e.g. a permalink/jump-to
     * view (messageId set) where the user is parked on an older message
     * and pulling the newest page would be noise.
     */
    enabled: boolean
    /**
     * The "latest messages" endpoint for this conversation, fully
     * qualified (e.g. `/dm/latestChat/<id>`). Empty string disables.
     */
    latestUrl: string
    /**
     * Pull the array of items out of the API envelope
     * (`res.data.data.chats` / `.posts`).
     */
    extract: (payload: any) => T[] | undefined
    /**
     * Reconcile the freshly-fetched "latest" window into Redux. MUST be a
     * window-reconcile (see merge* reducers): within the window's time-range
     * it applies adds, edits, and deletes, while preserving older history and
     * optimistic local messages, and stays reference-stable when nothing
     * changed (so an idle reconnect with no changes is a no-op).
     */
    onMerge: (items: T[]) => void
}

/**
 * Reconcile a mounted conversation against the server when the MQTT
 * connection recovers from a gap long enough to be untrustworthy
 * (see useMessageSyncManager). This is the non-destructive replacement
 * for the old "wipe Redux + refetch" strategy that made the message
 * pane flash empty — and, when the refetch effect's deps didn't notice
 * the wipe, stay empty.
 *
 * On each resync signal we imperatively GET the latest page and hand it
 * to a window-reconcile. We bypass SWR here on purpose: SWR dedupes and
 * compares results by deep-equality, so a revalidation that returns the
 * same data keeps the same object reference and never re-triggers a
 * dependent effect. An explicit fetch is immune to that and guarantees
 * the merge runs exactly when we want it to.
 */
export const useMessageResync = <T>({
    enabled,
    latestUrl,
    extract,
    onMerge,
}: UseMessageResyncOptions<T>) => {
    const nonce = useSelector((state: RootState) => state.messageResync.nonce)

    // Guard against overlapping fetches if resyncs land back-to-back.
    const inFlightRef = useRef(false)
    // Skip the initial render (nonce starts at 0); only react to real
    // reconnect signals.
    const lastHandledRef = useRef(0)

    // Keep the latest callbacks/inputs in refs so the effect can depend
    // solely on `nonce` and never re-run (or re-fetch) just because a
    // parent re-rendered with new closure identities.
    const latestUrlRef = useRef(latestUrl)
    const enabledRef = useRef(enabled)
    const extractRef = useRef(extract)
    const onMergeRef = useRef(onMerge)
    useEffect(() => {
        latestUrlRef.current = latestUrl
        enabledRef.current = enabled
        extractRef.current = extract
        onMergeRef.current = onMerge
    })

    useEffect(() => {
        if (nonce === 0) return
        if (nonce === lastHandledRef.current) return
        lastHandledRef.current = nonce

        if (!enabledRef.current) return
        const url = latestUrlRef.current
        if (!url) return
        if (inFlightRef.current) return

        inFlightRef.current = true
        let cancelled = false

        axiosInstance
            // `silent` keeps the global loading bar quiet for this
            // background reconciliation.
            // @ts-expect-error — `silent` is a custom flag honoured by the axios interceptors, not part of AxiosRequestConfig
            .get(url, { silent: true })
            .then((res) => {
                if (cancelled) return
                const items = extractRef.current(res.data)
                if (items && items.length > 0) {
                    onMergeRef.current(items)
                }
            })
            .catch(() => {
                // Best-effort. A failed reconciliation is recoverable:
                // the next inbound MQTT message, scroll, or focus refetch
                // will converge the view. We deliberately don't surface a
                // toast for a background sync.
            })
            .finally(() => {
                inFlightRef.current = false
            })

        return () => {
            cancelled = true
        }
    }, [nonce])
}
