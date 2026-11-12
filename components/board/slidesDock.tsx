"use client"

import * as React from "react"
import { useMedia } from "@/context/MediaQueryContext"
import { BAR_SURFACE } from "@/components/board/facilitationDock"
import { PHONE_DOCK } from "@/components/board/phoneDock"
import { PartRetry } from "@/components/ui/part-retry"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where a board's slides sit over it (components/board/boardSlides, miro-28), and their place when their code can't
 * come (boardFacilitation): above the facilitation bar, centred with it on a computer; on a phone one bar above it,
 * and one more while something is selected (`lifted`), where the selection's bar goes. Marked as a bar at the board's
 * foot: a slide is fitted clear of it (presentFrame's BOARD_BARS), and the app's toasts sit above it (phone.css C9).
 */
export function SlidesDock({ lifted = false, children }: { lifted?: boolean; children: React.ReactNode }) {
  const { isMobile } = useMedia()
  return (
    <div
      data-board-slides=""
      data-board-chrome=""
      data-phone-foot=""
      className={cn(
        "pointer-events-none absolute z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center",
        isMobile
          ? cn(lifted ? PHONE_DOCK.slidesOverSelection : PHONE_DOCK.slides, "left-1/2")
          : "bottom-[128px] left-[calc(50%+var(--board-facilitation-x,0px))] -translate-y-[var(--board-facilitation-lift,0px)]",
      )}
    >
      {children}
    </div>
  )
}

/**
 * The slides' place when their code can't come (their chunk, or a follower's presentFrame through
 * usePresenterFollow): said there, with Try again, the size of the bar it stands in for. Presenting and following
 * go on. One copy for a member's board (boardFacilitation) and a share link's guest (GuestBoardViewer).
 */
export function SlidesFailed({ retry }: { retry: () => void }) {
  return (
    <SlidesDock>
      <div className={BAR_SURFACE}>
        <PartRetry what="the slides" retry={retry} className="rounded-[18px]" />
      </div>
    </SlidesDock>
  )
}
