"use client"

import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import { useState } from "react"
import { SectionTabs } from "@/components/ui/sectionTabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Bookmark,
  Check,
  CircleCheck,
  ClipboardList,
  FileText,
  Hash,
  LayoutDashboard,
  MessageCircle,
  Trash2,
  Undo2,
} from "@/lib/icons"
import { useLaterActions, useLaterList } from "@/hooks/useLater"
import type { LaterItem } from "@/services/laterService"
import { reminderLabel } from "@/lib/utils/later"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"
import { SaveForLaterButton } from "@/components/later/SaveForLater"

const TYPE_ICON = {
  post: Hash,
  comment: MessageCircle,
  chat: MessageCircle,
  task: CircleCheck,
  doc: FileText,
  project: ClipboardList,
  board: LayoutDashboard,
} as const

/**
 * Later: what the member put aside to come back to. Anything whose reminder
 * has come is at the top, marked Due. Done items keep for a while under Done
 * so a mistaken tick can be undone.
 */
export function LaterPage() {
  const [tab, setTab] = useState<"open" | "done">("open")
  const open = useLaterList("open")
  const due = open.data?.data.due ?? 0

  return (
    <SectionTabs
      tabs={[
        { value: "open", label: "Saved", count: due > 0 ? `${due} due` : undefined },
        { value: "done", label: "Done" },
      ]}
      value={tab}
      onValueChange={(v) => setTab(v === "done" ? "done" : "open")}
      icon={Bookmark}
      title="Later"
    >
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6 md:py-6">
          <LaterItems state={tab} />
        </div>
      </div>
    </SectionTabs>
  )
}

function LaterItems({ state }: { state: "open" | "done" }) {
  const { data, isLoading, isError } = useLaterList(state)
  const items = data?.data.items ?? []

  if (isLoading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading Later">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (isError) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Later could not be loaded. Check your connection and try again.</p>
  }
  if (items.length === 0) {
    return state === "open" ? (
      <EmptyState
        tone="accent"
        className="py-16"
        title="Nothing saved for later"
        description="Use the bookmark on a message, task or doc to keep it here. Ask for a reminder and it comes back when you need it."
      />
    ) : (
      <p className="py-16 text-center text-sm text-muted-foreground">Things you mark done appear here.</p>
    )
  }
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
      {items.map((item) => (
        <LaterRow key={item.id} item={item} done={state === "done"} />
      ))}
    </ul>
  )
}

function LaterRow({ item, done }: { item: LaterItem; done: boolean }) {
  const actions = useLaterActions()
  const [busy, setBusy] = useState(false)
  const Icon = TYPE_ICON[item.item_type] ?? Bookmark
  const reminder = item.remind_at ? reminderLabel(new Date(item.remind_at), new Date()) : null

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      // Shown by the request layer.
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn("group relative flex items-start gap-3 px-4 py-3", reminder?.due && !done && "bg-warning/5")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          href={item.link}
          className={cn(
            "block truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded",
            done && "text-muted-foreground line-through decoration-muted-foreground/50",
          )}
        >
          {item.title || "Untitled"}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {item.context && <span className="truncate">{item.context}</span>}
          <span>{done && item.done_at ? `Done ${relativeTime(item.done_at)}` : `Saved ${relativeTime(item.created_at)}`}</span>
          {reminder && !done && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-px font-medium tabular-nums",
                reminder.due ? "bg-warning/15 text-warning-ink" : "bg-muted text-muted-foreground",
              )}
            >
              {reminder.text}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {done ? (
          <>
            <RowButton label="Put back in Saved" disabled={busy} onClick={() => act(() => actions.done(item.id, false))}>
              <Undo2 className="h-4 w-4" />
            </RowButton>
            <RowButton label="Remove" disabled={busy} onClick={() => act(() => actions.remove(item.id))}>
              <Trash2 className="h-4 w-4" />
            </RowButton>
          </>
        ) : (
          <>
            <RowButton label="Mark done" disabled={busy} onClick={() => act(() => actions.done(item.id, true))}>
              <Check className="h-4 w-4" />
            </RowButton>
            <SaveForLaterButton
              target={{ itemType: item.item_type, itemId: item.item_id, link: item.link, title: item.title, context: item.context }}
            />
          </>
        )}
      </div>
    </li>
  )
}

function RowButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
