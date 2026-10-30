"use client"

import useSWR from "swr"
import { fetchCommandCatalog } from "@/services/commandService"

/** A conversation's command catalog, cached by SWR per channel (the backend caches it per user too). */
export function useCommandCatalog(channelId?: string) {
    return useSWR(
        ["command-catalog", channelId || "global"],
        () => fetchCommandCatalog(channelId),
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    ).data
}

/**
 * Reads the catalog and draws nothing. LazyCommandSurface loads it beside the
 * command runner, whose code is bigger, so the runner finds the catalog there
 * or on its way.
 */
export function CatalogReader({ channelId }: { channelId?: string }) {
    useCommandCatalog(channelId)
    return null
}
