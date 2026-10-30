"use client"

import dynamic from "next/dynamic"
import { lazyPart } from "@/lib/lazy/lazyPart"

// Split view's pieces, the drag code among them, load with the first pane.
// The pills are lazy parts: they show once their code is in, and the page
// around them never waits for it.

const Sheet = () => <div className="app-sheet h-full w-full animate-pulse" />
export const SplitPane = dynamic(() => import("./SplitPane").then((m) => m.SplitPane), { loading: Sheet })
export const FocusPill = lazyPart(() => import("./FocusPill").then((m) => m.FocusPill)).Part
export const TuckedViews = lazyPart(() => import("./TuckedViews").then((m) => m.TuckedViews)).Part
export const SplitArrange = dynamic(() => import("./SplitArrange").then((m) => m.SplitArrange), { ssr: false })
// A call's own page (the shell's meeting branch): the frame until it's in.
export const MeetingSplit = dynamic(() => import("./MeetingSplit").then((m) => m.MeetingSplit), { loading: () => <div className="app-frame h-dvh w-full" /> })
