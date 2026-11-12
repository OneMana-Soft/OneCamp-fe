"use client"

import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { PanelFrame } from "@/lib/lazy/lazyPanel"
import { cn } from "@/lib/utils/helpers/cn"
import { InFrame, SideShell, type Said, type SideWords } from "@/components/board/boardSidePanel"

/**
 * The frame of a side panel whose code is a chunk of its own (V-195), drawn at once from the panel's words with its
 * close live: a tap that waits on the panel's code raises the sheet (or the panel) and says what it is. What it holds
 * while that code comes is lazyPanel's, drawn alone in it: the panel's shape, at 10 s the slow line with Try again, or
 * a failure. The panel, once in, fills this same frame (BoardSidePanel in it): its body in place, its footer in the
 * frame's foot, its count beside the name, and the sheet's height when it asks for one (Frames' sizes: medium, to fit
 * them all). The frame never goes away on the way, so a phone's sheet rises once.
 */
export function BoardSideFrame({ onClose, children, ...words }: SideWords & { onClose: () => void; children: React.ReactNode }) {
  const [said, setSaid] = React.useState<Said>({ footer: false })
  const [foot, setFoot] = React.useState<HTMLElement | null>(null)
  const say = React.useCallback(
    (next: Said) => setSaid((now) => (now.footer === next.footer && now.count === next.count && now.detent === next.detent ? now : next)),
    [],
  )
  const host = React.useMemo(() => ({ foot, say }), [foot, say])
  return (
    <SideShell {...words} detent={said.detent ?? words.detent} count={said.count} onClose={onClose} foot={said.footer ? <div ref={setFoot} className="contents" /> : undefined}>
      <PanelFrame.Provider value={null}>
        <InFrame.Provider value={host}>{children}</InFrame.Provider>
      </PanelFrame.Provider>
    </SideShell>
  )
}

/** A side panel's shape while its code comes, in its frame: a field and three rows, where the panel will draw them. */
export function SidePanelShape() {
  return (
    <div role="status" aria-label="Loading" data-board-panel-shape="" className="grid gap-3 px-1 pt-1">
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="grid gap-2.5" aria-hidden="true">
        {["w-5/6", "w-2/3", "w-3/4"].map((w) => (
          <Skeleton key={w} className={cn("h-4", w)} />
        ))}
      </div>
    </div>
  )
}
