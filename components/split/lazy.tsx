"use client"

import dynamic from "next/dynamic"

// Split view's pieces, the drag code among them, load with the first pane.

const Sheet = () => <div className="app-sheet h-full w-full animate-pulse" />
export const SplitPane = dynamic(() => import("./SplitPane").then((m) => m.SplitPane), { loading: Sheet })
export const FocusPill = dynamic(() => import("./FocusPill").then((m) => m.FocusPill))
export const TuckedViews = dynamic(() => import("./TuckedViews").then((m) => m.TuckedViews))
export const SplitArrange = dynamic(() => import("./SplitArrange").then((m) => m.SplitArrange), { ssr: false })
// A call's own page (the shell's meeting branch): the frame until it's in.
export const MeetingSplit = dynamic(() => import("./MeetingSplit").then((m) => m.MeetingSplit), { loading: () => <div className="app-frame h-dvh w-full" /> })
