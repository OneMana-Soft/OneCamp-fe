"use client"

import { Suspense } from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const Body = lazyPiece(() => import("./notFoundBody"))

/**
 * The global 404's body, fetched only when a 404 is drawn (its response still
 * renders it on the server). Every page's HTML lists a not-found's chunks, so
 * whatever one imports rides on every first load, and Turbopack merges what it
 * shares with a layout or page into other chunks, downloaded twice (FLUIDITY-12,
 * 5 Nov 2026). lazyPiece, not next/dynamic, whose own modules would do that;
 * a chunk that can't load draws nothing, as the fallback does, and isn't thrown.
 */
export function NotFoundView() {
    return (
        <Suspense fallback={null}>
            <Body />
        </Suspense>
    )
}
