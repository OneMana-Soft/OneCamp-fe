"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useMedia } from "@/context/MediaQueryContext"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { Anchor } from "@/lib/anchors/types"
import { revealThread, setUi } from "./commentsUi"

// Beside commentsUi rather than in it: the comments page's layout reads that
// for revealThread alone, and needn't bring the router and the panel with it.

/**
 * Opens a doc's comments where the screen keeps them: the panel beside the
 * doc, or on a phone the comments page; at a thread when one is named, or
 * with a new thread to write when an anchor is.
 */
export function useOpenComments(docId: string) {
    const dispatch = useDispatch()
    const router = useAppRouter()
    const { isMobile } = useMedia()
    return useCallback(
        (to?: { thread?: string; start?: Anchor }) => {
            if (to?.start) setUi(docId, { pending: to.start, active: null })
            if (isMobile) {
                const path = to?.start ? "/new" : to?.thread ? `/${encodeURIComponent(to.thread)}` : ""
                router.push(`/app/doc/${docId}/comment${path}`)
                return
            }
            if (to?.thread) revealThread(docId, { thread: to.thread })
            dispatch(openRightPanel({ docUUID: docId }))
        },
        [docId, dispatch, router, isMobile],
    )
}
