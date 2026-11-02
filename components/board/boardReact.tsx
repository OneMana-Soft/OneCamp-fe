"use client"

/**
 * The board's React button (miro-24), for everyone on it, viewers too: the six reactions a call has (lib/reactions/set)
 * and a hand, in a popover on a computer and a sheet on a phone (components/ui/popover: a phone's overlays are
 * drawers). A reaction rises from this person's face on the other screens and from this button on theirs; a raised
 * hand joins the queue below the hand's button, and Here now's (presence/HandQueue), where editors lower it. What
 * they do is Here now's control (components/board/boardHereNow, through components/board/boardSignals), so the button
 * waits, disabled, until the board's tools have come. Its own chunk: the page draws it after its first load, and its
 * tray is a chunk of its own again (components/board/boardReactTray), drawn on the first press.
 */

import * as React from "react"
import { SmilePlus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ClusterButton } from "@/components/board/boardChrome"
import { usePresenceControl } from "@/components/docEditor/presence/control"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The tray comes as the pointer or the focus reaches the button (components/board/boardReactTray), so it opens at once.
const BoardReactTray = lazyPiece(() => import("@/components/board/boardReactTray"))

export default function BoardReact({ hereKey }: { hereKey: string }) {
  const control = usePresenceControl(hereKey)
  const [open, setOpen] = React.useState(false)
  const up = control?.hand?.up ?? false
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ClusterButton label={up ? "React, or lower your hand" : "React or raise your hand"} data-board-react="" disabled={!control?.react} onPointerEnter={BoardReactTray.warm} onFocus={BoardReactTray.warm} className="relative disabled:opacity-60">
          <SmilePlus />
          {up && (
            <span aria-hidden="true" data-board-hand-up="" className="absolute -right-0.5 -top-0.5 text-3xs leading-none">
              ✋
            </span>
          )}
        </ClusterButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="React" className="content-float w-auto min-w-64 rounded-xl p-1.5 shadow-e3" data-board-react-tray="">
        <React.Suspense fallback={<div aria-hidden="true" className="h-28" />}>
          <BoardReactTray hereKey={hereKey} onDone={() => setOpen(false)} />
        </React.Suspense>
      </PopoverContent>
    </Popover>
  )
}
