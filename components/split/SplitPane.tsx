"use client"

import dynamic from "next/dynamic"
import { ArrowLeftRight, CheckSquare, FileText, FolderKanban, Hash, Maximize2, MessageSquare, Minimize2, Users, Video, X } from "@/lib/icons"
import { useSplitActions } from "@/hooks/useSplitView"
import { cn } from "@/lib/utils/helpers/cn"
import { isCallPane, type Pane, type PaneKind } from "@/lib/split"
import { PanelErrorBoundary } from "@/components/error/PanelErrorBoundary"

// Each view loads only when it is first split, so the split costs nothing until used.
const Loading = () => <div className="h-full w-full animate-pulse bg-muted/30" />
const ChannelView = dynamic(() => import("@/components/views/ChannelView").then((m) => m.ChannelView), { loading: Loading })
const ChatView = dynamic(() => import("@/components/views/ChatView").then((m) => m.ChatView), { loading: Loading })
const GroupChatView = dynamic(() => import("@/components/views/GroupChatView").then((m) => m.GroupChatView), { loading: Loading })
const DocView = dynamic(() => import("@/components/views/DocView").then((m) => m.DocView), { loading: Loading })
const ProjectView = dynamic(() => import("@/components/views/ProjectView").then((m) => m.ProjectView), { loading: Loading })
const TaskInfoPanel = dynamic(() => import("@/components/rightPanel/taskInfoPanel"), { loading: Loading })
// The call (LiveKit) is the heaviest view; it loads only when a call is opened beside.
const CallView = dynamic(() => import("@/components/livekit/CallView").then((m) => m.CallView), { loading: Loading })

const KIND: Record<PaneKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  channel: { label: "Channel", icon: Hash },
  chat: { label: "Chat", icon: MessageSquare },
  group: { label: "Group chat", icon: Users },
  doc: { label: "Doc", icon: FileText },
  project: { label: "Project", icon: FolderKanban },
  task: { label: "Task", icon: CheckSquare },
  "call-channel": { label: "Call", icon: Video },
  "call-chat": { label: "Call", icon: Video },
  "call-group": { label: "Call", icon: Video },
}

function PaneBody({ pane, onClose }: { pane: Pane; onClose: () => void }) {
  switch (pane.kind) {
    case "call-channel":
      return <CallView kind="channel" id={pane.id} onLeave={onClose} embedded />
    case "call-chat":
      return <CallView kind="chat" id={pane.id} onLeave={onClose} embedded />
    case "call-group":
      return <CallView kind="group" id={pane.id} onLeave={onClose} embedded />
    case "channel":
      return <ChannelView channelId={pane.id} />
    case "chat":
      return <ChatView chatId={pane.id} />
    case "group":
      return <GroupChatView grpId={pane.id} />
    case "doc":
      return <DocView docId={pane.id} />
    case "project":
      return <ProjectView projectId={pane.id} />
    case "task":
      return <TaskInfoPanel taskUUID={pane.id} />
  }
}

const barButton =
  "inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"

/**
 * One pane of the split view: the same channel, chat, doc, project or task
 * page as the main area, beside it, under a slim bar to focus it (alone, and
 * back), swap it with the main view, or close it. The bar of the view the
 * keys act on is marked.
 */
export function SplitPane({ pane, index, active, focused }: { pane: Pane; index: number; active: boolean; focused: boolean }) {
  const run = useSplitActions()
  const { label, icon: Icon } = KIND[pane.kind]
  const what = label.toLowerCase()
  return (
    <section
      aria-label={`${label}, side by side`}
      data-split-view={index}
      tabIndex={-1}
      className="flex h-full min-w-0 flex-col border-l border-border/60 bg-background outline-none"
    >
      <div
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors",
          active && "bg-accent/50 text-foreground shadow-[inset_0_2px_0_0_var(--primary)]",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <kbd className="hidden rounded border border-border/70 px-1 font-mono text-2xs text-muted-foreground lg:inline" title={`Ctrl + Alt + ${index + 2} comes here`}>
          {index + 2}
        </kbd>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => run({ type: "focus" }, index)} aria-label={focused ? "Show every view" : `Focus this ${what}`} title={focused ? "Show every view (Ctrl+Alt+Enter)" : "Focus: this view alone (Ctrl+Alt+Enter)"} className={barButton}>
            {focused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {!isCallPane(pane) && (
            <button type="button" onClick={() => run({ type: "swap" }, index)} aria-label={`Make this ${what} the main view`} title="Swap with the main view (Ctrl+Alt+S)" className={barButton}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => run({ type: "close" }, index)} aria-label={`Close this ${what}`} title="Close (Ctrl+Alt+W)" className={barButton}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <PanelErrorBoundary resetKey={`${pane.kind}:${pane.id}`} onClose={() => run({ type: "close" }, index)} closeLabel={`Close this ${what}`}>
          <PaneBody pane={pane} onClose={() => run({ type: "close" }, index)} />
        </PanelErrorBoundary>
      </div>
    </section>
  )
}
