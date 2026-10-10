"use client"

import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { SpotDocs, SpotTasks } from "@/components/ui/graphics"
import { PageContainer } from "@/components/ui/pageContainer"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { useCallback, useState } from "react"
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

  return (
    <SectionTabs
      // No "N due" on the tab: it arrived with the list and changed as items
      // were done, so Saved widened 45px and Done slid sideways under the
      // pointer. A due row says "Due" itself, and due rows come first.
      tabs={[
        { value: "open", label: "Saved" },
        { value: "done", label: "Done" },
      ]}
      value={tab}
      onValueChange={(v) => setTab(v === "done" ? "done" : "open")}
      icon={Bookmark}
      title="Later"
    >
      {/* Activity's column: start-aligned, 880px, the same inset, so the
          two pages a person moves between in the sidebar start their lists
          in one place. It was a centred 768px column. */}
      <div className="flex-1 overflow-y-auto">
        <PageContainer data-later-frame="" className="h-auto py-2">
          <LaterItems state={tab} />
        </PageContainer>
      </div>
    </SectionTabs>
  )
}

/** How long a removal waits for an Undo before it reaches the server. */
const UNDO_MS = 5000

export function LaterItems({ state }: { state: "open" | "done" }) {
  const { data, isLoading, isError, mutate } = useLaterList(state)
  const actions = useLaterActions()
  const { toast } = useToast()
  // Rows taken off the list the moment they're acted on, before the server
  // answers: marking done waited for the change and a refetch of both lists,
  // so the row sat there for two round trips. If the change fails, it comes
  // back (the request layer says why).
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const hide = useCallback((id: string, hidden: boolean) => {
    setGone((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const items = (data?.data.items ?? []).filter((i) => !gone.has(i.id))

  // Done can be taken back on the server, so it goes at once, with an Undo.
  const markDone = useCallback(
    (item: LaterItem) => {
      hide(item.id, true)
      actions.done(item.id, true).catch(() => hide(item.id, false))
      toast({
        title: "Marked done",
        description: item.title || undefined,
        action: (
          <ToastAction altText="Put it back in Saved" onClick={() => actions.done(item.id, false).finally(() => hide(item.id, false))}>
            Undo
          </ToastAction>
        ),
      })
    },
    [actions, hide, toast],
  )

  // Removing can't be, so it waits a few seconds behind the Undo.
  const remove = useCallback(
    (item: LaterItem) => {
      hide(item.id, true)
      let undone = false
      const send = setTimeout(() => {
        if (!undone) actions.remove(item.id).catch(() => hide(item.id, false))
      }, UNDO_MS)
      toast({
        title: "Removed from Later",
        description: item.title || undefined,
        action: (
          <ToastAction
            altText="Keep it"
            onClick={() => {
              undone = true
              clearTimeout(send)
              hide(item.id, false)
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    },
    [actions, hide, toast],
  )

  if (isLoading) {
    // The rows' own shape: a mark, a title and a line under it.
    return (
      <ul className="divide-y divide-border/60" role="status" aria-label="Loading Later">
        {[0, 1, 2].map((i) => (
          // A 20px title line and an 18px one under it, 2px apart, as in a
          // row: the bars were 16 and 12px, 6px apart, so every row grew 6px
          // when the list came.
          <li key={i} data-later-skeleton-row="" className="flex items-start gap-3 px-2 py-3">
            <Skeleton className="-mt-0.5 size-6 shrink-0 rounded-md" />
            <span className="flex-1">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="mt-0.5 h-[18px] w-1/3" />
            </span>
          </li>
        ))}
      </ul>
    )
  }
  // Saved and Done say "nothing here" and "that failed" in one frame and one
  // place, Activity's: anchored near the top of the list's space. Done said
  // it in one grey line where Saved had a drawing, a title and a sentence.
  if (isError || items.length === 0) {
    return (
      <div data-later-state="" className="flex justify-center pt-4 md:pt-10">
        {isError ? (
          <ErrorState subject="Later" onRetry={() => void mutate()} />
        ) : state === "open" ? (
          <EmptyState
            illustration={<SpotDocs />}
            title="Nothing saved for later"
            description="Use the bookmark on a message, task or doc to keep it here. Ask for a reminder and it comes back when you need it."
          />
        ) : (
          <EmptyState illustration={<SpotTasks />} title="Nothing done yet" description="Things you mark done appear here." />
        )}
      </div>
    )
  }
  // Rows, not a card of rows: the same hairlines as Activity and search.
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => (
        <LaterRow key={item.id} item={item} done={state === "done"} onDone={markDone} onRemove={remove} />
      ))}
    </ul>
  )
}

function LaterRow({ item, done, onDone, onRemove }: { item: LaterItem; done: boolean; onDone: (item: LaterItem) => void; onRemove: (item: LaterItem) => void }) {
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
    <li className="group relative flex items-start gap-3 rounded-md px-2 py-3 transition-colors duration-100 hover:bg-highlight">
      {/* The thing in its own hue, as everywhere else it appears. */}
      <IdentityMark variant="tile" size={24} id={item.item_id} icon={<Icon />} className="-mt-0.5" />
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
                "inline-flex items-center rounded-sm px-1.5 py-px font-medium tabular-nums",
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
            <RowButton label="Remove" onClick={() => onRemove(item)}>
              <Trash2 className="h-4 w-4" />
            </RowButton>
          </>
        ) : (
          <>
            <RowButton label="Mark done" onClick={() => onDone(item)}>
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
          // 44px to a finger, on a touch screen.
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-background [@media(pointer:coarse)]:size-11"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
