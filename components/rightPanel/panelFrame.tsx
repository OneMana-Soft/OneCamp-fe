"use client"

import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { X } from "@/lib/icons"
import type { PanelFrameProps } from "@/lib/lazy/lazyPanel"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"

/** The right panel's Close (Esc): in RightPanelHeader, and over a panel that isn't in yet. */
export function PanelClose() {
    const dispatch = useDispatch()
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={() => dispatch(closeRightPanel())} className="h-7 w-7 shrink-0 text-ink-3 hover:text-ink" aria-label="Close panel">
                    <X className="h-4 w-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Close panel<span className="shell-tip-kbd">Esc</span></TooltipContent>
        </Tooltip>
    )
}

/** lazyPanel's frame in the right panel (V-180): the header, Close live over the shape, the slow line and a failure. */
export function RightPanelFrame({ busy, children }: PanelFrameProps) {
    return (
        <div className="flex h-full min-h-0 flex-col bg-background" aria-busy={busy} data-panel-frame="">
            <header data-sheet-header="" className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-line pl-5 pr-3">
                <div className="flex items-center gap-2">
                    {busy && <Skeleton className="size-4 rounded-[5px]" />}
                    {busy && <Skeleton className="h-3.5 w-14" />}
                </div>
                <PanelClose />
            </header>
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    )
}
