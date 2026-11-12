"use client"

import { Suspense } from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const Body = lazyPiece(() => import("./AppNotFound").then((m) => ({ default: m.AppNotFound })))

/** The signed-in 404, fetched only when drawn, as the global one is (components/guest/notFoundView.tsx). */
export function AppNotFoundView() {
    return (
        <Suspense fallback={null}>
            <Body />
        </Suspense>
    )
}
