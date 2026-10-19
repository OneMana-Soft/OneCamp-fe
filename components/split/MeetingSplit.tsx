"use client"

import type { ReactNode } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SplitPane } from "@/components/split/SplitPane"
import { Seam } from "@/components/split/Seam"
import { callConversationOf } from "@/lib/callConversation"
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
 * child of the same group, so the conversation coming and going never
 * remounts the call, which would hang it up. Focusing the conversation alone
 * hides the call, still running, as focus hides the page beside a pane.
 * `enabled` is split view's own switch (off on a tablet).
 */
export function MeetingSplit({ pathname, enabled, children }: { pathname: string; enabled: boolean; children: ReactNode }) {
  const panes = useSelector((s: RootState) => s.split.panes)
  const active = useSelector((s: RootState) => s.split.active)
  const focused = useSelector((s: RootState) => s.split.focused)
  const conversation = enabled ? callConversationOf(pathname) : null
  const index = conversation ? panes.findIndex((p) => p.kind === conversation.kind && p.id === conversation.id) : -1
  const pane = index >= 0 ? panes[index] : null
  return (
    <ResizablePanelGroup id="meet-panels" direction="horizontal" className="app-frame h-dvh w-full">
      <ResizablePanel
        id="meet-call"
        order={1}
        minSize={40}
        data-meeting-call=""
        data-split-view="-1"
        tabIndex={-1}
        className={cn("relative h-full min-w-0 outline-none", pane && focused === index && "hidden")}
      >
        {children}
      </ResizablePanel>
      {pane && (
        <>
          <Seam label="Resize the call and its conversation" hidden={focused !== null} />
          <ResizablePanel id={`meet-${pane.kind}-${pane.id}`} order={2} defaultSize={32} minSize={28} className="h-full min-w-0 py-2 pr-2">
            <SplitPane pane={pane} index={index} active={active === index} focused={focused === index} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
