"use client"

import dynamic from "next/dynamic"
import { ArrowLeftRight, CheckSquare, FileText, FolderKanban, Hash, Maximize2, MessageSquare, Minimize2, Users, X } from "@/lib/icons"
import { useSplitActions } from "@/hooks/useSplitView"
import { cn } from "@/lib/utils/helpers/cn"
import type { Pane, PaneKind } from "@/lib/split"

// Each view loads only when it is first split, so the split costs nothing until used.
const Loading = () => <div className="h-full w-full animate-pulse bg-muted/30" />
const ChannelView = dynamic(() => import("@/components/views/ChannelView").then((m) => m.ChannelView), { loading: Loading })
const ChatView = dynamic(() => import("@/components/views/ChatView").then((m) => m.ChatView), { loading: Loading })
const GroupChatView = dynamic(() => import("@/components/views/GroupChatView").then((m) => m.GroupChatView), { loading: Loading })
const DocView = dynamic(() => import("@/components/views/DocView").then((m) => m.DocView), { loading: Loading })
const ProjectView = dynamic(() => import("@/components/views/ProjectView").then((m) => m.ProjectView), { loading: Loading })
const TaskInfoPanel = dynamic(() => import("@/components/rightPanel/taskInfoPanel"), { loading: Loading })

const KIND: Record<PaneKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  channel: { label: "Channel", icon: Hash },
  chat: { label: "Chat", icon: MessageSquare },
  group: { label: "Group chat", icon: Users },
  doc: { label: "Doc", icon: FileText },
  project: { label: "Project", icon: FolderKanban },
  task: { label: "Task", icon: CheckSquare },
}

function PaneBody({ pane }: { pane: Pane }) {
  switch (pane.kind) {
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
  "inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

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
        <kbd className="hidden rounded border border-border/70 px-1 font-mono text-3xs text-muted-foreground lg:inline" title={`Ctrl + Alt + ${index + 2} comes here`}>
          {index + 2}
        </kbd>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => run({ type: "focus" }, index)} aria-label={focused ? "Show every view" : `Focus this ${what}`} title={focused ? "Show every view (Ctrl+Alt+Enter)" : "Focus: this view alone (Ctrl+Alt+Enter)"} className={barButton}>
            {focused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => run({ type: "swap" }, index)} aria-label={`Make this ${what} the main view`} title="Swap with the main view (Ctrl+Alt+S)" className={barButton}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => run({ type: "close" }, index)} aria-label={`Close this ${what}`} title="Close (Ctrl+Alt+W)" className={barButton}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <PaneBody pane={pane} />
      </div>
    </section>
  )
}

/** While one view is focused: a quiet way back to all of them. */
export function FocusPill() {
  const run = useSplitActions()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
        <span>One view</span>
        <button type="button" onClick={() => run({ type: "focus" })} className="rounded-full px-2 py-0.5 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          Show all
        </button>
        <kbd className="rounded border border-border/70 px-1 font-mono text-3xs">Ctrl+Alt+Enter</kbd>
      </div>
    </div>
  )
}
