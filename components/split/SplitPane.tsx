"use client"

import dynamic from "next/dynamic"
import { memo, useCallback, useLayoutEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeft, ArrowLeftRight, ArrowRight, Columns3, Link2, Maximize2, Minimize2, MoreHorizontal, X } from "@/lib/icons"
import { useSplitActions } from "@/hooks/useSplitView"
import { InSplitPaneContext } from "@/hooks/useLinkTarget"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { hrefOfPane, paneKey, type Pane } from "@/lib/split"
import { canSwapBeside } from "@/lib/callConversation"
import { PanelErrorBoundary } from "@/components/error/PanelErrorBoundary"
import { FocusPill } from "@/components/split/FocusPill"
import { TuckedViews } from "@/components/split/TuckedViews"
import { KIND, useViewLook } from "@/components/split/paneLook"
import { ConversationView, useDmConversation } from "@/components/conversation/ConversationView"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// Each view loads only when it is first split, so the split costs nothing until used.
const Loading = () => <div className="h-full w-full animate-pulse bg-press" />
const ChannelView = dynamic(() => import("@/components/views/ChannelView").then((m) => m.ChannelView), { loading: Loading })
const ChatView = dynamic(() => import("@/components/views/ChatView").then((m) => m.ChatView), { loading: Loading })
const GroupChatView = dynamic(() => import("@/components/views/GroupChatView").then((m) => m.GroupChatView), { loading: Loading })
const DocView = dynamic(() => import("@/components/views/DocView").then((m) => m.DocView), { loading: Loading })
const ProjectView = dynamic(() => import("@/components/views/ProjectView").then((m) => m.ProjectView), { loading: Loading })
const TaskInfoPanel = dynamic(() => import("@/components/rightPanel/taskInfoPanel"), { loading: Loading })
// The call (LiveKit) is the heaviest view; it loads only when a call is opened beside.
const CallView = dynamic(() => import("@/components/livekit/CallView").then((m) => m.CallView), { loading: Loading })

/**
 * The view itself. Memoised on the pane, so the bar's states (the keys
 * arriving, focus, a move) never draw a chat, a doc or a board again.
 */
const PaneBody = memo(function PaneBody({ pane, onClose }: { pane: Pane; onClose: () => void }) {
  switch (pane.kind) {
    case "call-channel":
      return <CallView kind="channel" id={pane.id} onLeave={onClose} embedded />
    case "call-chat":
      return <CallView kind="chat" id={pane.id} onLeave={onClose} embedded />
    case "call-group":
      return <CallView kind="group" id={pane.id} onLeave={onClose} embedded />
    // A conversation beside the page sits in its host, as the page's does (chat A1).
    case "channel":
      return <ConversationView conversation={{ kind: "channel", id: pane.id }}><ChannelView channelId={pane.id} /></ConversationView>
    case "chat":
      return <DmPane other={pane.id} />
    case "group":
      return <ConversationView conversation={{ kind: "group", id: pane.id }}><GroupChatView grpId={pane.id} /></ConversationView>
    case "doc":
      return <DocView docId={pane.id} />
    case "project":
      return <ProjectView projectId={pane.id} />
    case "task":
      return <TaskInfoPanel taskUUID={pane.id} />
  }
})

/** A DM beside the page, in its host once who reads it is known. */
function DmPane({ other }: { other: string }) {
  return <ConversationView conversation={useDmConversation(other)}><ChatView chatId={other} /></ConversationView>
}

const barButton =
  "relative grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors duration-[140ms] hover:bg-hover hover:text-ink hover:duration-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"

type Props = {
  pane: Pane
  /** Its index among the panes (data-split-view). */
  index: number
  /** Where it sits among all the views, left to right, and how many there are. */
  at: number
  count: number
  active: boolean
  focused: boolean
  /** On screen, rather than tucked away for want of width (rule T). */
  shown: boolean
  /** The keys of the views tucked away, when this is the rightmost one on screen. */
  tucked?: string
}

/**
 * One pane of the split view (design v3, shell V2): the same channel, chat,
 * doc, project or task page as the main area, on its own sheet beside it with
 * the 8px frame seam between. Its 44px bar names it by its own name, where
 * the app knows it (14/590, ink-2 while another view has the keys), with its
 * number (Ctrl+Alt+n), and is its handle: the arrange layer
 * (SplitArrange) puts a drag surface in the bar's slot, under the buttons.
 * Focus it alone, its menu (move it, make it the main view, even the widths,
 * copy its link), close it. The view the keys act on wears a 1.5px brand top
 * edge. Focused alone, its bar says "One view" with Show all beside it; the
 * rightmost view on screen lists the views tucked away.
 */
export const SplitPane = memo(function SplitPane({ pane, index, at, count, active, focused, shown, tucked }: Props) {
  const run = useSplitActions()
  const { label, icon: Icon } = KIND[pane.kind]
  const what = label.toLowerCase()
  const key = paneKey(pane)
  const title = useViewLook(key, pane).name
  // A view tucked away when the page loaded draws the first time it shows.
  const [seen, setSeen] = useState(shown)
  if (shown && !seen) setSeen(true)
  // Tells the arrange layer its handle's slot is here (this loads after it).
  useLayoutEffect(() => {
    window.dispatchEvent(new Event("split:slots"))
    return () => void window.dispatchEvent(new Event("split:slots"))
  }, [])
  // Beside a call's own page, or a call itself: a swap would move the call (useSplitActions).
  const pathname = usePathname() ?? ""
  const close = useCallback(() => run({ type: "close" }, index), [run, index])
  const copyLink = () => {
    void navigator.clipboard?.writeText(window.location.origin + hrefOfPane(pane)).then(
      () => toast({ title: "Link copied", description: title }),
      () => toast({ title: "Couldn't copy the link", variant: "destructive" }),
    )
  }
  return (
    <section
      aria-label={`${title}, view ${at + 1} of ${count}`}
      data-split-view={index}
      data-split-sheet={key}
      tabIndex={-1}
      className={cn("app-sheet shell-panel-sheet relative flex h-full min-w-0 flex-col overflow-hidden outline-none", active && "shell-sheet-focused")}
    >
      <div className="split-bar relative flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        <span data-split-handle={key} className="absolute inset-0" />
        <Icon className="pointer-events-none relative h-4 w-4 shrink-0 text-ink-3" />
        <span className={cn("pointer-events-none relative truncate text-sm font-semibold", active || focused ? "text-ink" : "text-ink-2")}>{title}</span>
        {count > 1 && (
          <kbd className="kbd pointer-events-none relative hidden lg:inline-flex" title={`Ctrl + Alt + ${at + 1} comes here`}>
            {at + 1}
          </kbd>
        )}
        {focused ? (
          <div className="relative ml-1">
            <FocusPill />
          </div>
        ) : tucked ? (
          <TuckedViews keys={tucked} />
        ) : null}
        <div className="relative ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => run({ type: "focus" }, index)} aria-label={focused ? "Show every view" : `Focus this ${what}`} title={focused ? "Show every view (Ctrl+Alt+Enter)" : "Focus: this view alone (Ctrl+Alt+Enter)"} className={barButton}>
            {focused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More for this ${what}`} title="Move, swap, copy its link" className={barButton}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="pop-surface w-60 p-1">
              <DropdownMenuItem disabled={at === 0} onClick={() => run({ type: "move", by: -1 }, index)}>
                <ArrowLeft className="text-ink-3" aria-hidden="true" /> Move left
                <DropdownMenuShortcut data-kbd-hint="">Ctrl+Alt+Shift+[</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={at === count - 1} onClick={() => run({ type: "move", by: 1 }, index)}>
                <ArrowRight className="text-ink-3" aria-hidden="true" /> Move right
                <DropdownMenuShortcut data-kbd-hint="">Ctrl+Alt+Shift+]</DropdownMenuShortcut>
              </DropdownMenuItem>
              {canSwapBeside(pane, pathname) && (
                <DropdownMenuItem onClick={() => run({ type: "swap" }, index)}>
                  <ArrowLeftRight className="text-ink-3" aria-hidden="true" /> Make it the main view
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => run({ type: "even" })}>
                <Columns3 className="text-ink-3" aria-hidden="true" /> Even out widths
                <DropdownMenuShortcut data-kbd-hint="">Ctrl+Alt+=</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={copyLink}>
                <Link2 className="text-ink-3" aria-hidden="true" /> Copy link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={close} aria-label={`Close this ${what}`} title="Close (Ctrl+Alt+W)" className={barButton}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* The page's address is the main view's: a pane never reads its link (FE-BUG-12). */}
        {seen && (
          <InSplitPaneContext.Provider value={true}>
            <PanelErrorBoundary resetKey={`${pane.kind}:${pane.id}`} onClose={close} closeLabel={`Close this ${what}`}>
              <PaneBody pane={pane} onClose={close} />
            </PanelErrorBoundary>
          </InSplitPaneContext.Provider>
        )}
      </div>
    </section>
  )
})
