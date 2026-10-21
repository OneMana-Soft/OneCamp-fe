"use client"

import type { ReactNode } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SplitArrange, SplitPane } from "@/components/split/lazy"
import { Seam } from "@/components/split/Seam"
import { callConversationOf } from "@/lib/callConversation"
import { MAIN, MAIN_KEY, paneKey } from "@/lib/split"
import { viewRow } from "@/lib/splitLayout"
import { selectSplit } from "@/hooks/useSplitView"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A call's own page (/app/meet/…): the call, and beside it the call's
 * conversation once the dock's Chat opens it (components/livekit/callChat.ts
 * puts it in split view, as it does beside any page).
 *
 * The page drew the call alone, so on it Chat lit up and opened nothing
 * (18 Oct 2026). It draws only that conversation: what was opened beside
 * other pages stays where it was, and a meeting or an instant call, which
 * belong to no conversation, stay alone. The call's panel is always the first
 * child of the same group, so the conversation coming and going, or moving to
 * the call's other side (CSS order), never remounts the call, which would
 * hang it up. Focusing the conversation alone hides the call, still running.
 * `enabled` is split view's own switch.
 */
export function MeetingSplit({ pathname, enabled, children }: { pathname: string; enabled: boolean; children: ReactNode }) {
  const panes = useSelector((s: RootState) => selectSplit(s).panes)
  const order = useSelector((s: RootState) => selectSplit(s).order)
  const active = useSelector((s: RootState) => selectSplit(s).active)
  const focused = useSelector((s: RootState) => selectSplit(s).focused)
  const conversation = enabled ? callConversationOf(pathname) : null
  const index = conversation ? panes.findIndex((p) => p.kind === conversation.kind && p.id === conversation.id) : -1
  const pane = index >= 0 ? panes[index] : null
  const row = viewRow(panes, order)
  const left = !!pane && row.indexOf(index) < row.indexOf(MAIN)
  return (
    <>
    <ResizablePanelGroup id="meet-panels" direction="horizontal" data-split-row="" className="app-frame h-dvh w-full">
      <ResizablePanel
        id="meet-call"
        order={left ? 3 : 1}
        style={{ order: left ? 3 : 1 }}
        minSize={40}
        data-meeting-call=""
        data-split-view="-1"
        data-split-sheet={MAIN_KEY}
        data-flip-id={MAIN_KEY}
        tabIndex={-1}
        className={cn("relative h-full min-w-0 outline-none", pane && focused === index && "hidden")}
      >
        {children}
      </ResizablePanel>
      {pane && (
        <>
          <Seam order={2} label="Resize the call and its conversation" hidden={focused !== null} />
          <ResizablePanel
            id={`meet-${pane.kind}-${pane.id}`}
            order={left ? 1 : 3}
            style={{ order: left ? 1 : 3 }}
            defaultSize={32}
            minSize={28}
            data-flip-id={paneKey(pane)}
            className={cn("h-full min-w-0 py-2", left ? "pl-2" : "pr-2")}
          >
            <SplitPane pane={pane} index={index} at={left ? 0 : 1} count={2} active={active === index} focused={focused === index} shown />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
    {pane && focused === null && <SplitArrange shown={left ? `${paneKey(pane)},${MAIN_KEY}` : `${MAIN_KEY},${paneKey(pane)}`} />}
    </>
  )
}
