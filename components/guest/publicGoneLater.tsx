"use client"

import dynamic from "next/dynamic"

/**
 * PublicGone as a chunk of its own, for public pages that hold a size budget
 * (the booking pages: app/firstLoad.test.ts). A page that is gone, or failed
 * to load, is the rare case, so its states (the load-failure card and its
 * spot) don't ride with every outsider's first screen. Nothing is drawn for
 * the moment its chunk takes, then the same PublicGone, with the same props.
 */
export const PublicGoneLater = dynamic(() => import("@/components/guest/publicStates").then((m) => m.PublicGone), { ssr: false })
