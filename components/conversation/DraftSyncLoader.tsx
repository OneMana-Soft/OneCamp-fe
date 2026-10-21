"use client"

import { useEffect } from "react"
import { useStore } from "react-redux"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import type { RootState } from "@/store/store"
import type { UnknownAction } from "@reduxjs/toolkit"

/**
 * Keeps every composer's draft beyond the tab, for the member signed in (the
 * Draft Store, lib/conversation/draftSync). Its code loads after the page, in
 * a chunk of its own: no route's first load carries it.
 */
export function DraftSyncLoader() {
    const store = useStore<RootState, UnknownAction>()
    const viewer = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    useEffect(() => {
        if (!viewer) return
        let stop: (() => void) | undefined
        let left = false
        void import("@/lib/conversation/draftSync")
            .then((m) => {
                if (!left) stop = m.startDraftSync({ store, viewer })
            })
            .catch(() => {
                // The chunk didn't load (a deploy mid-session): drafts stay in the tab, as before.
            })
        return () => {
            left = true
            stop?.()
        }
    }, [store, viewer])
    return null
}
