"use client"

import { useSyncExternalStore } from "react"
import { PHONE_QUERY } from "@/context/MediaQueryContext"

const query = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : null)

function subscribe(changed: () => void) {
    const q = query()
    q?.addEventListener?.("change", changed)
    return () => q?.removeEventListener?.("change", changed)
}

/**
 * Whether the screen is a phone's width (PHONE_QUERY, as isMobile reads it),
 * for a component that may render outside the app's MediaQueryProvider, where
 * useMedia throws: a board in a test, the toaster, the command palette. Right
 * from the first render on the client; false on the server and wherever
 * matchMedia is missing.
 */
export function usePhone(): boolean {
    return useSyncExternalStore(subscribe, () => Boolean(query()?.matches), () => false)
}
